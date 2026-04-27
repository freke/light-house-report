import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface Config {
  urls: string[];
  iterations: number;
  delay: number;
  baseDir: string;
  reportSubDir: string;
  emulations: ('mobile-4g' | 'mobile-wifi' | 'desktop')[];
  chromePath?: string;
}

export interface CliArgs {
  runIterations: number | undefined;
  compress: boolean;
  quality: number;
}

function loadUrls(): string[] {
  try {
    const urlsPath = path.resolve(__dirname, 'urls.json');
    return JSON.parse(fs.readFileSync(urlsPath, 'utf8'));
  } catch {
    try {
      return JSON.parse(fs.readFileSync('./urls.json', 'utf8'));
    } catch {
      throw new Error('❌ Fatal: Could not load urls.json. Please create it with an array of URLs.');
    }
  }
}

function loadConfigFile(): any {
  try {
    return JSON.parse(fs.readFileSync('./lighthouse-runner.config.json', 'utf8'));
  } catch {
    return {};
  }
}

const fileConfig = loadConfigFile();

const ALLOWED_EMULATIONS = ['mobile-4g', 'mobile-wifi', 'desktop'] as const;
type EmulationMode = typeof ALLOWED_EMULATIONS[number];

const rawEmulations: string[] = process.env.LHR_EMULATIONS
  ? process.env.LHR_EMULATIONS.split(',').map(s => s.trim())
  : fileConfig.emulations || [...ALLOWED_EMULATIONS];

const validEmulations = rawEmulations.filter((e): e is EmulationMode => {
  if ((ALLOWED_EMULATIONS as readonly string[]).includes(e)) return true;
  console.warn(`⚠️ Warning: Unknown emulation mode "${e}" ignored. Allowed: ${ALLOWED_EMULATIONS.join(', ')}`);
  return false;
});

export const config: Config = {
  urls: fileConfig.urls || loadUrls(),
  iterations: Number(process.env.LHR_ITERATIONS) || fileConfig.iterations || 3,
  delay: Number(process.env.LHR_DELAY) || fileConfig.delay || 3,
  baseDir: process.env.LHR_BASE_DIR || fileConfig.baseDir || './reports',
  reportSubDir: process.env.LHR_REPORT_SUBDIR || fileConfig.reportSubDir || 'runs',
  emulations: validEmulations,
  chromePath: process.env.CHROME_PATH || fileConfig.chromePath,
};



export const runsDir = path.join(config.baseDir, config.reportSubDir);
if (!fs.existsSync(runsDir)) {
  fs.mkdirSync(runsDir, { recursive: true });
}


export const args = process.argv.slice(2).reduce<CliArgs>(
  (acc, arg, i, arr) => {
    if (arg === '--run') {
      const nextVal = arr[i + 1];
      if (nextVal === undefined) {
        console.error('❌ Error: --run flag requires a numeric value.');
        process.exit(1);
      }
      const val = parseInt(nextVal, 10);
      if (isNaN(val)) {
        console.error(`❌ Error: Invalid value for --run: "${nextVal}". Must be a number.`);
        process.exit(1);
      }
      acc.runIterations = val;
    }
    if (arg === '--compress') acc.compress = true;
    if (arg === '--quality') {
      const nextVal = arr[i + 1];
      if (nextVal === undefined) {
        console.error('❌ Error: --quality flag requires a numeric value between 1 and 100.');
        process.exit(1);
      }
      const val = parseInt(nextVal, 10);
      if (isNaN(val) || val < 1 || val > 100) {
        console.error(`❌ Error: Invalid value for --quality: "${nextVal}". Must be a number between 1 and 100.`);
        process.exit(1);
      }
      acc.quality = val;
    }
    return acc;
  },
  { runIterations: undefined, compress: false, quality: 30 },
);