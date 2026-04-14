import { config, args } from './config';
import { sleep } from './utils';
import { extractDataFromReports } from './data-extract';
import { compressAllReports } from './compression';
import { runLighthouse } from './lighthouse';
import { generateVisualReport } from './dashboard';

let statsData = { runs: [], urls: {} };

async function main(): Promise<void> {
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
    for (let i = 1; i <= iterations; i++) {
      console.log(`\n--- 🔄 Round Robin: Pass ${i} of ${iterations} ---`);

      for (const url of config.urls) {
        for (const mode of config.emulations) {
          await runLighthouse(url, i, mode, runId);
          console.log(`Waiting ${config.delay}s...`);
          await sleep(config.delay * 1000);
        }
      }
    }
  }

  const extractedData = extractDataFromReports();
  statsData = extractedData;

  generateVisualReport(statsData);
  console.log('\n🏁 Complete.');
}

main().catch(console.error);