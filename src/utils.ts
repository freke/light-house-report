import * as crypto from 'crypto';

export function getUrlHash(url: string): string {
  return crypto.createHash('md5').update(url).digest('hex').slice(0, 8);
}

export function getUrlLabel(url: string): string {
  try {
    const u = new URL(url);
    return u.host + u.pathname + u.search;
  } catch {
    return url;
  }
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface RunData {
  id: string;
  url: string;
  urlLabel: string;
  mode: string;
  iteration: number;
  timestamp: number;
  fileName: string;
  categories: {
    performance: number;
    accessibility: number;
    'best-practices': number;
    seo: number;
  };
  metrics: Record<string, number | null>;
  runId?: number;
}

export interface IterationEntry {
  iteration: number;
  timestamp: number;
  fileName: string;
  categories: Record<string, number | null>;
  metrics: Record<string, number | null>;
  runId?: number;
  iterationCount?: number;
}

export interface UrlData {
  label: string;
  modes: Record<string, IterationEntry[]>;
  modesRaw: Record<string, IterationEntry[]>;
}

export interface StatsData {
  runs: RunData[];
  urls: Record<string, UrlData>;
}