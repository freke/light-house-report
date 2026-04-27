import { config, args } from './config.js';
import { sleep, StatsData } from './utils.js';
import { extractDataFromReports } from './data-extract.js';
import { compressAllReports } from './compression.js';
import { runLighthouse } from './lighthouse.js';
import { generateVisualReport } from './dashboard/index.js';

export async function main(): Promise<void> {
  if (args.compress) {
    compressAllReports(args.quality);
    return;
  }

  const iterations = args.runIterations !== undefined ? args.runIterations : config.iterations;
  const runId = Date.now();

  console.log(
    `\n📊 Mode: ${iterations > 0 ? `Run ${iterations} Lighthouse iteration(s)` : 'Extract-only (no new tests)'}`,
  );
  if (iterations > 0) {
    console.log(`   Run ID: ${runId}`);
  }

  if (iterations > 0) {
    let failedRuns = 0;
    for (let i = 1; i <= iterations; i++) {
      console.log(`\n--- 🔄 Round Robin: Pass ${i} of ${iterations} ---`);

      for (let uIdx = 0; uIdx < config.urls.length; uIdx++) {
        const url = config.urls[uIdx];
        for (let mIdx = 0; mIdx < config.emulations.length; mIdx++) {
          const mode = config.emulations[mIdx];
          try {
            await runLighthouse(url, i, mode, runId);
          } catch (err: any) {
            console.error(`   ⚠️ Failed ${url} (${mode}): ${err.message || err.toString()}`);
            failedRuns++;
          }
          const isLast = i === iterations && uIdx === config.urls.length - 1 && mIdx === config.emulations.length - 1;
          if (!isLast) {
            console.log(`Waiting ${config.delay}s...`);
            await sleep(config.delay * 1000);
          }
        }
      }
    }

    if (failedRuns > 0) {
      console.error(`\n❌ ${failedRuns} run(s) failed. Exiting with error.`);
      process.exit(1);
    }
  }

  const statsData: StatsData = extractDataFromReports();

  generateVisualReport(statsData);
  console.log('\n🏁 Complete.');
}
