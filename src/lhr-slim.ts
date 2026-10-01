import * as fs from 'fs';
import * as path from 'path';
import { getUrlLabel } from './utils.js';

/**
 * Saved Lighthouse reports keep every scalar value so that new metrics can be
 * added or existing ones recomputed later, but drop bulk that is never read:
 *
 *  - images: the `screenshot-thumbnails` filmstrip (8 base64 JPEGs per report)
 *    and `fullPageScreenshot`. Nothing renders them; the dashboard only ever
 *    displays summary values.
 *  - prose: the `i18n` ICU message catalog (~51 KB per report, differs between
 *    Lighthouse versions only) plus each audit's `description`, `explanation`
 *    and `warnings`.
 *  - row data: every `details` object. Each metric is an audit scalar
 *    (`numericValue`), so all currently extracted metrics survive; what is lost
 *    is the ability to recompute a metric from raw request/DOM rows.
 *
 * A denylist is used rather than an allowlist so that scalar fields added by
 * future Lighthouse versions are retained automatically.
 */

const DROPPED_TOP_LEVEL_FIELDS = new Set(['i18n', 'fullPageScreenshot']);
const DROPPED_AUDIT_FIELDS = new Set(['description', 'explanation', 'warnings', 'id', 'details']);
const DROPPED_CATEGORY_FIELDS = new Set(['description', 'manualDescription']);

export const HTML_LHR_MARKER = 'window.__LIGHTHOUSE_JSON__ = ';

/** Every full Lighthouse report carries `i18n`; a slimmed one never does. */
export function isSlimLhr(lhr: any): boolean {
  return lhr != null && typeof lhr === 'object' && lhr.i18n === undefined;
}

/** Returns a new object; the input is not mutated. */
export function slimLhr(lhr: any): any {
  const slim: any = {};
  for (const [key, value] of Object.entries(lhr ?? {})) {
    if (DROPPED_TOP_LEVEL_FIELDS.has(key)) continue;
    slim[key] = value;
  }

  if (slim.audits && typeof slim.audits === 'object') {
    const audits: Record<string, any> = {};
    for (const [key, audit] of Object.entries(slim.audits as Record<string, any>)) {
      const stripped: Record<string, any> = {};
      for (const [field, value] of Object.entries(audit ?? {})) {
        if (DROPPED_AUDIT_FIELDS.has(field)) continue;
        stripped[field] = value;
      }
      audits[key] = stripped;
    }
    slim.audits = audits;
  }

  for (const key of ['categories', 'categoryGroups']) {
    const groups = slim[key];
    if (!groups || typeof groups !== 'object') continue;
    for (const [id, group] of Object.entries(groups as Record<string, any>)) {
      if (!group || typeof group !== 'object') continue;
      const stripped: Record<string, any> = {};
      for (const [field, value] of Object.entries(group)) {
        if (DROPPED_CATEGORY_FIELDS.has(field)) continue;
        stripped[field] = value;
      }
      groups[id] = stripped;
    }
  }

  return slim;
}

function safeGet(obj: any, key: string): any {
  return obj && obj[key] != null ? obj[key] : undefined;
}

export function extractCategories(lhr: any): Record<string, number> {
  return {
    performance: (safeGet(lhr.categories?.performance, 'score') ?? 0) * 100,
    accessibility: (safeGet(lhr.categories?.accessibility, 'score') ?? 0) * 100,
    'best-practices': (safeGet(lhr.categories?.['best-practices'], 'score') ?? 0) * 100,
    seo: (safeGet(lhr.categories?.seo, 'score') ?? 0) * 100,
  };
}

export function extractMetrics(lhr: any): Record<string, number | null> {
  return {
    fcp: safeGet(lhr.audits['first-contentful-paint'], 'numericValue') ?? null,
    lcp: safeGet(lhr.audits['largest-contentful-paint'], 'numericValue') ?? null,
    tbt: safeGet(lhr.audits['total-blocking-time'], 'numericValue') ?? null,
    cls: safeGet(lhr.audits['cumulative-layout-shift'], 'numericValue') ?? null,
    si: safeGet(lhr.audits['speed-index'], 'numericValue') ?? null,
    tti: safeGet(lhr.audits['interactive'], 'numericValue') ?? null,
    serverResponse: safeGet(lhr.audits['server-response-time'], 'numericValue') ?? null,
    domSize: safeGet(lhr.audits['dom-size-insight'], 'numericValue') ?? null,
    jsExecTime: safeGet(lhr.audits['bootup-time'], 'numericValue') ?? null,
    totalByteWeight: safeGet(lhr.audits['total-byte-weight'], 'numericValue') ?? null,
  };
}

