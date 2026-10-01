import * as fs from 'fs';
import * as path from 'path';
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
import * as chromeLauncher from 'chrome-launcher';
import { getUrlHash } from './utils.js';
import { slimLhr, extractCategories, extractMetrics, createSummary } from './lhr-slim.js';

interface AuditParams {
  url: string;
  iteration: number;
  mode: string;
  runId?: number;
  runsDir: string;
  chromePath?: string;
}

async function runAudit(params: AuditParams): Promise<void> {
  const { url, iteration, mode, runId, runsDir, chromePath } = params;

  const chrome = await chromeLauncher.launch({
    ...(chromePath ? { chromePath } : {}),
    chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu'],
  });

  const isDesktop = mode === 'desktop';
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

    const categories = extractCategories(lhr);

    const metrics = extractMetrics(lhr);

    const timestamp = Date.now();
    const fileName = `${urlHash}-${mode}-${timestamp}-iter${iteration}.json`;

    const reportFilePath = path.join(runsDir, fileName);
    const cleanedLhr = slimLhr(lhr);
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

const rawArg = process.argv[2];
if (!rawArg) {
  console.error('audit-worker: no params provided');
  process.exit(1);
}

const params: AuditParams = JSON.parse(rawArg);

runAudit(params)
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
