import * as fs from 'fs';
import * as path from 'path';
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
import * as chromeLauncher from 'chrome-launcher';
import { getUrlHash, getUrlLabel, RunData, StatsData } from './utils';
import { config, runsDir, dataPath, args } from './config';

function safeGet(obj: any, key: string): any {
  return obj && obj[key] != null ? obj[key] : undefined;
}

function stripScreenshots(lhr: any): any {
  const cleaned = JSON.parse(JSON.stringify(lhr));
  delete cleaned.fullPageScreenshot;
  if (cleaned.audits) {
    for (const [key, audit] of Object.entries(cleaned.audits)) {
      const a = audit as any;
      if (a.details && a.details.type === 'screenshot') {
        delete cleaned.audits[key];
      }
    }
  }
  return cleaned;
}

function createSummary(url: string, urlHash: string, mode: string, timestamp: number, fileName: string, categories: any, metrics: any, runId?: number) {
  return {
    id: `${urlHash}-${mode}-${timestamp}`,
    url,
    urlLabel: getUrlLabel(url),
    mode,
    timestamp,
    fileName,
    categories,
    metrics,
    ...(runId != null ? { runId } : {}),
  };
}

let statsData: StatsData = { runs: [], urls: {} };

export async function runLighthouse(url: string, iteration: number, mode: string, runId?: number): Promise<void> {
  const chrome = await chromeLauncher.launch({
    chromePath: 'chromium',
    chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu'],
  });

  const isDesktop = mode === 'desktop';
  const isWifi = mode === 'mobile-wifi';
  const isThrottled = mode === 'mobile-4g';

  const options: any = {
    logLevel: 'info',
    output: 'json',
    port: chrome.port,
    formFactor: isDesktop ? 'desktop' : 'mobile',
    // screenEmulation handled by config, but we can override here if needed
    throttlingMethod: (isDesktop || isWifi) ? 'provided' : 'simulate',
  };

  // Select the base configuration
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
      performance: (safeGet(lhr.categories.performance, 'score') || 0) * 100,
      accessibility: (safeGet(lhr.categories.accessibility, 'score') || 0) * 100,
      'best-practices': (safeGet(lhr.categories['best-practices'], 'score') || 0) * 100,
      seo: (safeGet(lhr.categories.seo, 'score') || 0) * 100,
    };

    const keyMetrics = {
      fcp: safeGet(lhr.audits['first-contentful-paint'], 'numericValue') || null,
      lcp: safeGet(lhr.audits['largest-contentful-paint'], 'numericValue') || null,
      tbt: safeGet(lhr.audits['total-blocking-time'], 'numericValue') || null,
      cls: safeGet(lhr.audits['cumulative-layout-shift'], 'numericValue') || null,
      si: safeGet(lhr.audits['speed-index'], 'numericValue') || null,
      tti: safeGet(lhr.audits['interactive'], 'numericValue') || null,
      fid: safeGet(lhr.audits['max-potential-fid'], 'numericValue') || null,
      inp: safeGet(lhr.audits['interaction-to-next-paint'], 'numericValue') || null,
      fcp1: safeGet(lhr.audits['first-contentful-paint-1'], 'numericValue') || null,
      lcp1: safeGet(lhr.audits['largest-contentful-paint-1'], 'numericValue') || null,
      lcpLate: safeGet(lhr.audits['lcp-largest-contentful-paint'], 'numericValue') || null,
      fcpL: safeGet(lhr.audits['first-contentful-paint-1'], 'numericValue') || null,
      serverResponse: safeGet(lhr.audits['server-response-time'], 'numericValue') || null,
      domSize: safeGet(lhr.audits['dom-size'], 'numericValue') || null,
      mainThreadWork: safeGet(lhr.audits['mainthread-work-breakdown'], 'numericValue') || null,
      jsExecTime: safeGet(lhr.audits['runtime-external-javascript'], 'numericValue') || null,
      networkRequests: safeGet(lhr.audits['network-requests'], 'numericValue') || null,
      totalByteWeight: safeGet(lhr.audits['network-summary'], 'numericValue') || null,
    };

    const metrics = keyMetrics;
    const timestamp = Date.now();
    const fileName = `${urlHash}-${mode}-${timestamp}.json`;

    const runData: RunData = {
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

    statsData.runs.push(runData);

    if (!statsData.urls[url]) {
      statsData.urls[url] = {
        label: getUrlLabel(url),
        modes: {},
        modesRaw: {},
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
      ...(runId != null ? { runId } : {}),
    });

    const reportFilePath = path.join(runsDir, fileName);
    const cleanedLhr = stripScreenshots(lhr);
    fs.writeFileSync(reportFilePath, JSON.stringify(cleanedLhr, null, 2));

    const summary = createSummary(url, urlHash, mode, timestamp, fileName, categories, metrics, runId);
    const summaryPath = path.join(runsDir, `${urlHash}-${mode}-${timestamp}.summary.json`);
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

    fs.writeFileSync(dataPath, JSON.stringify(statsData, null, 2));

    console.log(
      `✅ Perf: ${categories.performance.toFixed(0)} | FCP: ${((metrics.fcp || 0) / 1000).toFixed(2)}s | LCP: ${((metrics.lcp || 0) / 1000).toFixed(2)}s | TBT: ${metrics.tbt || '-'}ms | Saved: ${fileName}`,
    );
  } catch (error: any) {
    console.error(`❌ Failed to audit ${url}:`, error.message);
  } finally {
    await chrome.kill();
  }
}

export async function main(): Promise<void> {
  const iterations = args.runIterations !== undefined ? args.runIterations : config.iterations;

  console.log(
    `\n📊 Mode: ${iterations > 0 ? `Run ${iterations} Lighthouse iteration(s)` : 'Extract-only (no new tests)'}`,
  );

  const { extractDataFromReports } = await import('./data-extract');
  const extractedData = extractDataFromReports();
  statsData = extractedData || { runs: [], urls: {} };

  if (iterations > 0) {
    for (let i = 1; i <= iterations; i++) {
      console.log(`\n--- 🔄 Round Robin: Pass ${i} of ${iterations} ---`);

      for (const url of config.urls) {
        for (const mode of config.emulations) {
          await runLighthouse(url, i, mode);

          console.log(`Waiting ${config.delay}s...`);
          await new Promise((resolve) => setTimeout(resolve, config.delay * 1000));
        }
      }
    }
  }

  fs.writeFileSync(dataPath, JSON.stringify(statsData, null, 2));
  const { generateVisualReport } = await import('./dashboard');
  generateVisualReport(statsData);
  console.log('\n🏁 Complete.');
}