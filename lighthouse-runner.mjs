#!/usr/bin/env node
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/config.ts
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
var __filename, __dirname, loadedUrls, config, runsDir, dataPath, args;
var init_config = __esm({
  "src/config.ts"() {
    "use strict";
    __filename = fileURLToPath(import.meta.url);
    __dirname = path.dirname(__filename);
    loadedUrls = [];
    try {
      const urlsPath = path.resolve(__dirname, "urls.json");
      loadedUrls = JSON.parse(fs.readFileSync(urlsPath, "utf8"));
    } catch {
      try {
        loadedUrls = JSON.parse(fs.readFileSync("./urls.json", "utf8"));
      } catch {
        console.error(
          "\u274C Fatal: Could not load urls.json. Please create it with an array of URLs."
        );
        process.exit(1);
      }
    }
    config = {
      urls: loadedUrls,
      iterations: 3,
      delay: 3,
      baseDir: "./reports",
      reportSubDir: "runs",
      dataFile: "persistent_stats.json",
      emulations: ["mobile-4g", "mobile-wifi", "desktop"]
    };
    runsDir = path.join(config.baseDir, config.reportSubDir);
    if (!fs.existsSync(runsDir)) {
      fs.mkdirSync(runsDir, { recursive: true });
    }
    dataPath = path.join(config.baseDir, config.dataFile);
    args = process.argv.slice(2).reduce(
      (acc, arg, i, arr) => {
        if (arg === "--run" && arr[i + 1] !== void 0) {
          const val = parseInt(arr[i + 1], 10);
          if (!isNaN(val)) acc.runIterations = val;
        }
        if (arg === "--compress") acc.compress = true;
        if (arg === "--quality" && arr[i + 1] !== void 0) {
          const val = parseInt(arr[i + 1], 10);
          if (!isNaN(val) && val >= 1 && val <= 100) acc.quality = val;
        }
        return acc;
      },
      { runIterations: void 0, compress: false, quality: 30 }
    );
  }
});

// src/utils.ts
import * as crypto from "crypto";
function getUrlHash(url) {
  return crypto.createHash("md5").update(url).digest("hex").slice(0, 8);
}
function getUrlLabel(url) {
  try {
    const u = new URL(url);
    return u.host + u.pathname + u.search;
  } catch {
    return url;
  }
}
var sleep;
var init_utils = __esm({
  "src/utils.ts"() {
    "use strict";
    sleep = (ms) => new Promise((resolve2) => setTimeout(resolve2, ms));
  }
});

