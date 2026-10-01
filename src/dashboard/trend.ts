import { TrendSeries, getSeries, rawValue, toDisplay } from './series.js';
import { utcDayKey, utcDayStartMs, MS_PER_DAY } from '../dates.js';

/**
 * Trend maths for "are the pages getting better or worse".
 *
 * Everything here works on one point per UTC test day rather than one per run.
 * The tool is often invoked several times in a day; treating those as separate
 * observations both overstates how much data exists and lets a busy day
 * dominate the decay-weighted average.
 */

/** A single UTC test day, averaged across every run recorded that day. */
export interface DayPoint {
  /** Epoch ms of 00:00 UTC on that day, used to place the point on an axis. */
  x: number;
  day: string;
  /** Display-unit value per series key. */
  values: Record<string, number | null>;
  /** Number of runs averaged into this day. */
  sampleCount: number;
  /** Latest run timestamp that day, used as the decay reference. */
  timestamp: number;
}

export type Verdict = 'better' | 'worse' | 'flat' | 'insufficient';

export interface WindowComparison {
  current: number | null;
  prior: number | null;
  delta: number | null;
  verdict: Verdict;
  currentN: number;
  priorN: number;
  currentDays: number;
  priorDays: number;
  points: DayPoint[];
}

export interface TrendEntry {
  timestamp: number;
  categories: Record<string, number | null>;
  metrics: Record<string, number | null>;
}

function mean(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

/**
 * Collapse run-level entries into one point per UTC test day.
 * Values are means of that day's runs, in display units.
 */
export function aggregateByDay(entries: TrendEntry[]): DayPoint[] {
  const byDay = new Map<string, TrendEntry[]>();

  for (const entry of entries) {
    if (typeof entry?.timestamp !== 'number' || !Number.isFinite(entry.timestamp)) continue;
    const day = utcDayKey(entry.timestamp);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(entry);
  }

  const points: DayPoint[] = [];
  for (const [day, group] of byDay) {
    const values: Record<string, number | null> = {};
    for (const key of Object.keys(group[0].categories ?? {}).concat(Object.keys(group[0].metrics ?? {}))) {
      const series = safeSeries(key);
      if (!series) continue;
      values[key] = toDisplay(series, mean(group.map((e) => rawValue(e, key))));
    }
    points.push({
      x: utcDayStartMs(day),
      day,
      values,
      sampleCount: group.length,
      timestamp: Math.max(...group.map((e) => e.timestamp)),
    });
  }

  points.sort((a, b) => a.x - b.x);
  return points;
}

function safeSeries(key: string): TrendSeries | null {
  try {
    return getSeries(key);
  } catch {
    return null;
  }
}

/**
 * Compare the most recent `windowDays` against the `windowDays` before it.
 *
 * Plain means are used inside each window rather than the 7-day exponential
 * decay: a decay would let the newest test day dominate a 30-day window, and
 * the two windows have to be comparable for their difference to mean anything.
 * The decay-weighted figure is still available separately as the "current"
 * score, which is what it is good at.
 */
export function compareWindows(
  points: DayPoint[],
  seriesKey: string,
  windowDays: number,
  now: number,
  series?: TrendSeries,
): WindowComparison {
  const spec = series ?? getSeries(seriesKey);
  const values = (p: DayPoint) => p.values[seriesKey] ?? null;

  const current = points.filter((p) => p.timestamp > now - windowDays * MS_PER_DAY);
  const prior = points.filter(
    (p) => p.timestamp <= now - windowDays * MS_PER_DAY && p.timestamp > now - 2 * windowDays * MS_PER_DAY,
  );

  const currentMean = mean(current.map(values));
  const priorMean = mean(prior.map(values));
  const currentN = current.reduce((s, p) => s + p.sampleCount, 0);
  const priorN = prior.reduce((s, p) => s + p.sampleCount, 0);

  if (currentMean == null || priorMean == null || current.length === 0 || prior.length === 0) {
    return {
      current: currentMean,
      prior: priorMean,
      delta: null,
      verdict: 'insufficient',
      currentN,
      priorN,
      currentDays: current.length,
      priorDays: prior.length,
      points,
    };
  }

  const delta = currentMean - priorMean;
  const threshold = spec.noiseThreshold;
  const verdict: Verdict =
    Math.abs(delta) < threshold ? 'flat' : spec.lowerIsBetter ? (delta < 0 ? 'better' : 'worse') : delta > 0 ? 'better' : 'worse';

  return {
    current: currentMean,
    prior: priorMean,
    delta,
    verdict,
    currentN,
    priorN,
    currentDays: current.length,
    priorDays: prior.length,
    points,
  };
}
