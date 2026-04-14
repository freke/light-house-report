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
  dataFile: string;
  emulations: ('mobile' | 'desktop')[];
}

export interface CliArgs {
  runIterations: number | undefined;
  compress: boolean;
  quality: number;
}

let loadedUrls: string[] = [];
try {
  const urlsPath = path.resolve(__dirname, 'urls.json');
  loadedUrls = JSON.parse(fs.readFileSync(urlsPath, 'utf8'));
} catch {
  // Try local relative path if __dirname fails or file not found
  try {
    loadedUrls = JSON.parse(fs.readFileSync('./urls.json', 'utf8'));
  } catch {
    console.error(
      '❌ Fatal: Could not load urls.json. Please create it with an array of URLs.',
    );
    process.exit(1);
  }
}

export const config: Config = {
  urls: loadedUrls,
  iterations: 3,
  delay: 3,
  baseDir: './reports',
  reportSubDir: 'runs',
  dataFile: 'persistent_stats.json',
  emulations: ['mobile-4g', 'mobile-wifi', 'desktop'],
};



export const runsDir = path.join(config.baseDir, config.reportSubDir);
if (!fs.existsSync(runsDir)) {
  fs.mkdirSync(runsDir, { recursive: true });
}

export const dataPath = path.join(config.baseDir, config.dataFile);

export function loadStatsData(): {
  runs: any[];
  urls: Record<string, any>;
} {
  try {
    return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  } catch {
    return { runs: [], urls: {} };
  }
}

export const args = process.argv.slice(2).reduce<CliArgs>(
  (acc, arg, i, arr) => {
    if (arg === '--run' && arr[i + 1] !== undefined) {
      const val = parseInt(arr[i + 1], 10);
      if (!isNaN(val)) acc.runIterations = val;
    }
    if (arg === '--compress') acc.compress = true;
    if (arg === '--quality' && arr[i + 1] !== undefined) {
      const val = parseInt(arr[i + 1], 10);
      if (!isNaN(val) && val >= 1 && val <= 100) acc.quality = val;
    }
    return acc;
  },
  { runIterations: undefined, compress: false, quality: 30 },
);