import * as fs from 'fs';
import * as path from 'path';
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
import * as chromeLauncher from 'chrome-launcher';
import { getUrlHash, getUrlLabel } from './utils.js';
import { config, runsDir } from './config.js';

function safeGet(obj: any, key: string): any {
  return obj && obj[key] != null ? obj[key] : undefined;
}

function stripScreenshots(lhr: any): any {
  delete lhr.fullPageScreenshot;
  if (lhr.audits) {
    for (const [key, audit] of Object.entries(lhr.audits)) {
      const a = audit as any;
      if (a.details && a.details.type === 'screenshot') {
        delete lhr.audits[key];
      }
    }
  }
  return lhr;
}

function createSummary(url: string, urlHash: string, mode: string, timestamp: number, fileName: string, categories: any, metrics: any, iteration: number, runId?: number) {
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


export async function runLighthouse(url: string, iteration: number, mode: string, runId?: number): Promise<void> {
  const chrome = await chromeLauncher.launch({
    ...(config.chromePath ? { chromePath: config.chromePath } : {}),
    chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu'],
  });

  const isDesktop = mode === 'desktop';
  const isWifi = mode === 'mobile-wifi';
  const isThrottled = mode === 'mobile-4g';

  const options: any = {
    logLevel: process.env.LIGHTHOUSE_LOG_LEVEL || 'error',
    output: 'json',
    port: chrome.port,
    formFactor: isDesktop ? 'desktop' : 'mobile',
    throttlingMethod: isThrottled ? 'simulate' : 'provided',
  };

  let configObj: any = undefined;
  if (isDesktop) {
    configObj = {
      ...desktopConfig,
      settings: {
        ...desktopConfig.settings,
        throttlingMethod: 'provided',
      }
    };
  }

  const urlHash = getUrlHash(url);
  console.log(`\n🚀 [${mode.toUpperCase()}] Audit: ${url} (ID: ${urlHash})`);

  try {
    const runnerResult = await lighthouse(url, options, configObj);
    if (!runnerResult) {
      throw new Error('Lighthouse returned no result');
    }
    const lhr = runnerResult.lhr;

    const categories = {
      performance: (safeGet(lhr.categories?.performance, 'score') ?? 0) * 100,
      accessibility: (safeGet(lhr.categories?.accessibility, 'score') ?? 0) * 100,
      'best-practices': (safeGet(lhr.categories?.['best-practices'], 'score') ?? 0) * 100,
      seo: (safeGet(lhr.categories?.seo, 'score') ?? 0) * 100,
    };

    const keyMetrics = {
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

    const metrics = keyMetrics;
    const timestamp = Date.now();
    const fileName = `${urlHash}-${mode}-${timestamp}-iter${iteration}.json`;

    const reportFilePath = path.join(runsDir, fileName);
    const cleanedLhr = stripScreenshots(lhr);
    fs.writeFileSync(reportFilePath, JSON.stringify(cleanedLhr, null, 2));

    const summary = createSummary(url, urlHash, mode, timestamp, fileName, categories, metrics, iteration, runId);
    const summaryPath = path.join(runsDir, `${urlHash}-${mode}-${timestamp}-iter${iteration}.summary.json`);
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));


    console.log(
      `✅ Perf: ${categories.performance.toFixed(0)} | FCP: ${((metrics.fcp ?? 0) / 1000).toFixed(2)}s | LCP: ${((metrics.lcp ?? 0) / 1000).toFixed(2)}s | TBT: ${metrics.tbt ?? '-'}ms | Saved: ${fileName}`,
    );
  } catch (error: any) {
    console.error(`❌ Failed to audit ${url}:`, error.message);
    throw error;
  } finally {
    await chrome.kill();
  }
}