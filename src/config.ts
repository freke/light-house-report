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
  tester: string;
  region: string;
  quality: number;
  skipExcel: boolean;
  skipZip: boolean;
}

export interface CliArgs {
  runIterations: number | undefined;
  compress: boolean;
  quality: number;
  testDate: string;
  tester: string;
  region: string;
  excelOutput: string | undefined;
  zipOutput: string | undefined;
  skipExcel: boolean;
  skipZip: boolean;
}

function loadConfigFile(): Partial<Config> {
  try {
    return JSON.parse(fs.readFileSync('./config.json', 'utf8'));
  } catch {
    try {
      return JSON.parse(fs.readFileSync('./lighthouse-runner.config.json', 'utf8'));
    } catch {
      return {};
    }
  }
}

const fileConfig = loadConfigFile();

if (!fileConfig.urls || !Array.isArray(fileConfig.urls) || fileConfig.urls.length === 0) {
  throw new Error('❌ Fatal: config.json must contain a non-empty urls array.');
}

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

export const args = process.argv.slice(2).reduce<CliArgs>(
  (acc, arg, i, arr) => {
    if (arg === '--run') {
      const nextVal = arr[i + 1];
      if (nextVal !== undefined && !nextVal.startsWith('--')) {
        const val = parseInt(nextVal, 10);
        if (isNaN(val)) {
          console.error(`❌ Error: Invalid value for --run: "${nextVal}". Must be a number.`);
          process.exit(1);
        }
        acc.runIterations = val;
      } else {
        acc.runIterations = Number(process.env.LHR_ITERATIONS) || Number(fileConfig.iterations) || 3;
      }
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
    if (arg === '--date' && arr[i + 1] !== undefined && !arr[i + 1].startsWith('--')) {
      acc.testDate = arr[i + 1];
    }
    if (arg === '--tester' && arr[i + 1] !== undefined && !arr[i + 1].startsWith('--')) {
      acc.tester = arr[i + 1];
    }
    if (arg === '--region' && arr[i + 1] !== undefined && !arr[i + 1].startsWith('--')) {
      acc.region = arr[i + 1];
    }
    if (arg === '--excel-output' && arr[i + 1] !== undefined && !arr[i + 1].startsWith('--')) {
      acc.excelOutput = arr[i + 1];
    }
    if (arg === '--zip-output' && arr[i + 1] !== undefined && !arr[i + 1].startsWith('--')) {
      acc.zipOutput = arr[i + 1];
    }
    if (arg === '--no-excel') acc.skipExcel = true;
    if (arg === '--no-zip') acc.skipZip = true;
    return acc;
  },
  { runIterations: undefined, compress: false, quality: 30, testDate: '', tester: '', region: '', excelOutput: undefined, zipOutput: undefined, skipExcel: false, skipZip: false },
);

export const config: Config = {
  urls: fileConfig.urls,
  iterations: Number(process.env.LHR_ITERATIONS) || fileConfig.iterations || 3,
  delay: Number(process.env.LHR_DELAY) || fileConfig.delay || 3,
  baseDir: process.env.LHR_BASE_DIR || fileConfig.baseDir || './reports',
  reportSubDir: process.env.LHR_REPORT_SUBDIR || fileConfig.reportSubDir || 'runs',
  emulations: validEmulations,
  chromePath: process.env.CHROME_PATH || fileConfig.chromePath,
  tester: args.tester || fileConfig.tester || '',
  region: args.region || fileConfig.region || '',
  quality: fileConfig.quality || 30,
  skipExcel: fileConfig.skipExcel || false,
  skipZip: fileConfig.skipZip || false,
};



export const runsDir = path.join(config.baseDir, config.reportSubDir);
if (!fs.existsSync(runsDir)) {
  fs.mkdirSync(runsDir, { recursive: true });
}