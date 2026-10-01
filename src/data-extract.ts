import * as fs from 'fs';
import * as path from 'path';
import { getUrlHash, getUrlLabel, RunData, StatsData, IterationEntry } from './utils.js';
import { runsDir } from './config.js';
import { utcDayKey } from './dates.js';

/**
 * Average an array of numeric values, ignoring nulls.
 */
function avgValues(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v != null && !Number.isNaN(v));
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

/**
 * Average a group of runs recorded on the same UTC day into a single entry.
 * The latest timestamp that day is the representative timestamp, so decay
 * weighting still favours the most recent day.
 */
function averageGroup(group: IterationEntry[]): IterationEntry {
  if (group.length === 1) {
    return { ...group[0], sampleCount: 1 };
  }

  // Collect all category keys and metric keys
  const catKeys = new Set<string>();
  const metricKeys = new Set<string>();
  for (const entry of group) {
    for (const k of Object.keys(entry.categories)) catKeys.add(k);
    for (const k of Object.keys(entry.metrics)) metricKeys.add(k);
  }

  const avgCategories: Record<string, number | null> = {};
  for (const key of catKeys) {
    const vals = group.map((e) => e.categories[key]).filter((v) => v != null && !isNaN(v as number)) as number[];
    avgCategories[key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }

  const avgMetrics: Record<string, number | null> = {};
  for (const key of metricKeys) {
    avgMetrics[key] = avgValues(group.map((e) => e.metrics[key]));
  }

  // Use the last timestamp (end of the day's runs)
  const lastEntry = group[group.length - 1];

  return {
    iteration: group[0].iteration,
    timestamp: lastEntry.timestamp,
    fileName: lastEntry.fileName,
    categories: avgCategories,
    metrics: avgMetrics,
    runId: group[0].runId,
    sampleCount: group.length,
  };
}

/**
 * Collapse runs into one data point per UTC test day.
 *
 * Grouping used to be by `runId`, with a 30-minute proximity fallback for
 * legacy files. Day bucketing replaces both: it is the unit a reader thinks
 * in, it works identically for files with and without a `runId`, and it stops
 * a day with many runs from counting many times in the decay-weighted average.
 */
function groupAndAverage(entries: IterationEntry[]): IterationEntry[] {
  if (entries.length === 0) return [];

  const byDay = new Map<string, IterationEntry[]>();
  for (const entry of entries) {
    const day = utcDayKey(entry.timestamp);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(entry);
  }

  const result: IterationEntry[] = [];
  for (const group of byDay.values()) {
    // Order within the day so the representative timestamp really is the last.
    group.sort((a, b) => a.timestamp - b.timestamp);
    result.push(averageGroup(group));
  }

  result.sort((a, b) => a.timestamp - b.timestamp);
  return result;
}

export function extractDataFromReports(): StatsData {
  console.log('📂 Extracting data from JSON reports...');
  const extracted: StatsData = { runs: [], urls: {} };

  if (!fs.existsSync(runsDir)) {
    console.log('   No runs directory found, starting fresh.');
    return extracted;
  }

  const files = fs.readdirSync(runsDir).filter((f) => f.endsWith('.summary.json'));
  console.log(`   Found ${files.length} summary files.`);

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(runsDir, file), 'utf8');
      const summary = JSON.parse(content);

      const url = summary.url || '';
      let mode: string = summary.mode;
      if (!mode) {
        if (file.includes('-desktop-')) mode = 'desktop';
        else if (file.includes('-mobile-4g-')) mode = 'mobile-4g';
        else if (file.includes('-mobile-wifi-')) mode = 'mobile-wifi';
        else mode = 'mobile-4g'; // Sensible default for legacy mobile
      }

      // Validate and coerce categories and metrics to ensure required keys exist
      const rawCategories = summary.categories || {};
      const validatedCategories = {
        performance: typeof rawCategories.performance === 'number' ? rawCategories.performance : 0,
        accessibility: typeof rawCategories.accessibility === 'number' ? rawCategories.accessibility : 0,
        'best-practices': typeof rawCategories['best-practices'] === 'number' ? rawCategories['best-practices'] : 0,
        seo: typeof rawCategories.seo === 'number' ? rawCategories.seo : 0,
      };

      const rawMetrics = summary.metrics || {};
      const validatedMetrics: Record<string, number | null> = {};
      for (const [key, val] of Object.entries(rawMetrics)) {
        if (typeof val === 'number' || val === null) {
          validatedMetrics[key] = val;
        }
      }

      const categories = validatedCategories;
      const metrics = validatedMetrics;

      // Validate timestamp to prevent trend corruption
      if (!summary.timestamp || typeof summary.timestamp !== 'number' || !Number.isFinite(summary.timestamp) || summary.timestamp <= 0) {
        console.warn(`   ⚠️ Skipping ${file}: invalid or missing timestamp (${summary.timestamp})`);
        continue;
      }
      const timestamp = summary.timestamp;

      const runData: RunData = {
        id: summary.id || file.replace('.summary.json', ''),
        url,
        urlLabel: summary.urlLabel || getUrlLabel(url),
        mode,
        iteration: summary.iteration || 1,
        timestamp,
        fileName: summary.fileName || file.replace('.summary.json', '.json'),
        categories,
        metrics,
        ...(summary.runId != null ? { runId: summary.runId } : {}),
      };

      extracted.runs.push(runData);

      if (!extracted.urls[url]) {
        extracted.urls[url] = {
          label: summary.urlLabel || getUrlLabel(url),
          modes: {},
          modesRaw: {},
        };
      }

      const iterEntry: IterationEntry = {
        iteration: summary.iteration || 1,
        timestamp: runData.timestamp,
        fileName: runData.fileName,
        categories,
        metrics,
        ...(summary.runId != null ? { runId: summary.runId } : {}),
      };

      // Always add to raw arrays
      if (!extracted.urls[url].modesRaw[mode]) {
        extracted.urls[url].modesRaw[mode] = [];
      }
      extracted.urls[url].modesRaw[mode].push(iterEntry);
    } catch (err: any) {
      console.warn(`   ⚠️ Failed to parse ${file}: ${err.message}`);
    }
  }

  // Collapse runs into one data point per UTC test day. modesRaw and runs stay
  // per-run so the box plot and the raw registry keep run-level granularity.
  for (const url of Object.keys(extracted.urls)) {
    const urlData = extracted.urls[url];
    for (const m of Object.keys(urlData.modesRaw)) {
      urlData.modes[m] = groupAndAverage(urlData.modesRaw[m]);
    }
  }

  const totalRaw = Object.values(extracted.urls).reduce(
    (sum, u) => sum + Object.values(u.modesRaw).reduce((s, m) => s + m.length, 0), 0
  );
  const totalAveraged = Object.values(extracted.urls).reduce(
    (sum, u) => sum + Object.values(u.modes).reduce((s, m) => s + m.length, 0), 0
  );
  console.log(`   ✓ Extracted ${totalRaw} runs → ${totalAveraged} daily data points.`);
  return extracted;
}