export interface Summary {
  id: string;
  url: string;
  urlLabel: string;
  mode: string;
  iteration: number;
  timestamp: number;
  fileName: string;
  categories: Record<string, number>;
  metrics: Record<string, number | null>;
  runId?: number;
}

export function createSummary(
  url: string,
  urlHash: string,
  mode: string,
  timestamp: number,
  fileName: string,
  categories: Record<string, number>,
  metrics: Record<string, number | null>,
  iteration: number,
  runId?: number,
): Summary {
  return {
    id: `${urlHash}-${mode}-${timestamp}`,
    url,
    urlLabel: getUrlLabel(url),
    mode,
    iteration,
    timestamp,
    fileName,
    categories,
    metrics,
    ...(runId != null ? { runId } : {}),
  };
}

function formatBytes(bytes: number): string {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${bytes}B`;
}

/**
 * Rewrites every full Lighthouse JSON report in `runsDir` to its slimmed form.
 * Already-slim files are skipped, so this is safe to re-run.
 */
export function slimExistingRuns(runsDir: string): void {
  if (!fs.existsSync(runsDir)) {
    console.log(`   No runs directory at ${runsDir}, nothing to slim.`);
    return;
  }

  const files = fs
    .readdirSync(runsDir)
    .filter((f) => f.endsWith('.json') && !f.endsWith('.summary.json'));

  let slimmed = 0;
  let skipped = 0;
  let failed = 0;
  let before = 0;
  let after = 0;

  for (const file of files) {
    const filePath = path.join(runsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    before += Buffer.byteLength(content);

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (err: any) {
      console.warn(`   ⚠️ Skipping ${file}: not valid JSON (${err.message})`);
      failed++;
      continue;
    }

    if (isSlimLhr(parsed)) {
      after += Buffer.byteLength(content);
      skipped++;
      continue;
    }

    const output = JSON.stringify(slimLhr(parsed), null, 2);
    fs.writeFileSync(filePath, output);
    after += Buffer.byteLength(output);
    slimmed++;
  }

  console.log(
    `   Slimmed ${slimmed} report(s), skipped ${skipped} already slim, ${failed} unreadable.`,
  );
  console.log(`   Runs on disk: ${formatBytes(before)} → ${formatBytes(after)}`);
}

interface EmbeddedLhr {
  start: number;
  end: number;
  json: string;
}

/**
 * Locates the `window.__LIGHTHOUSE_JSON__ = {...}` object literal in a
 * Lighthouse HTML report by brace matching, honouring string literals.
 */
function findEmbeddedLhr(html: string): EmbeddedLhr | null {
  const markerAt = html.indexOf(HTML_LHR_MARKER);
  if (markerAt < 0) return null;

  const start = markerAt + HTML_LHR_MARKER.length;
  if (html[start] !== '{') return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < html.length; i++) {
    const char = html[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) return { start, end: i + 1, json: html.slice(start, i + 1) };
    }
  }

  return null;
}

export interface HtmlSlimResult {
  html: string;
  changed: boolean;
  ok: boolean;
  reason?: string;
}

/**
 * Applies the same slimming rules to a Lighthouse HTML report by rewriting the
 * LHR embedded in it. The report stays valid and viewable; only the payload
 * shrinks. The rewrite is validated by re-parsing the re-embedded JSON, and the
 * original is returned unchanged if anything fails.
 */
export function slimHtmlReport(html: string): HtmlSlimResult {
  const embedded = findEmbeddedLhr(html);
  if (!embedded) {
    return { html, changed: false, ok: true, reason: 'no embedded LHR' };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(embedded.json);
  } catch (err: any) {
    return { html, changed: false, ok: false, reason: `embedded LHR is not valid JSON: ${err.message}` };
  }

  if (isSlimLhr(parsed)) {
    return { html, changed: false, ok: true, reason: 'already slim' };
  }

  const output = html.slice(0, embedded.start) + JSON.stringify(slimLhr(parsed)) + html.slice(embedded.end);

  const verify = findEmbeddedLhr(output);
  if (!verify) {
    return { html, changed: false, ok: false, reason: 're-embedded LHR could not be located' };
  }
  try {
    JSON.parse(verify.json);
  } catch (err: any) {
    return { html, changed: false, ok: false, reason: `re-embedded LHR is not valid JSON: ${err.message}` };
  }

  if (output.length >= html.length) {
    return { html, changed: false, ok: false, reason: 'rewrite did not reduce size' };
  }

  return { html: output, changed: true, ok: true };
}

export function slimHtmlReports(htmlDir: string): void {
  if (!fs.existsSync(htmlDir)) {
    console.log(`   No HTML backup directory at ${htmlDir}, nothing to slim.`);
    return;
  }

  const files = fs.readdirSync(htmlDir).filter((f) => f.endsWith('.html'));
  let slimmed = 0;
  let skipped = 0;
  let failed = 0;
  let before = 0;
  let after = 0;

  for (const file of files) {
    const filePath = path.join(htmlDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    before += Buffer.byteLength(content);

    const result = slimHtmlReport(content);
    if (!result.ok) {
      console.warn(`   ⚠️ Leaving ${file} untouched: ${result.reason}`);
      failed++;
      continue;
    }
    if (!result.changed) {
      after += Buffer.byteLength(content);
      skipped++;
      continue;
    }

    fs.writeFileSync(filePath, result.html);
    after += Buffer.byteLength(result.html);
    slimmed++;
  }

  console.log(`   Slimmed ${slimmed} HTML report(s), skipped ${skipped} already slim, ${failed} left untouched.`);
  console.log(`   HTML reports on disk: ${formatBytes(before)} → ${formatBytes(after)}`);
}

/**
 * Legacy HTML reports predate the `.summary.json` sidecar, so the dashboard and
 * Excel exports have never seen them. The LHR embedded in each one still
 * carries the category scores and metric values, so a summary can be rebuilt
 * from it. No `runId` is emitted, which is exactly what the extractor expects:
 * `groupAndAverage` falls back to grouping these by a 30-minute timestamp gap.
 */
export function synthesizeSummariesFromHtml(htmlDir: string, runsDir: string): void {
  if (!fs.existsSync(htmlDir)) {
    console.log(`   No HTML backup directory at ${htmlDir}, no summaries to synthesize.`);
    return;
  }
  fs.mkdirSync(runsDir, { recursive: true });

  const files = fs.readdirSync(htmlDir).filter((f) => f.endsWith('.html'));
  let created = 0;
  let existing = 0;
  let failed = 0;

  for (const file of files) {
    const nameMatch = /^([0-9a-f]{8})-([a-z0-9-]+)-(\d{13})\.html$/.exec(file);
    if (!nameMatch) {
      console.warn(`   ⚠️ Skipping ${file}: filename does not match <hash>-<mode>-<timestamp>.html`);
      failed++;
      continue;
    }
    const [, urlHash, rawMode, timestampRaw] = nameMatch;
    const timestamp = Number(timestampRaw);

    const targetName = `${urlHash}-${rawMode}-${timestampRaw}.summary.json`;
    const targetPath = path.join(runsDir, targetName);
    if (fs.existsSync(targetPath)) {
      existing++;
      continue;
    }

    const content = fs.readFileSync(path.join(htmlDir, file), 'utf8');
    const embedded = findEmbeddedLhr(content);
    if (!embedded) {
      console.warn(`   ⚠️ Skipping ${file}: no embedded LHR found`);
      failed++;
      continue;
    }

    let lhr: any;
    try {
      lhr = JSON.parse(embedded.json);
    } catch (err: any) {
      console.warn(`   ⚠️ Skipping ${file}: embedded LHR is not valid JSON (${err.message})`);
      failed++;
      continue;
    }

    const url = lhr.requestedUrl || lhr.mainDocumentUrl || '';
    if (!url) {
      console.warn(`   ⚠️ Skipping ${file}: no requestedUrl in embedded LHR`);
      failed++;
      continue;
    }

    // Legacy filenames use a bare `mobile` mode, which is not one of the
    // current emulation names. Map it the same way the extractor's own
    // legacy fallback does, so these runs join the existing mobile-4g series
    // instead of forming a sparse series of their own.
    const mode = rawMode === 'mobile' ? 'mobile-4g' : rawMode;

    const summary = createSummary(
      url,
      urlHash,
      mode,
      timestamp,
      file,
      extractCategories(lhr),
      extractMetrics(lhr),
      1,
    );

    fs.writeFileSync(targetPath, JSON.stringify(summary, null, 2));
    created++;
  }

  console.log(`   Created ${created} summary file(s) in ${runsDir}`);
  console.log(`   Left ${existing} existing summary file(s) untouched, skipped ${failed} unusable report(s).`);
}
