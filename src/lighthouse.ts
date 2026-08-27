import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { config, runsDir } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workerPath = `${__dirname}/lighthouse-audit-worker.mjs`;

export async function runLighthouse(url: string, iteration: number, mode: string, runId?: number): Promise<void> {
  const params = JSON.stringify({
    url,
    iteration,
    mode,
    runId,
    runsDir,
    chromePath: config.chromePath,
  });

  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [workerPath, params], {
      stdio: ['ignore', 'inherit', 'inherit'],
    });

    let timer: ReturnType<typeof setTimeout> | undefined;

    if (config.auditTimeoutMs > 0) {
      timer = setTimeout(() => {
        child.kill();
        reject(new Error(`Audit worker timed out after ${config.auditTimeoutMs}ms for ${url}`));
      }, config.auditTimeoutMs);
    }

    child.on('close', (code) => {
      if (timer !== undefined) clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Audit worker exited with code ${code} for ${url}`));
      }
    });

    child.on('error', (err) => {
      if (timer !== undefined) clearTimeout(timer);
      reject(new Error(`Failed to start audit worker: ${err.message}`));
    });
  });
}