// src/data-extract.ts
import * as fs2 from "fs";
import * as path2 from "path";
function avgValues(values) {
  const valid = values.filter((v) => v != null && !isNaN(v));
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}
function averageGroup(group) {
  if (group.length === 1) {
    return { ...group[0], iterationCount: 1 };
  }
  const catKeys = /* @__PURE__ */ new Set();
  const metricKeys = /* @__PURE__ */ new Set();
  for (const entry of group) {
    for (const k of Object.keys(entry.categories)) catKeys.add(k);
    for (const k of Object.keys(entry.metrics)) metricKeys.add(k);
  }
  const avgCategories = {};
  for (const key of catKeys) {
    const vals = group.map((e) => e.categories[key]).filter((v) => v != null && !isNaN(v));
    avgCategories[key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }
  const avgMetrics = {};
  for (const key of metricKeys) {
    avgMetrics[key] = avgValues(group.map((e) => e.metrics[key]));
  }
  const lastEntry = group.reduce((a, b) => a.timestamp > b.timestamp ? a : b);
  return {
    iteration: 1,
    timestamp: lastEntry.timestamp,
    fileName: lastEntry.fileName,
    categories: avgCategories,
    metrics: avgMetrics,
    runId: group[0].runId,
    iterationCount: group.length
  };
}
function groupAndAverage(entries) {
  if (entries.length === 0) return [];
  const withRunId = [];
  const withoutRunId = [];
  for (const entry of entries) {
    if (entry.runId != null) {
      withRunId.push(entry);
    } else {
      withoutRunId.push(entry);
    }
  }
  const result = [];
  const runIdGroups = /* @__PURE__ */ new Map();
  for (const entry of withRunId) {
    const key = entry.runId;
    if (!runIdGroups.has(key)) runIdGroups.set(key, []);
    runIdGroups.get(key).push(entry);
  }
  for (const group of runIdGroups.values()) {
    result.push(averageGroup(group));
  }
  if (withoutRunId.length > 0) {
    withoutRunId.sort((a, b) => a.timestamp - b.timestamp);
    let currentGroup = [withoutRunId[0]];
    for (let i = 1; i < withoutRunId.length; i++) {
      const gap = withoutRunId[i].timestamp - withoutRunId[i - 1].timestamp;
      if (gap > LEGACY_GROUP_GAP_MS) {
        result.push(averageGroup(currentGroup));
        currentGroup = [withoutRunId[i]];
      } else {
        currentGroup.push(withoutRunId[i]);
      }
    }
    result.push(averageGroup(currentGroup));
  }
  result.sort((a, b) => a.timestamp - b.timestamp);
  return result;
}
function extractDataFromReports() {
  console.log("\u{1F4C2} Extracting data from JSON reports...");
  const extracted = { runs: [], urls: {} };
  if (!fs2.existsSync(runsDir)) {
    console.log("   No runs directory found, starting fresh.");
    return extracted;
  }
  const files = fs2.readdirSync(runsDir).filter((f) => f.endsWith(".summary.json"));
  console.log(`   Found ${files.length} summary files.`);
  for (const file of files) {
    try {
      const content = fs2.readFileSync(path2.join(runsDir, file), "utf8");
      const summary = JSON.parse(content);
      const url = summary.url || "";
      const urlHash = getUrlHash(url);
      const mode = summary.mode || (file.includes("-desktop-") ? "desktop" : "mobile");
      const categories = summary.categories || {};
      const metrics = summary.metrics || {};
      const runData = {
        id: summary.id || file.replace(".summary.json", ""),
        url,
        urlLabel: summary.urlLabel || getUrlLabel(url),
        mode,
        iteration: 1,
        timestamp: summary.timestamp || Date.now(),
        fileName: summary.fileName || file.replace(".summary.json", ".json"),
        categories,
        metrics,
        ...summary.runId != null ? { runId: summary.runId } : {}
      };
      extracted.runs.push(runData);
      if (!extracted.urls[url]) {
        extracted.urls[url] = {
          label: summary.urlLabel || getUrlLabel(url),
          modes: {},
          modesRaw: {}
        };
      }
      const iterEntry = {
        iteration: 1,
        timestamp: runData.timestamp,
        fileName: runData.fileName,
        categories,
        metrics,
        ...summary.runId != null ? { runId: summary.runId } : {}
      };
      if (!extracted.urls[url].modesRaw[mode]) {
        extracted.urls[url].modesRaw[mode] = [];
      }
      extracted.urls[url].modesRaw[mode].push(iterEntry);
    } catch (err) {
      console.warn(`   \u26A0\uFE0F Failed to parse ${file}: ${err.message}`);
    }
  }
  for (const url of Object.keys(extracted.urls)) {
    const urlData = extracted.urls[url];
    for (const m of Object.keys(urlData.modesRaw)) {
      urlData.modes[m] = groupAndAverage(urlData.modesRaw[m]);
    }
  }
  const totalRaw = Object.values(extracted.urls).reduce(
    (sum, u) => sum + Object.values(u.modesRaw).reduce((s, m) => s + m.length, 0),
    0
  );
  const totalAveraged = Object.values(extracted.urls).reduce(
    (sum, u) => sum + Object.values(u.modes).reduce((s, m) => s + m.length, 0),
    0
  );
  console.log(`   \u2713 Extracted ${totalRaw} iterations \u2192 ${totalAveraged} averaged run data points.`);
  return extracted;
}
var LEGACY_GROUP_GAP_MS;
var init_data_extract = __esm({
  "src/data-extract.ts"() {
    "use strict";
    init_utils();
    init_config();
    LEGACY_GROUP_GAP_MS = 30 * 60 * 1e3;
  }
});

// src/compression.ts
import * as fs3 from "fs";
import * as path3 from "path";
import { execFileSync } from "child_process";
import * as os from "os";
function compressReportImages(filePath, quality = 30) {
  let content = fs3.readFileSync(filePath, "utf8");
  const originalSize = Buffer.byteLength(content, "utf8");
  const imgRegex = /data:image\/(jpeg|png|webp);base64,([^"\s>}\]]+)/g;
  let match;
  let imagesProcessed = 0;
  const replacements = [];
  while ((match = imgRegex.exec(content)) !== null) {
    const [fullMatch, imgType, b64Data] = match;
    try {
      const inputBuf = Buffer.from(b64Data, "base64");
      if (imgType === "webp" && inputBuf.length < 50 * 1024) {
        continue;
      }
      const uid = `${Date.now()}_${imagesProcessed}`;
      const ext = imgType === "jpeg" ? "jpg" : imgType;
      const tmpIn = path3.join(os.tmpdir(), `lhr_img_${uid}.${ext}`);
      const tmpOut = path3.join(os.tmpdir(), `lhr_img_${uid}.webp`);
      const useQuality = imgType === "webp" ? Math.min(quality * 2, 80) : quality;
      fs3.writeFileSync(tmpIn, inputBuf);
      execFileSync("convert", [tmpIn, "-quality", String(useQuality), tmpOut], {
        timeout: 15e3
      });
      const outputBuf = fs3.readFileSync(tmpOut);
      if (outputBuf.length < inputBuf.length) {
        const newB64 = outputBuf.toString("base64");
        replacements.push({
          original: fullMatch,
          replacement: `data:image/webp;base64,${newB64}`
        });
        imagesProcessed++;
      }
      try {
        fs3.unlinkSync(tmpIn);
      } catch {
      }
      try {
        fs3.unlinkSync(tmpOut);
      } catch {
      }
    } catch {
    }
  }
  for (const { original, replacement } of replacements) {
    content = content.replace(original, replacement);
  }
  fs3.writeFileSync(filePath, content);
  const compressedSize = Buffer.byteLength(content, "utf8");
  return { originalSize, compressedSize, imagesProcessed };
}
function compressAllReports(quality) {
  const files = fs3.readdirSync(runsDir).filter((f) => f.endsWith(".html"));
  console.log(
    `
\u{1F5DC}\uFE0F  Compressing ${files.length} HTML reports (WebP quality: ${quality})...`
  );
  let totalOriginal = 0;
  let totalCompressed = 0;
  let totalImages = 0;
  let skipped = 0;
  for (const file of files) {
    const filePath = path3.join(runsDir, file);
    const content = fs3.readFileSync(filePath, "utf8");
    const hasNonWebp = /data:image\/(jpeg|png);base64,/.test(content);
    const hasLargeWebp = /data:image\/webp;base64,([^"\s>}]{68000,})/.test(content);
    if (!hasNonWebp && !hasLargeWebp) {
      skipped++;
      continue;
    }
    const result = compressReportImages(filePath, quality);
    totalOriginal += result.originalSize;
    totalCompressed += result.compressedSize;
    totalImages += result.imagesProcessed;
    const saved = ((1 - result.compressedSize / result.originalSize) * 100).toFixed(0);
    console.log(
      `   \u2713 ${file}: ${(result.originalSize / 1024).toFixed(0)}KB \u2192 ${(result.compressedSize / 1024).toFixed(0)}KB (-${saved}%, ${result.imagesProcessed} images)`
    );
  }
  const totalSaved = totalOriginal > 0 ? ((1 - totalCompressed / totalOriginal) * 100).toFixed(0) : 0;
  console.log(`
\u{1F4CA} Compression summary:`);
  console.log(
    `   Files processed: ${files.length - skipped} (${skipped} already compressed)`
  );
  console.log(`   Images converted: ${totalImages}`);
  if (totalOriginal > 0) {
    console.log(
      `   Total: ${(totalOriginal / 1024 / 1024).toFixed(1)}MB \u2192 ${(totalCompressed / 1024 / 1024).toFixed(1)}MB (-${totalSaved}%)`
    );
  }
}
var init_compression = __esm({
  "src/compression.ts"() {
    "use strict";
    init_config();
  }
});

// src/lighthouse.ts
import * as fs4 from "fs";
import * as path4 from "path";
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";
import * as chromeLauncher from "chrome-launcher";
function safeGet(obj, key) {
  return obj && obj[key] != null ? obj[key] : void 0;
}
function stripScreenshots(lhr) {
  const cleaned = JSON.parse(JSON.stringify(lhr));
  delete cleaned.fullPageScreenshot;
  if (cleaned.audits) {
    for (const [key, audit] of Object.entries(cleaned.audits)) {
      const a = audit;
      if (a.details && a.details.type === "screenshot") {
        delete cleaned.audits[key];
      }
    }
  }
  return cleaned;
}
function createSummary(url, urlHash, mode, timestamp, fileName, categories, metrics, runId) {
  return {
    id: `${urlHash}-${mode}-${timestamp}`,
    url,
    urlLabel: getUrlLabel(url),
    mode,
    timestamp,
    fileName,
    categories,
    metrics,
    ...runId != null ? { runId } : {}
  };
}
async function runLighthouse(url, iteration, mode, runId) {
  const chrome = await chromeLauncher.launch({
    chromePath: "chromium",
    chromeFlags: ["--headless", "--no-sandbox", "--disable-gpu"]
  });
  const isDesktop = mode === "desktop";
  const isWifi = mode === "mobile-wifi";
  const isThrottled = mode === "mobile-4g";
  const options = {
    logLevel: "info",
    output: "json",
    port: chrome.port,
    formFactor: isDesktop ? "desktop" : "mobile",
    // screenEmulation handled by config, but we can override here if needed
    throttlingMethod: isDesktop || isWifi ? "provided" : "simulate"
  };
  let configObj = void 0;
  if (isDesktop) {
    configObj = {
      ...desktopConfig,
      settings: {
        ...desktopConfig.settings,
        throttlingMethod: "provided"
      }
    };
  }
  const urlHash = getUrlHash(url);
  console.log(`
\u{1F680} [${mode.toUpperCase()}] Audit: ${url} (ID: ${urlHash})`);
  try {
    const runnerResult = await lighthouse(url, options, configObj);
    if (!runnerResult) {
      throw new Error("Lighthouse returned no result");
    }
    const lhr = runnerResult.lhr;
    const categories = {
      performance: (safeGet(lhr.categories.performance, "score") || 0) * 100,
      accessibility: (safeGet(lhr.categories.accessibility, "score") || 0) * 100,
      "best-practices": (safeGet(lhr.categories["best-practices"], "score") || 0) * 100,
      seo: (safeGet(lhr.categories.seo, "score") || 0) * 100
    };
    const keyMetrics = {
      fcp: safeGet(lhr.audits["first-contentful-paint"], "numericValue") || null,
      lcp: safeGet(lhr.audits["largest-contentful-paint"], "numericValue") || null,
      tbt: safeGet(lhr.audits["total-blocking-time"], "numericValue") || null,
      cls: safeGet(lhr.audits["cumulative-layout-shift"], "numericValue") || null,
      si: safeGet(lhr.audits["speed-index"], "numericValue") || null,
      tti: safeGet(lhr.audits["interactive"], "numericValue") || null,
      fid: safeGet(lhr.audits["max-potential-fid"], "numericValue") || null,
      inp: safeGet(lhr.audits["interaction-to-next-paint"], "numericValue") || null,
      fcp1: safeGet(lhr.audits["first-contentful-paint-1"], "numericValue") || null,
      lcp1: safeGet(lhr.audits["largest-contentful-paint-1"], "numericValue") || null,
      lcpLate: safeGet(lhr.audits["lcp-largest-contentful-paint"], "numericValue") || null,
      fcpL: safeGet(lhr.audits["first-contentful-paint-1"], "numericValue") || null,
      serverResponse: safeGet(lhr.audits["server-response-time"], "numericValue") || null,
      domSize: safeGet(lhr.audits["dom-size"], "numericValue") || null,
      mainThreadWork: safeGet(lhr.audits["mainthread-work-breakdown"], "numericValue") || null,
      jsExecTime: safeGet(lhr.audits["runtime-external-javascript"], "numericValue") || null,
      networkRequests: safeGet(lhr.audits["network-requests"], "numericValue") || null,
      totalByteWeight: safeGet(lhr.audits["network-summary"], "numericValue") || null
    };
    const metrics = keyMetrics;
    const timestamp = Date.now();
    const fileName = `${urlHash}-${mode}-${timestamp}.json`;
    const runData = {
      id: `${urlHash}-${mode}-${timestamp}`,
      url,
      urlLabel: getUrlLabel(url),
      mode,
      iteration,
      timestamp,
      fileName,
      categories,
      metrics,
      ...runId != null ? { runId } : {}
    };
    statsData.runs.push(runData);
    if (!statsData.urls[url]) {
      statsData.urls[url] = {
        label: getUrlLabel(url),
        modes: {},
        modesRaw: {}
      };
    }
    if (!statsData.urls[url].modesRaw[mode]) {
      statsData.urls[url].modesRaw[mode] = [];
    }
    statsData.urls[url].modesRaw[mode].push({
      iteration,
      timestamp,
      fileName,
      categories,
      metrics,
      ...runId != null ? { runId } : {}
    });
    const reportFilePath = path4.join(runsDir, fileName);
    const cleanedLhr = stripScreenshots(lhr);
    fs4.writeFileSync(reportFilePath, JSON.stringify(cleanedLhr, null, 2));
    const summary = createSummary(url, urlHash, mode, timestamp, fileName, categories, metrics, runId);
    const summaryPath = path4.join(runsDir, `${urlHash}-${mode}-${timestamp}.summary.json`);
    fs4.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    fs4.writeFileSync(dataPath, JSON.stringify(statsData, null, 2));
    console.log(
      `\u2705 Perf: ${categories.performance.toFixed(0)} | FCP: ${((metrics.fcp || 0) / 1e3).toFixed(2)}s | LCP: ${((metrics.lcp || 0) / 1e3).toFixed(2)}s | TBT: ${metrics.tbt || "-"}ms | Saved: ${fileName}`
    );
  } catch (error) {
    console.error(`\u274C Failed to audit ${url}:`, error.message);
  } finally {
    await chrome.kill();
  }
}
var statsData;
var init_lighthouse = __esm({
  "src/lighthouse.ts"() {
    "use strict";
    init_utils();
    init_config();
    statsData = { runs: [], urls: {} };
  }
});

// src/dashboard/styles.ts
var styles;
var init_styles = __esm({
  "src/dashboard/styles.ts"() {
    "use strict";
    styles = String.raw`:root {
  --bg-deep: hsl(220, 15%, 8%);
  --bg-surface: hsl(220, 15%, 12%);
  --bg-card: hsla(220, 15%, 16%, 0.6);
  --border: hsla(220, 15%, 25%, 0.4);
  --text-main: hsl(220, 10%, 95%);
  --text-dim: hsl(220, 10%, 70%);
  --accent: hsl(210, 100%, 55%);
  --accent-glow: hsla(210, 100%, 55%, 0.3);
  --success: hsl(150, 60%, 45%);
  --warning: hsl(40, 90%, 50%);
  --danger: hsl(0, 80%, 55%);
  --sidebar-width: 280px;
  --glass: blur(12px) saturate(180%);
  --chart-bg: hsla(210, 100%, 55%, 0.1);
}

.light-mode {
  --bg-deep: hsl(220, 20%, 97%);
  --bg-surface: hsl(220, 20%, 92%);
  --bg-card: hsla(220, 20%, 100%, 0.8);
  --border: hsla(220, 15%, 80%, 0.5);
  --text-main: hsl(220, 20%, 15%);
  --text-dim: hsl(220, 15%, 45%);
  --accent: hsl(210, 100%, 45%);
  --accent-glow: hsla(210, 100%, 45%, 0.15);
  --chart-bg: hsla(210, 100%, 45%, 0.05);
}

* { margin: 0; padding: 0; box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  background: var(--bg-deep);
  color: var(--text-main);
  overflow-x: hidden;
  display: flex;
  transition: background 0.3s ease, color 0.3s ease;
}

.sidebar {
  width: var(--sidebar-width);
  height: 100vh;
  background: var(--bg-surface);
  border-right: 1px solid var(--border);
  padding: 2.5rem 1.5rem;
  position: fixed;
  display: flex;
  flex-direction: column;
  z-index: 100;
}

.logo {
  font-family: 'Outfit', sans-serif;
  font-size: 1.6rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--accent);
  margin-bottom: 2.5rem;
  letter-spacing: -0.5px;
}

.nav-links {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.nav-item {
  padding: 0.8rem 1.2rem;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  color: var(--text-dim);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  text-decoration: none;
  font-size: 0.95rem;
}

.nav-item:hover {
  color: var(--text-main);
  background: hsla(220, 15%, 50%, 0.1);
  transform: translateX(4px);
}

.nav-item.active {
  color: white;
  background: var(--accent);
  box-shadow: 0 4px 15px var(--accent-glow);
}

.theme-toggle {
  margin-top: auto;
  padding: 1.5rem 0 0.5rem;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--text-dim);
  font-size: 0.9rem;
  font-weight: 600;
}

#themeBtn {
  background: var(--accent);
  border: none;
  color: white;
  padding: 8px 16px;
  border-radius: 20px;
  cursor: pointer;
  font-weight: 700;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 4px 12px var(--accent-glow);
}

#themeBtn:hover {
  transform: scale(1.05);
  filter: brightness(1.1);
}

main {
  margin-left: var(--sidebar-width);
  padding: 4rem 5rem;
  width: 100%;
  max-width: 1400px;
}

header {
  margin-bottom: 5rem;
  border-bottom: 2px solid var(--accent);
  padding-bottom: 2.5rem;
}

.header-info h1 {
  font-family: 'Outfit', sans-serif;
  font-size: 3.5rem;
  font-weight: 800;
  margin-bottom: 0.75rem;
  letter-spacing: -1.5px;
}

.header-info p {
  color: var(--text-dim);
  font-size: 1.2rem;
  max-width: 700px;
  line-height: 1.6;
}

section {
  margin-bottom: 12rem;
  scroll-margin-top: 4rem;
}

.section-header {
  margin-bottom: 4rem;
}

.section-header h2 {
  font-family: 'Outfit', sans-serif;
  font-size: 2.5rem;
  margin-bottom: 1.25rem;
  color: var(--text-main);
  position: relative;
  display: inline-block;
}

.section-header h2::after {
  content: '';
  position: absolute;
  left: 0;
  bottom: -8px;
  width: 60px;
  height: 4px;
  background: var(--accent);
  border-radius: 2px;
}

.section-header p {
  color: var(--text-dim);
  font-size: 1.1rem;
  line-height: 1.5;
  max-width: 850px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 2rem;
  margin-bottom: 5rem;
}

.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 24px;
  padding: 2.5rem;
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.card:hover {
  transform: translateY(-8px);
  box-shadow: 0 30px 60px rgba(0,0,0,0.3);
  border-color: var(--accent);
}

.stat-card .label {
  color: var(--text-dim);
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 2px;
  margin-bottom: 1rem;
  font-weight: 800;
}

.stat-card .value {
  font-size: 3.5rem;
  font-weight: 800;
  font-family: 'Outfit', sans-serif;
  color: var(--text-main);
  line-height: 1;
}

.stat-card .trend {
  margin-top: 1rem;
  font-size: 0.95rem;
  color: var(--accent);
  font-weight: 600;
}

.chart-container {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 28px;
  padding: 3rem;
  margin-bottom: 3.5rem;
}

.chart-header {
  margin-bottom: 3rem;
}

.chart-header h3 {
  font-family: 'Outfit', sans-serif;
  font-size: 1.8rem;
  margin-bottom: 0.75rem;
  color: var(--text-main);
}

.chart-header p {
  font-size: 1rem;
  color: var(--text-dim);
  max-width: 800px;
}

.chart-box {
  position: relative;
  height: 600px;
}

.table-container {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 28px;
  padding: 2rem;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0,0,0,0.1);
}

table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 0.95rem;
}

th {
  text-align: left;
  padding: 1.5rem 1rem;
  color: var(--text-dim);
  font-weight: 800;
  text-transform: uppercase;
  font-size: 0.8rem;
  letter-spacing: 1.5px;
  border-bottom: 2px solid var(--border);
}

td {
  padding: 1.5rem 1rem;
  border-bottom: 1px solid var(--border);
  font-weight: 500;
}

tr:last-child td { border-bottom: none; }

tr:hover td {
  background: hsla(210, 100%, 55%, 0.05);
}

.url-cell {
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 0.85rem;
  color: var(--accent);
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.url-cell a {
  color: inherit;
  text-decoration: none;
}

.url-cell a:hover {
  text-decoration: underline;
}

.explainer-box {
  background: var(--chart-bg);
  border: 1px solid var(--border);
  border-left: 4px solid var(--accent);
  border-radius: 12px;
  padding: 1.25rem;
  margin-top: 1.5rem;
  font-size: 0.95rem;
  color: var(--text-dim);
  line-height: 1.6;
  max-width: 900px;
}

.explainer-box strong {
  color: var(--text-main);
  font-weight: 600;
}

.mode-cell {
  white-space: nowrap !important;
}

.badge {
  display: inline-block;
  padding: 8px 14px;
  border-radius: 10px;
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 1px;
  white-space: nowrap !important;
}

.badge.mobile, .badge.mobile-4g { background: hsla(25, 95%, 55%, 0.15); color: hsl(25, 95%, 55%); border: 1px solid hsla(25, 95%, 55%, 0.3); }
.badge.mobile-wifi { background: hsla(45, 95%, 50%, 0.15); color: hsl(45, 95%, 50%); border: 1px solid hsla(45, 95%, 50%, 0.3); }
.badge.desktop { background: hsla(210, 100%, 50%, 0.15); color: hsl(210, 100%, 50%); border: 1px solid hsla(210, 100%, 50%, 0.3); }

.good { color: var(--success); font-weight: 800; }
.avg { color: var(--warning); font-weight: 800; }
.poor { color: var(--danger); font-weight: 800; }

::-webkit-scrollbar { width: 12px; }
::-webkit-scrollbar-track { background: var(--bg-deep); }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 6px; border: 3px solid var(--bg-deep); }
::-webkit-scrollbar-thumb:hover { background: var(--accent); }

@media print {
  html { font-size: 12px !important; }
  body { font-size: 12px !important; background: white !important; color: black !important; }
  .sidebar { display: none !important; }
  main { margin-left: 0 !important; padding: 0 !important; max-width: none !important; }
  .theme-toggle { display: none !important; }
  .chart-box { height: 260px !important; }
  .chart-box canvas { width: 100% !important; height: 100% !important; object-fit: contain !important; }
  .chart-container { padding: 1.5rem !important; margin-bottom: 2rem !important; }
  .card, .chart-container, tr { page-break-inside: avoid !important; break-inside: avoid !important; }
  .header-info h1 { font-size: 2.2rem !important; }
  .header-info p { font-size: 1rem !important; }
  .section-header h2 { font-size: 1.8rem !important; margin-bottom: 0.5rem !important; }
  .section-header p { font-size: 1rem !important; }
  .stat-card .value { font-size: 2.2rem !important; }
  .stat-card .label { font-size: 0.8rem !important; margin-bottom: 0.5rem !important; }
  section { margin-bottom: 3rem !important; }
  .section-header { page-break-after: avoid !important; page-break-inside: avoid !important; }
  header { margin-bottom: 3rem !important; padding-bottom: 1rem !important; }
  .card { padding: 1.5rem !important; }
  .stats-grid { gap: 1rem !important; margin-bottom: 2rem !important; }
  .chart-header { margin-bottom: 1rem !important; }
  .chart-header h3 { font-size: 1.4rem !important; margin-bottom: 0.2rem !important; }
  .chart-header p { font-size: 0.95rem !important; }
  td, th { padding: 0.8rem !important; font-size: 0.8rem !important; }
  .url-cell { font-size: 0.65rem !important; max-width: 220px !important; direction: rtl; text-align: left; word-break: break-all; }
  .badge { font-size: 0.55rem !important; padding: 4px 8px !important; letter-spacing: 0.5px !important; }
  .timeline-slider-container { display: none !important; }
}

@media (max-width: 1000px) {
  .sidebar { width: 90px; padding: 2.5rem 1rem; }
  .logo span, .nav-item span, .theme-toggle span { display: none; }
  main { margin-left: 90px; padding: 2rem; }
}

.modal {
  display: none;
  position: fixed;
  z-index: 1000;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
}

.modal-content {
  background: var(--bg-surface);
  margin: 5% auto;
  padding: 2.5rem;
  border: 1px solid var(--border);
  border-radius: 24px;
  width: 90%;
  max-width: 700px;
  max-height: 80vh;
  position: relative;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.4);
}

#modalBody {
  max-height: calc(80vh - 5rem);
  overflow-y: auto;
  overflow-x: hidden;
}

#modalBody::-webkit-scrollbar { width: 6px; }
#modalBody::-webkit-scrollbar-track { background: transparent; }
#modalBody::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
#modalBody::-webkit-scrollbar-thumb:hover { background: var(--accent); }

.close-modal {
  position: absolute;
  top: 1.5rem;
  right: 1.5rem;
  font-size: 2rem;
  font-weight: 700;
  color: var(--text-dim);
  cursor: pointer;
  line-height: 1;
  transition: color 0.2s;
}

.close-modal:hover {
  color: var(--text-main);
}

.modal-header {
  margin-bottom: 2rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--border);
}

.modal-header h2 {
  font-family: 'Outfit', sans-serif;
  font-size: 1.8rem;
  margin-bottom: 0.5rem;
}

.modal-url {
  color: var(--accent);
  font-size: 0.9rem;
  word-break: break-all;
}

.modal-section {
  margin-bottom: 1.5rem;
}

.modal-section h3 {
  font-size: 1rem;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 1rem;
  font-weight: 700;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 1rem;
}

.metric-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1rem;
  text-align: center;
}

.metric-label {
  font-size: 0.8rem;
  color: var(--text-dim);
  margin-bottom: 0.5rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.metric-value {
  font-size: 1.5rem;
  font-weight: 800;
  font-family: 'Outfit', sans-serif;
}

.metric-value.good { color: var(--success); }
.metric-value.avg { color: var(--warning); }
.metric-value.poor { color: var(--danger); }

.modal-meta {
  display: flex;
  gap: 1.5rem;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
  font-size: 0.85rem;
  color: var(--text-dim);
}

.timeline-slider-container {
  margin-bottom: 1rem;
  padding: 0 1rem;
  width: 80%;
  margin-right: auto;
  margin-left: auto;
}

.timeline-slider {
  margin: 10px 0;
}

/* Override default green to blue accent */
.noUi-connect {
  background: var(--accent) !important;
}

.noUi-target {
  background: var(--bg-surface) !important;
  border-color: var(--border) !important;
}

.noUi-handle {
  background: var(--bg-deep) !important;
  border-color: var(--border) !important;
}

.noUi-handle:focus {
  background: var(--text-dim) !important;
}

.noUi-handle:hover {
  background: var(--text-dim) !important;
}

.noUi-tooltip {
  background: var(--bg-card) !important;
  border: 1px solid var(--border) !important;
  color: var(--text-main) !important;
}

.noUi-horizontal .noUi-tooltip {
  -webkit-transform: unset !important;
  transform: unset !important;
  left: unset !important;
}

/* Position left handle tooltip to the right */
.noUi-handle-lower .noUi-tooltip {
  right: 0 !important;
}

/* Position right handle tooltip to the left */
.noUi-handle-upper .noUi-tooltip {
}

.light-mode .noUi-handle {
  background: #ffffff !important;
  border-color: #cccccc !important;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
}

.light-mode .noUi-handle:hover {
  background: #f0f0f0 !important;
}

.light-mode .noUi-target {
  background: var(--bg-surface) !important;
  border-color: var(--border) !important;
}

.light-mode .noUi-tooltip {
  background: var(--bg-surface) !important;
  border: 1px solid var(--border) !important;
  color: var(--text-main) !important;
}

.timeline-current-labels {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.75rem;
  font-size: 0.8rem;
}

.current-label {
  color: var(--text-dim);
}`;
  }
});

// src/dashboard/client.ts
var clientJs;
var init_client = __esm({
  "src/dashboard/client.ts"() {
    "use strict";
    clientJs = String.raw`const shortenLabel = (label) => {
  if (typeof label === 'string' && label.length > 24) {
    return label.substring(0, 12) + '...' + label.slice(-12);
  }
  return label || '';
};

const urlLabels = INJECT_urlLabels;
const allModes = INJECT_allModes;
const modePerf = INJECT_modePerf;
const modeMetrics = INJECT_modeMetrics;
const trendData = INJECT_trendData;
const allRunsData = INJECT_allRunsData;

const colors = {
  blue: 'hsl(210, 100%, 50%)',
  orange: 'hsl(25, 95%, 55%)',
  amber: 'hsl(45, 95%, 50%)',
  teal: 'hsl(170, 70%, 45%)',
  gray: 'hsl(220, 15%, 50%)',
  purple: 'hsl(270, 70%, 60%)',
  pink: 'hsl(330, 80%, 60%)'
};

const modeColors = {
  'desktop': colors.blue,
  'mobile-4g': colors.orange,
  'mobile-wifi': colors.amber,
};

const getModeColor = (mode) => modeColors[mode] || colors.purple;

const transparentize = (hsl, alpha) => {
  const h = hsl.match(/\d+/g);
  return 'hsla(' + h[0] + ', ' + h[1] + '%, ' + h[2] + '%, ' + alpha + ')';
};

const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('section');

window.addEventListener('scroll', () => {
  let current = '';
  sections.forEach(section => {
    const sectionTop = section.offsetTop;
    if (pageYOffset >= (sectionTop - 300)) {
      current = section.getAttribute('id');
    }
  });

  navItems.forEach(item => {
    item.classList.remove('active');
    if (item.getAttribute('href').slice(1) === current) {
      item.classList.add('active');
    }
  });
});

const themeBtn = document.getElementById('themeBtn');
const body = document.body;
const themeText = document.getElementById('themeText');

function setTheme(isLight) {
  if (isLight) {
    body.classList.add('light-mode');
    themeText.innerText = 'Light';
    localStorage.setItem('lhr-theme', 'light');
  } else {
    body.classList.remove('light-mode');
    themeText.innerText = 'Dark';
    localStorage.setItem('lhr-theme', 'dark');
  }
  updateChartThemes();
}

themeBtn.addEventListener('click', () => setTheme(!body.classList.contains('light-mode')));
if (localStorage.getItem('lhr-theme') === 'light') setTheme(true);

function updateChartThemes() {
  const isLight = body.classList.contains('light-mode');
  const colorMain = isLight ? 'hsl(220, 20%, 15%)' : 'hsl(220, 10%, 95%)';
  const colorDim = isLight ? 'hsl(220, 15%, 45%)' : 'hsl(220, 10%, 70%)';
  const colorBorder = isLight ? 'hsla(220, 15%, 80%, 0.5)' : 'hsla(220, 15%, 25%, 0.4)';

  Chart.defaults.animation = false;
  Chart.defaults.color = colorDim;
  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.plugins.tooltip.backgroundColor = isLight ? 'white' : 'hsl(220, 15%, 15%)';
  Chart.defaults.plugins.tooltip.titleColor = colorMain;
  Chart.defaults.plugins.tooltip.bodyColor = colorDim;
  Chart.defaults.plugins.tooltip.borderColor = colorBorder;
  Chart.defaults.plugins.tooltip.borderWidth = 1;
}
updateChartThemes();

new Chart(document.getElementById('performanceChart'), {
  type: 'bar',
  data: {
    labels: urlLabels,
    datasets: allModes.map(mode => ({
      label: mode.replace('-', ' ').toUpperCase(),
      data: modePerf[mode],
      backgroundColor: getModeColor(mode),
      borderRadius: 8
    }))
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: { beginAtZero: true, max: 100, grid: { color: 'hsla(220, 15%, 50%, 0.1)' } },
      x: {
        grid: { display: false },
        ticks: {
          maxRotation: 35,
          minRotation: 35,
          labelOffset: 40,
          callback: function(v) { return shortenLabel(this.getLabelForValue(v)); }
        }
      }
    },
    plugins: { legend: { position: 'top', align: 'end', labels: { usePointStyle: true, padding: 25 } } }
  }
});

const catKeys = INJECT_categoryKeys;
const modeDataAvg = INJECT_modeDataAvg;
const modeDataRaw = INJECT_modeDataRaw;

const getAggAvg = (data, key) => {
  const vals = data.flatMap(d => d.map(r => (r.categories[key] || 0)));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
};

new Chart(document.getElementById('categoriesChart'), {
  type: 'radar',
  data: {
    labels: ['Performance', 'Accessibility', 'Best Practices', 'SEO'],
    datasets: allModes.map(mode => ({
      label: mode.replace('-', ' ').toUpperCase(),
      data: catKeys.map(k => getAggAvg(modeDataAvg[mode], k)),
      borderColor: getModeColor(mode),
      backgroundColor: transparentize(getModeColor(mode), 0.2),
      pointBackgroundColor: getModeColor(mode),
      borderWidth: 2
    }))
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      r: {
        beginAtZero: true, max: 100,
        grid: { color: 'hsla(220, 15%, 50%, 0.2)' },
        angleLines: { color: 'hsla(220, 15%, 50%, 0.2)' },
        pointLabels: {
          font: { size: 13, weight: '600' },
          backdropColor: 'transparent',
          backdropPadding: 0
        },
        ticks: {
          showLabelBackdrop: false,
          backdropColor: 'transparent',
          backdropPadding: 0,
          color: 'hsl(220, 10%, 70%)',
          font: { size: 10 }
        }
      }
    },
    plugins: { legend: { position: 'bottom', labels: { padding: 30 } } }
  }
});

const createMetricsChart = (id, data, colorPrimary) => {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: urlLabels,
      datasets: [
        { label: 'FCP (s)', data: data.map(d => d.fcp/1000), backgroundColor: colors.gray, borderRadius: 6 },
        { label: 'LCP (s)', data: data.map(d => d.lcp/1000), backgroundColor: colorPrimary, borderRadius: 6 },
        { label: 'TBT (ms)', data: data.map(d => d.tbt), borderColor: colors.teal, backgroundColor: colors.teal, type: 'line', yAxisID: 'y1', tension: 0.4, pointRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: {
            maxRotation: 35,
            minRotation: 35,
            labelOffset: 40,
            callback: function(v) { return shortenLabel(this.getLabelForValue(v)); }
          }
        },
        y: { title: { display: true, text: 'Seconds (Lower is Better)' }, grid: { color: 'hsla(220, 15%, 50%, 0.1)' } },
        y1: { position: 'right', title: { display: true, text: 'TBT Milliseconds' }, grid: { display: false } }
      },
      plugins: { legend: { position: 'bottom', labels: { padding: 20 } } }
    }
  });
};

allModes.forEach(mode => {
  createMetricsChart('metricsChart-' + mode, modeMetrics[mode], getModeColor(mode));
});

const getRawScores = (data) => {
  return data.map(u => u.map(r => r.categories.performance));
};

new Chart(document.getElementById('distributionChart'), {
  type: 'boxplot',
  data: {
    labels: urlLabels,
    datasets: allModes.map(mode => ({
      label: mode.replace('-', ' ').toUpperCase(),
      data: getRawScores(modeDataRaw[mode]),
      backgroundColor: transparentize(getModeColor(mode), 0.4),
      borderColor: getModeColor(mode),
      borderWidth: 2,
      itemRadius: 3
    }))
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: { max: 100, min: 0, grid: { color: 'hsla(220, 15%, 50%, 0.1)' } },
      x: {
        grid: { display: false },
        ticks: {
          maxRotation: 35,
          minRotation: 35,
          labelOffset: 40,
          callback: function(v) { return shortenLabel(this.getLabelForValue(v)); }
        }
      }
    },
    plugins: { legend: { position: 'bottom', labels: { padding: 20 } } }
  }
});

new Chart(document.getElementById('trendsChart'), {
  type: 'line',
  data: {
    datasets: trendData.flatMap((d, i) => allModes.map(mode => ({
      label: d.label + ' (' + mode.charAt(0).toUpperCase() + ')',
      data: d.modes[mode],
      borderColor: getModeColor(mode),
      borderDash: mode.includes('wifi') || mode.includes('desktop') ? [] : [5, 5],
      backgroundColor: 'transparent',
      tension: 0.4,
      pointRadius: 5,
      hitRadius: 10,
      hidden: i > 0
    })))
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: 'linear',
        title: { display: true, text: 'Audit Timeline', color: 'hsl(220, 10%, 95%)', font: { weight: '700' } },
        grid: { color: 'hsla(220, 15%, 50%, 0.1)' },
        ticks: { color: 'hsl(220, 10%, 70%)',
          callback: function(value) {
            const d = new Date(value);
            const pad = (n) => n.toString().padStart(2, '0');
            const date = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
            const time = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
            return date + ' ' + time;
          }
        }
      },
      y: { max: 100, min: 0, title: { display: true, text: 'Score', color: 'hsl(220, 10%, 95%)', font: { weight: '700' } }, grid: { color: 'hsla(220, 15%, 50%, 0.1)' }, ticks: { color: 'hsl(220, 10%, 70%)' } }
    },
    plugins: {
      zoom: {
        zoom: {
          wheel: { enabled: true },
          pinch: { enabled: true },
          mode: 'x',
        },
        pan: {
          enabled: true,
          mode: 'x',
          drag: { enabled: true },
        },
      },
      legend: { position: 'bottom', labels: { boxWidth: 10, padding: 15 } },
      tooltip: {
        callbacks: {
          title: function(context) {
            const timestamp = context[0].raw.x;
            const d = new Date(timestamp);
            const pad = (n) => n.toString().padStart(2, '0');
            const date = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
            const time = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
            return date + ' ' + time;
          },
          afterTitle: function(context) {
            const iterCount = context[0].raw.iterationCount;
            if (iterCount && iterCount > 1) {
              return 'Run average (' + iterCount + ' iterations)';
            }
            return '';
          }
        }
      }
    },
    onClick: (e, el) => {
      if (el.length) {
        const data = e.chart.data.datasets[el[0].datasetIndex].data[el[0].index];
        if (data.summary) {
          showRunModal(data.summary);
        }
      }
    }
  }
});

const trendsChart = Chart.getChart('trendsChart');

const formatDate = (ts) => {
  const d = new Date(ts);
  const pad = (n) => n.toString().padStart(2, '0');
  const date = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const time = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  return date + ' ' + time;
};

function updateVisibleLabels(minVal, maxVal) {
  const startEl = document.getElementById('timelineStart');
  const endEl = document.getElementById('timelineEnd');
  if (startEl) startEl.textContent = formatDate(minVal);
  if (endEl) endEl.textContent = formatDate(maxVal);
}

const sliderEl = document.getElementById('timelineSlider');
let timelineSlider = null;
let isUpdatingSlider = false;
let isUpdatingChart = false;

if (sliderEl && trendsChart) {
  const allTimestamps = trendData.flatMap(d => Object.values(d.modes).flat().map(p => p.x));
  if (allTimestamps.length > 0) {
    const fullMin = Math.min(...allTimestamps);
    const fullMax = Math.max(...allTimestamps);
    const initialMin = trendsChart.scales.x.min;
    const initialMax = trendsChart.scales.x.max;

    timelineSlider = noUiSlider.create(sliderEl, {
      range: { min: fullMin, max: fullMax },
      start: [initialMin, initialMax],
      connect: true,
      behaviour: 'tap-drag',
      tooltips: [
        { to: (v) => formatDate(v) },
        { to: (v) => formatDate(v) }
      ],
      format: {
        to: (value) => Math.round(value),
        from: (value) => Number(value)
      }
    });

    if (trendsChart.options.plugins?.zoom) {
      trendsChart.options.plugins.zoom.limits = {
        x: { 
          min: fullMin, 
          max: fullMax,
          minRange: (fullMax - fullMin) * 0.01
        }
      };
    }

    timelineSlider.on('update', (values, handle) => {
      if (isUpdatingSlider) return;
      isUpdatingChart = true;
      const min = timelineSlider.get()[0];
      const max = timelineSlider.get()[1];
      trendsChart.zoomScale('x', { min, max });
      updateVisibleLabels(min, max);
      isUpdatingChart = false;
    });

    trendsChart.options.plugins.zoom.zoom.onZoom = ({ chart }) => {
      if (isUpdatingChart || isUpdatingSlider) return;
      isUpdatingSlider = true;
      const min = chart.scales.x.min;
      const max = chart.scales.x.max;
      if (timelineSlider) {
        timelineSlider.set([min, max], true, true);
      }
      updateVisibleLabels(min, max);
      isUpdatingSlider = false;
    };
    trendsChart.options.plugins.zoom.pan.onPan = ({ chart }) => {
      if (isUpdatingChart || isUpdatingSlider) return;
      isUpdatingSlider = true;
      const min = chart.scales.x.min;
      const max = chart.scales.x.max;
      if (timelineSlider) {
        timelineSlider.set([min, max], true, true);
      }
      updateVisibleLabels(min, max);
      isUpdatingSlider = false;
    };

    updateVisibleLabels(initialMin, initialMax);
  }
}

new Chart(document.getElementById('scatterChart'), {
  type: 'scatter',
  data: {
    datasets: allModes.map(mode => ({
      label: mode.replace('-', ' ').toUpperCase() + ' Dataset',
      data: allRunsData.filter(r => r.mode === mode).map(r => ({ x: r.urlIndex, y: r.score, fileName: r.fileName, summary: r.summary })),
      backgroundColor: getModeColor(mode),
      pointRadius: 6,
      hoverRadius: 10
    }))
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        min: -0.5,
        max: urlLabels.length - 0.5,
        ticks: {
          maxRotation: 35,
          minRotation: 35,
          labelOffset: 40,
          callback: (v) => shortenLabel(urlLabels[v] || ''),
          stepSize: 1,
          precision: 0
        },
        grid: { color: 'hsla(220, 15%, 50%, 0.1)' }
      },
      y: { beginAtZero: true, max: 100, min: 0, grid: { color: 'hsla(220, 15%, 50%, 0.1)' } }
    },
    plugins: {
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const d = ctx.raw;
            return 'Score: ' + d.y + ' ' + urlLabels[d.x] + ' (Click for details) ';
          }
        }
      }
    },
    onClick: (e, el) => {
      if (el.length) {
        const data = e.chart.data.datasets[el[0].datasetIndex].data[el[0].index];
        if (data.summary) {
          showRunModal(data.summary);
        }
      }
    }
  }
});

const showRunModal = (summary) => {
  const modal = document.getElementById('runModal');
  const title = document.getElementById('modalTitle');
  const url = document.getElementById('modalUrl');
  const categories = document.getElementById('modalCategories');
  const metrics = document.getElementById('modalMetrics');
  const timestamp = document.getElementById('modalTimestamp');
  const mode = document.getElementById('modalMode');
  
  title.textContent = summary.urlLabel || summary.id;
  url.innerHTML = '<a href="' + summary.url + '" target="_blank" rel="noopener noreferrer">' + summary.url + '</a>';
  
  const catLabels = { performance: 'Performance', accessibility: 'Accessibility', 'best-practices': 'Best Practices', seo: 'SEO' };
  categories.innerHTML = Object.entries(summary.categories).map(([key, val]) => {
    const score = Math.round(val);
    const grade = score >= 90 ? 'good' : score >= 50 ? 'avg' : 'poor';
    return '<div class="metric-card"><div class="metric-label">' + catLabels[key] + '</div><div class="metric-value ' + grade + '">' + score + '</div></div>';
  }).join('');
  
  const metricLabels = { lcp: 'LCP', cls: 'CLS', inp: 'INP', fcp: 'FCP', si: 'SI', tbt: 'TBT', tti: 'TTI' };
  metrics.innerHTML = Object.entries(summary.metrics).filter(([k]) => metricLabels[k]).map(([key, val]) => {
    if (val == null) return '';
    const numVal = Number(val);
    let displayVal, grade;
    if (key === 'cls') {
      displayVal = numVal.toFixed(4);
      grade = numVal < 0.1 ? 'good' : numVal < 0.25 ? 'avg' : 'poor';
    } else if (key === 'lcp' || key === 'fcp' || key === 'si' || key === 'tti') {
      displayVal = (numVal / 1000).toFixed(2) + 's';
      const thresholds = key === 'lcp' ? [2500, 4000] : key === 'fcp' ? [1800, 3000] : key === 'si' ? [3400, 5800] : [3800, 7300];
      grade = numVal < thresholds[0] ? 'good' : numVal < thresholds[1] ? 'avg' : 'poor';
    } else {
      displayVal = numVal.toFixed(0) + 'ms';
      grade = numVal < 200 ? 'good' : numVal < 600 ? 'avg' : 'poor';
    }
    return '<div class="metric-card"><div class="metric-label">' + metricLabels[key] + '</div><div class="metric-value ' + grade + '">' + displayVal + '</div></div>';
  }).join('');
  
  timestamp.textContent = new Date(summary.timestamp).toLocaleString();
  mode.textContent = summary.mode;
  
  modal.style.display = 'block';
};

document.querySelector('.close-modal').addEventListener('click', () => {
  document.getElementById('runModal').style.display = 'none';
});

window.addEventListener('click', (e) => {
  const modal = document.getElementById('runModal');
  if (e.target === modal) {
    modal.style.display = 'none';
  }
});`;
  }
});

// src/dashboard/template.ts
function calcWeightedAvg(arr, prefix, key) {
  if (!arr || !arr.length) return 0;
  const entries = arr.map((a) => {
    const val = prefix ? a[prefix] ? a[prefix][key] : void 0 : a[key];
    const ts = a.timestamp || 0;
    return val != null && !isNaN(val) ? { val, ts } : null;
  }).filter((v) => v !== null);
  if (entries.length === 0) return 0;
  if (entries.length === 1) return entries[0].val;
  const newestTs = Math.max(...entries.map((e) => e.ts));
  let weightedSum = 0;
  let totalWeight = 0;
  for (const entry of entries) {
    const ageDays = (newestTs - entry.ts) / 864e5;
    const weight = Math.exp(-DECAY_LAMBDA * ageDays);
    weightedSum += entry.val * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}
function buildMetricsRow(metrics, url, prefix) {
  const fcp = metrics.fcp ? (metrics.fcp / 1e3).toFixed(2) + "s" : "-";
  const lcp = metrics.lcp ? (metrics.lcp / 1e3).toFixed(2) + "s" : "-";
  const tbt = metrics.tbt ? metrics.tbt.toFixed(0) + "ms" : "-";
  const cls = metrics.cls ? metrics.cls.toFixed(3) : "-";
  const si = metrics.si ? (metrics.si / 1e3).toFixed(2) + "s" : "-";
  const tti = metrics.tti ? (metrics.tti / 1e3).toFixed(2) + "s" : "-";
  const getGrade = (val, thresholds) => {
    if (!val) return "none";
    if (val < thresholds[0]) return "good";
    if (val < thresholds[1]) return "avg";
    return "poor";
  };
  return `<tr class="${prefix.toLowerCase()}">
    <td class="url-cell" title="${url}"><a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a></td>
    <td class="mode-cell"><span class="badge ${prefix.toLowerCase()}">${prefix}</span></td>
    <td class="${getGrade(metrics.fcp, [1800, 3e3])}">${fcp}</td>
    <td class="${getGrade(metrics.lcp, [2500, 4e3])}">${lcp}</td>
    <td class="${getGrade(metrics.tbt, [200, 600])}">${tbt}</td>
    <td class="${getGrade(metrics.cls, [0.1, 0.25])}">${cls}</td>
    <td class="${getGrade(metrics.si, [3400, 5800])}">${si}</td>
    <td class="${getGrade(metrics.tti, [3800, 7300])}">${tti}</td>
  </tr>`;
}
function generateHtml(statsData2) {
  const reportPath = `${config.baseDir}/visual-summary.html`;
  const urls = Object.keys(statsData2.urls);
  const urlLabels = urls.map((u) => {
    try {
      const url = new URL(u);
      return url.host + url.pathname + url.search;
    } catch {
      return u;
    }
  });
  const categoryKeys = ["performance", "accessibility", "best-practices", "seo"];
  const allModes = Array.from(new Set(Object.values(statsData2.urls).flatMap((u) => Object.keys(u.modes))));
  const modeDataAvg = {};
  const modeDataRaw = {};
  const modePerf = {};
  const overallModePerf = {};
  const modeMetrics = {};
  for (const mode of allModes) {
    modeDataAvg[mode] = urls.map((u) => statsData2.urls[u].modes[mode] || []);
    modeDataRaw[mode] = urls.map((u) => statsData2.urls[u].modesRaw[mode] || []);
    modePerf[mode] = modeDataAvg[mode].map((d) => calcWeightedAvg(d, "categories", "performance"));
    overallModePerf[mode] = calcWeightedAvg(modeDataAvg[mode].flat(), "categories", "performance");
    modeMetrics[mode] = urls.map((url) => ({
      fcp: calcWeightedAvg(statsData2.urls[url].modes[mode] || [], "metrics", "fcp"),
      lcp: calcWeightedAvg(statsData2.urls[url].modes[mode] || [], "metrics", "lcp"),
      tbt: calcWeightedAvg(statsData2.urls[url].modes[mode] || [], "metrics", "tbt"),
      cls: calcWeightedAvg(statsData2.urls[url].modes[mode] || [], "metrics", "cls"),
      si: calcWeightedAvg(statsData2.urls[url].modes[mode] || [], "metrics", "si"),
      tti: calcWeightedAvg(statsData2.urls[url].modes[mode] || [], "metrics", "tti")
    }));
  }
  const totalRuns = statsData2.runs.length;
  const allAveragedRuns = Object.values(statsData2.urls).flatMap((u) => Object.values(u.modes).flat());
  const totalRunGroups = allAveragedRuns.length;
  const avgIterations = totalRunGroups > 0 ? allAveragedRuns.reduce((sum, r) => sum + (r.iterationCount || 1), 0) / totalRunGroups : 0;
  const trendData = urls.map((url) => {
    const modesTrend = {};
    for (const mode of allModes) {
      modesTrend[mode] = (statsData2.urls[url].modes[mode] || []).map((r) => ({
        x: r.timestamp,
        y: r.categories.performance,
        iterationCount: r.iterationCount || 1,
        summary: {
          id: r.id || r.fileName,
          url: r.url,
          urlLabel: r.urlLabel || url,
          mode,
          timestamp: r.timestamp,
          categories: r.categories,
          metrics: r.metrics
        }
      }));
    }
    return {
      label: (() => {
        try {
          const u = new URL(url);
          return u.host + u.pathname + u.search;
        } catch {
          return url;
        }
      })(),
      modes: modesTrend
    };
  });
  const allRunsData = statsData2.runs.map((r) => ({
    urlIndex: urls.indexOf(r.url),
    urlLabel: (() => {
      try {
        const u = new URL(r.url);
        return u.host + u.pathname + u.search;
      } catch {
        return r.url;
      }
    })(),
    score: r.categories.performance,
    mode: r.mode,
    fileName: r.fileName,
    timestamp: r.timestamp,
    summary: {
      id: r.id,
      url: r.url,
      urlLabel: r.urlLabel,
      mode: r.mode,
      timestamp: r.timestamp,
      categories: r.categories,
      metrics: r.metrics
    }
  }));
  const metricsRows = urls.flatMap((url) => {
    return allModes.map((mode) => {
      const entries = statsData2.urls[url].modes[mode] || [];
      if (entries.length === 0) return "";
      const avg = {
        fcp: calcWeightedAvg(entries, "metrics", "fcp"),
        lcp: calcWeightedAvg(entries, "metrics", "lcp"),
        tbt: calcWeightedAvg(entries, "metrics", "tbt"),
        cls: calcWeightedAvg(entries, "metrics", "cls"),
        si: calcWeightedAvg(entries, "metrics", "si"),
        tti: calcWeightedAvg(entries, "metrics", "tti")
      };
      return buildMetricsRow(avg, url, mode);
    });
  }).join("");
  const clientInjected = clientJs.replace(/\bINJECT_urlLabels\b/g, JSON.stringify(urlLabels)).replace(/\bINJECT_allModes\b/g, JSON.stringify(allModes)).replace(/\bINJECT_modePerf\b/g, JSON.stringify(modePerf)).replace(/\bINJECT_modeMetrics\b/g, JSON.stringify(modeMetrics)).replace(/\bINJECT_trendData\b/g, JSON.stringify(trendData)).replace(/\bINJECT_allRunsData\b/g, JSON.stringify(allRunsData)).replace(/\bINJECT_categoryKeys\b/g, JSON.stringify(categoryKeys)).replace(/\bINJECT_modeDataAvg\b/g, JSON.stringify(modeDataAvg)).replace(/\bINJECT_modeDataRaw\b/g, JSON.stringify(modeDataRaw));
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Lighthouse Performance Dashboard</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;600;700&display=swap" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.2"></script>
    <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-zoom@2.2.0/dist/chartjs-plugin-zoom.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/@sgratzl/chartjs-chart-boxplot@4.3.0/build/index.umd.min.js"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/noUiSlider/15.7.1/nouislider.min.css" rel="stylesheet">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/noUiSlider/15.7.1/nouislider.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/luxon@3.4.4/build/global/luxon.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-luxon@1.3.1/dist/chartjs-adapter-luxon.bundle.min.js"></script>
    <style>${styles}</style>
</head>
<body>
    <nav class="sidebar">
        <div class="logo">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            <span>LHR Dashboard</span>
        </div>
        <ul class="nav-links">
            <a href="#overview" class="nav-item active">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                <span>Overview</span>
            </a>
            <a href="#metrics" class="nav-item">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
                <span>Performance</span>
            </a>
            <a href="#trends" class="nav-item">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                <span>Analysis</span>
            </a>
            <a href="#runs" class="nav-item">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                <span>History</span>
            </a>
        </ul>
        <div class="theme-toggle">
            <span>Theme</span>
            <button id="themeBtn" title="Toggle Light/Dark Mode">
                <svg id="themeIcon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
                <span id="themeText">Dark</span>
            </button>
        </div>
    </nav>

    <main>
        <header>
            <div class="header-info">
                <h1>Performance Intelligence</h1>
                <p>Advanced real-time analytics for your digital ecosystem. Identifying friction, optimizing vitals, and ensuring a premium user experience across all devices.</p>
            </div>
        </header>

        <section id="overview">
            <div class="section-header">
                <h2>Executive Summary</h2>
                <p>A high-level health check of your digital property. Scores are time-weighted (7-day half-life) \u2014 recent runs have more influence than older ones.</p>
                <div class="explainer-box">
                    <strong>Total Audits:</strong> The total number of individual Lighthouse iterations run across all pages.<br><br>
                    <strong>Mode Health:</strong> An overall performance score from 0 to 100 for that specific device and network profile. A score of 90+ is considered Good. It is calculated by taking the weighted average of the Performance category score for all URLs, where newer tests are weighted exponentially more heavily than older tests (7-day half-life).
                </div>
            </div>

            <div class="stats-grid">
                <div class="card stat-card">
                    <div class="label">Total Audits</div>
                    <div class="value">${totalRuns}</div>
                    <div class="trend">${totalRunGroups} averaged runs across ${urls.length} pages</div>
                </div>
                ${allModes.map((mode) => `
                <div class="card stat-card">
                    <div class="label">${mode.replace("-", " ").toUpperCase()} Health</div>
                    <div class="value">${overallModePerf[mode].toFixed(0)}</div>
                    <div class="trend">Time-weighted \xB7 Target: 90+</div>
                </div>`).join("")}
                <div class="card stat-card">
                    <div class="label">Data Quality</div>
                    <div class="value">${avgIterations.toFixed(2)}</div>
                    <div class="trend">Avg iterations per data point</div>
                </div>
            </div>
        </section>

        <section id="performance">
            <div class="chart-container">
                <div class="chart-header">
                    <h3>Page Performance Breakdown</h3>
                    <p>Comparative scoring per URL. Scores are time-weighted \u2014 recent runs contribute more to the displayed value.</p>
                </div>
                <div class="chart-box">
                    <canvas id="performanceChart"></canvas>
                </div>
            </div>

            <div class="chart-container">
                <div class="chart-header">
                    <h3>Site Quality Radar</h3>
                    <p>Holistic health across categories.</p>
                </div>
                <div class="chart-box" style="height: 600px;">
                    <canvas id="categoriesChart"></canvas>
                </div>
            </div>
        </section>

        <section id="metrics">
            <div class="section-header">
                <h2>Technical Vitals Analysis</h2>
                <p>Detailed performance telemetry based on Google's Core Web Vitals. Values are time-weighted averages.</p>
                <div class="explainer-box">
                    <strong>FCP (First Contentful Paint):</strong> Time until the first text or image is painted. Lower is better.<br>
                    <strong>LCP (Largest Contentful Paint):</strong> Time until the largest text or image block is rendered. Critical for perceived load speed.<br>
                    <strong>TBT (Total Blocking Time):</strong> Total amount of time between FCP and Time to Interactive where the main thread was blocked long enough to prevent input responsiveness.<br>
                    <strong>CLS (Cumulative Layout Shift):</strong> Measures visual stability. A score below 0.1 is Good.<br>
                    <strong>SI (Speed Index):</strong> How quickly the contents of a page are visibly populated.<br>
                    <strong>TTI (Time to Interactive):</strong> Amount of time it takes for the page to become fully interactive.
                </div>
            </div>

            <div id="metricsChartsContainer">
                ${allModes.map((mode) => `
                <div class="chart-container">
                    <div class="chart-header">
                        <h3>${mode.replace("-", " ").toUpperCase()} Core Metrics</h3>
                    </div>
                    <div class="chart-box">
                        <canvas id="metricsChart-${mode}"></canvas>
                    </div>
                </div>`).join("")}
            </div>

            <div class="section-header" style="margin-top: 6rem;">
                <h3>Audit Log (Time-Weighted Averages)</h3>
                <p>Complete statistical mapping for every page. Recent data has more influence.</p>
            </div>

            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>URL PATH</th>
                            <th>TYPE</th>
                            <th>FCP</th>
                            <th>LCP</th>
                            <th>TBT</th>
                            <th>CLS</th>
                            <th>SI</th>
                            <th>TTI</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${metricsRows}
                    </tbody>
                </table>
            </div>
        </section>

        <section id="trends">
            <div class="section-header">
                <h2>Stability & Landscape Analysis</h2>
                <p>Tracking variability and consistency over time.</p>
                <div class="explainer-box">
                    <strong>Performance Envelope (Box Plot):</strong> Shows the distribution of scores across multiple runs. The box represents the middle 50% of your scores, and the vertical line inside is the median. A smaller, tighter box indicates highly consistent performance.<br><br>
                    <strong>Iterative Progression (Line Chart):</strong> Tracks how the time-weighted average score has changed over time. Dashed lines indicate unthrottled environments (Desktop, Mobile WiFi), while solid lines represent throttled environments (Mobile 4G).
                </div>
            </div>

            <div class="chart-container">
                <div class="chart-header">
                    <h3>Performance Envelope</h3>
                    <p>Visualizing score range (Min/Avg/Max) across all individual iterations.</p>
                </div>
                <div class="chart-box">
                    <canvas id="distributionChart"></canvas>
                </div>
            </div>

            <div class="chart-container">
                <div class="chart-header">
                    <h3>Iterative Progression Trend</h3>
                    <p>Historical score progression. Each point is an averaged run. Drag slider handles, scroll to zoom, click points for details. Double-click to reset.</p>
                </div>
                <div class="timeline-slider-container">
                    <div id="timelineSlider" class="timeline-slider" style="height: 24px;"></div>
                    <div class="timeline-current-labels">
                        <span class="current-label">Visible: <span id="timelineStart"></span> - <span id="timelineEnd"></span></span>
                    </div>
                </div>
                <div class="chart-box">
                    <canvas id="trendsChart"></canvas>
                </div>
            </div>
        </section>

        <section id="runs">
            <div class="section-header">
                <h2>Raw Audit Registry</h2>
                <p>Individual test results for deep-level technical auditing.</p>
            </div>

            <div class="chart-container" id="scatterChartContainer">
                <div class="chart-header">
                    <h3>Discrete Run Mapping</h3>
                    <p>Click any point to open the corresponding Lighthouse HTML report.</p>
                </div>
                <div class="chart-box">
                    <canvas id="scatterChart"></canvas>
                </div>
            </div>
        </section>
    </main>

    <div id="runModal" class="modal">
        <div class="modal-content">
            <span class="close-modal">&times;</span>
            <div id="modalBody">
                <div class="modal-header">
                    <h2 id="modalTitle">Run Details</h2>
                    <p id="modalUrl" class="modal-url"></p>
                </div>
                <div class="modal-section">
                    <h3>Categories</h3>
                    <div id="modalCategories" class="metrics-grid"></div>
                </div>
                <div class="modal-section">
                    <h3>Core Web Vitals</h3>
                    <div id="modalMetrics" class="metrics-grid"></div>
                </div>
                <div class="modal-meta">
                    <span id="modalTimestamp"></span>
                    <span id="modalMode"></span>
                </div>
            </div>
        </div>
    </div>

    <script>${clientInjected}</script>
</body>
</html>`;
}
var HALF_LIFE_DAYS, DECAY_LAMBDA;
var init_template = __esm({
  "src/dashboard/template.ts"() {
    "use strict";
    init_styles();
    init_client();
    init_config();
    HALF_LIFE_DAYS = 7;
    DECAY_LAMBDA = Math.LN2 / HALF_LIFE_DAYS;
  }
});

// src/dashboard/index.ts
import * as fs5 from "fs";
import * as path5 from "path";
function generateVisualReport(statsData2) {
  const reportPath = path5.join(config.baseDir, "visual-summary.html");
  const htmlContent = generateHtml(statsData2);
  fs5.writeFileSync(reportPath, htmlContent);
  console.log(`
\u2728 Refined Premium Dashboard updated: ${reportPath}`);
}
var init_dashboard = __esm({
  "src/dashboard/index.ts"() {
    "use strict";
    init_template();
    init_config();
  }
});

// src/index.ts
var require_index = __commonJS({
  "src/index.ts"() {
    init_config();
    init_utils();
    init_data_extract();
    init_compression();
    init_lighthouse();
    init_dashboard();
    var statsData2 = { runs: [], urls: {} };
    async function main() {
      if (args.compress) {
        compressAllReports(args.quality);
        return;
      }
      const iterations = args.runIterations !== void 0 ? args.runIterations : config.iterations;
      const runId = Date.now();
      console.log(
        `
\u{1F4CA} Mode: ${iterations > 0 ? `Run ${iterations} Lighthouse iteration(s)` : "Extract-only (no new tests)"}`
      );
      if (iterations > 0) {
        console.log(`   Run ID: ${runId}`);
      }
      if (iterations > 0) {
        for (let i = 1; i <= iterations; i++) {
          console.log(`
--- \u{1F504} Round Robin: Pass ${i} of ${iterations} ---`);
          for (const url of config.urls) {
            for (const mode of config.emulations) {
              await runLighthouse(url, i, mode, runId);
              console.log(`Waiting ${config.delay}s...`);
              await sleep(config.delay * 1e3);
            }
          }
        }
      }
      const extractedData = extractDataFromReports();
      statsData2 = extractedData;
      generateVisualReport(statsData2);
      console.log("\n\u{1F3C1} Complete.");
    }
    main().catch(console.error);
  }
});
export default require_index();
