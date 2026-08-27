// src/audit-worker.ts
import * as fs from "fs";
import * as path from "path";
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";
import * as chromeLauncher from "chrome-launcher";

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

// src/audit-worker.ts
function safeGet(obj, key) {
  return obj && obj[key] != null ? obj[key] : void 0;
}
function stripScreenshots(lhr) {
  delete lhr.fullPageScreenshot;
  if (lhr.audits) {
    for (const [key, audit] of Object.entries(lhr.audits)) {
      const a = audit;
      if (a.details && a.details.type === "screenshot") {
        delete lhr.audits[key];
      }
    }
  }
  return lhr;
}
function createSummary(url, urlHash, mode, timestamp, fileName, categories, metrics, iteration, runId) {
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
    ...runId != null ? { runId } : {}
  };
}
async function runAudit(params2) {
  const { url, iteration, mode, runId, runsDir, chromePath } = params2;
  const chrome = await chromeLauncher.launch({
    ...chromePath ? { chromePath } : {},
    chromeFlags: ["--headless", "--no-sandbox", "--disable-gpu"]
  });
  const isDesktop = mode === "desktop";
  const isThrottled = mode === "mobile-4g";
  const options = {
    logLevel: process.env.LIGHTHOUSE_LOG_LEVEL || "error",
    output: "json",
    port: chrome.port,
    formFactor: isDesktop ? "desktop" : "mobile",
    throttlingMethod: isThrottled ? "simulate" : "provided"
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
      performance: (safeGet(lhr.categories?.performance, "score") ?? 0) * 100,
      accessibility: (safeGet(lhr.categories?.accessibility, "score") ?? 0) * 100,
      "best-practices": (safeGet(lhr.categories?.["best-practices"], "score") ?? 0) * 100,
      seo: (safeGet(lhr.categories?.seo, "score") ?? 0) * 100
    };
    const metrics = {
      fcp: safeGet(lhr.audits["first-contentful-paint"], "numericValue") ?? null,
      lcp: safeGet(lhr.audits["largest-contentful-paint"], "numericValue") ?? null,
      tbt: safeGet(lhr.audits["total-blocking-time"], "numericValue") ?? null,
      cls: safeGet(lhr.audits["cumulative-layout-shift"], "numericValue") ?? null,
      si: safeGet(lhr.audits["speed-index"], "numericValue") ?? null,
      tti: safeGet(lhr.audits["interactive"], "numericValue") ?? null,
      serverResponse: safeGet(lhr.audits["server-response-time"], "numericValue") ?? null,
      domSize: safeGet(lhr.audits["dom-size-insight"], "numericValue") ?? null,
      jsExecTime: safeGet(lhr.audits["bootup-time"], "numericValue") ?? null,
      totalByteWeight: safeGet(lhr.audits["total-byte-weight"], "numericValue") ?? null
    };
    const timestamp = Date.now();
    const fileName = `${urlHash}-${mode}-${timestamp}-iter${iteration}.json`;
    const reportFilePath = path.join(runsDir, fileName);
    const cleanedLhr = stripScreenshots(lhr);
    fs.writeFileSync(reportFilePath, JSON.stringify(cleanedLhr, null, 2));
    const summary = createSummary(url, urlHash, mode, timestamp, fileName, categories, metrics, iteration, runId);
    const summaryPath = path.join(runsDir, `${urlHash}-${mode}-${timestamp}-iter${iteration}.summary.json`);
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(
      `\u2705 Perf: ${categories.performance.toFixed(0)} | FCP: ${((metrics.fcp ?? 0) / 1e3).toFixed(2)}s | LCP: ${((metrics.lcp ?? 0) / 1e3).toFixed(2)}s | TBT: ${metrics.tbt ?? "-"}ms | Saved: ${fileName}`
    );
  } catch (error) {
    console.error(`\u274C Failed to audit ${url}:`, error.message);
    throw error;
  } finally {
    await chrome.kill();
  }
}
var rawArg = process.argv[2];
if (!rawArg) {
  console.error("audit-worker: no params provided");
  process.exit(1);
}
var params = JSON.parse(rawArg);
runAudit(params).then(() => process.exit(0)).catch(() => process.exit(1));
//# sourceMappingURL=lighthouse-audit-worker.mjs.map
