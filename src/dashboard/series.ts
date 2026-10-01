/**
 * Registry of every value that can be charted, compared or trended.
 *
 * A denylist is deliberately not used here: new fields should appear in the
 * registry explicitly so that a metric cannot silently become unplottable.
 *
 * `noiseThreshold` is measured, not guessed. Each figure is the 90th percentile
 * of the absolute day-over-day change in that series across every URL and mode
 * in the stored data, expressed in the series' display units. A verdict of
 * "better" or "worse" therefore means a move larger than nine out of ten
 * ordinary day-to-day moves. Series whose measured noise is zero (the category
 * scores barely move) are floored at 1 point so a single-point wobble on an
 * otherwise stable series is not reported as a change.
 */

export type UnitFamily = 'score' | 'time' | 'unitless' | 'magnitude';

export interface TrendSeries {
  key: string;
  group: 'categories' | 'metrics';
  label: string;
  short: string;
  family: UnitFamily;
  /** Stored value divided by this to get the display value. */
  divisor: number;
  decimals: number;
  unit: string;
  lowerIsBetter: boolean;
  /** Good/avg boundaries in display units, for grading. Absent = ungraded. */
  thresholds?: [number, number];
  /** Day-over-day noise floor in display units. */
  noiseThreshold: number;
}

/**
 * Format a display value, e.g. 1.23 s.
 *
 * `decimals` and `unit` describe this on their own, so the registry stays pure
 * JSON and survives the trip into the browser as a plain object. An earlier
 * per-series `format` function could not: `JSON.stringify` drops functions, so
 * every `spec.format(...)` call in the dashboard threw `TypeError: spec.format
 * is not a function`, which silently disabled the direction-of-travel table,
 * the run modal and the audit registry chart.
 */
export function formatValue(series: TrendSeries, value: number): string {
  return `${value.toFixed(series.decimals)}${series.unit}`;
}

export const SERIES: TrendSeries[] = [
  {
    key: 'performance',
    group: 'categories',
    label: 'Performance',
    short: 'Perf',
    family: 'score',
    divisor: 1,
    decimals: 1,
    unit: '',
    lowerIsBetter: false,
    thresholds: [50, 90],
    noiseThreshold: 10,
  },
  {
    key: 'accessibility',
    group: 'categories',
    label: 'Accessibility',
    short: 'A11y',
    family: 'score',
    divisor: 1,
    decimals: 1,
    unit: '',
    lowerIsBetter: false,
    thresholds: [50, 90],
    noiseThreshold: 1,
  },
  {
    key: 'best-practices',
    group: 'categories',
    label: 'Best Practices',
    short: 'BP',
    family: 'score',
    divisor: 1,
    decimals: 1,
    unit: '',
    lowerIsBetter: false,
    thresholds: [50, 90],
    noiseThreshold: 1,
  },
  {
    key: 'seo',
    group: 'categories',
    label: 'SEO',
    short: 'SEO',
    family: 'score',
    divisor: 1,
    decimals: 1,
    unit: '',
    lowerIsBetter: false,
    thresholds: [50, 90],
    noiseThreshold: 1,
  },
  {
    key: 'fcp',
    group: 'metrics',
    label: 'First Contentful Paint',
    short: 'FCP',
    family: 'time',
    divisor: 1000,
    decimals: 2,
    unit: 's',
    lowerIsBetter: true,
    thresholds: [1.8, 3],
    noiseThreshold: 0.77,
  },
  {
    key: 'lcp',
    group: 'metrics',
    label: 'Largest Contentful Paint',
    short: 'LCP',
    family: 'time',
    divisor: 1000,
    decimals: 2,
    unit: 's',
    lowerIsBetter: true,
    thresholds: [2.5, 4],
    noiseThreshold: 3.22,
  },
  {
    key: 'tbt',
    group: 'metrics',
    label: 'Total Blocking Time',
    short: 'TBT',
    family: 'time',
    divisor: 1,
    decimals: 0,
    unit: 'ms',
    lowerIsBetter: true,
    thresholds: [200, 600],
    noiseThreshold: 128,
  },
  {
    key: 'cls',
    group: 'metrics',
    label: 'Cumulative Layout Shift',
    short: 'CLS',
    family: 'unitless',
    divisor: 1,
    decimals: 3,
    unit: '',
    lowerIsBetter: true,
    thresholds: [0.1, 0.25],
    noiseThreshold: 0.08,
  },
  {
    key: 'si',
    group: 'metrics',
    label: 'Speed Index',
    short: 'SI',
    family: 'time',
    divisor: 1000,
    decimals: 2,
    unit: 's',
    lowerIsBetter: true,
    thresholds: [3.4, 5.8],
    noiseThreshold: 1.5,
  },
  {
    key: 'tti',
    group: 'metrics',
    label: 'Time to Interactive',
    short: 'TTI',
    family: 'time',
    divisor: 1000,
    decimals: 2,
    unit: 's',
    lowerIsBetter: true,
    thresholds: [3.8, 7.3],
    noiseThreshold: 2.86,
  },
  {
    key: 'serverResponse',
    group: 'metrics',
    label: 'Server Response',
    short: 'Server',
    family: 'time',
    divisor: 1,
    decimals: 0,
    unit: 'ms',
    lowerIsBetter: true,
    noiseThreshold: 566,
  },
  {
    key: 'domSize',
    group: 'metrics',
    label: 'DOM Elements',
    short: 'DOM',
    family: 'magnitude',
    divisor: 1,
    decimals: 0,
    unit: 'nodes',
    lowerIsBetter: true,
    noiseThreshold: 20,
  },
  {
    key: 'jsExecTime',
    group: 'metrics',
    label: 'JS Execution Time',
    short: 'JS',
    family: 'time',
    divisor: 1,
    decimals: 0,
    unit: 'ms',
    lowerIsBetter: true,
    noiseThreshold: 204,
  },
  {
    key: 'totalByteWeight',
    group: 'metrics',
    label: 'Total Page Weight',
    short: 'Weight',
    family: 'magnitude',
    divisor: 1048576,
    decimals: 2,
    unit: 'MB',
    lowerIsBetter: true,
    noiseThreshold: 0.66,
  },
];

export const SERIES_BY_KEY: Record<string, TrendSeries> = Object.fromEntries(
  SERIES.map((s) => [s.key, s]),
);

export function getSeries(key: string): TrendSeries {
  const found = SERIES_BY_KEY[key];
  if (!found) throw new Error(`Unknown series: ${key}`);
  return found;
}

/** Pull the stored (undivided) value for a series out of a condensed entry. */
export function rawValue(entry: { categories: any; metrics: any }, key: string): number | null {
  const group = SERIES_BY_KEY[key]?.group === 'categories' ? 'categories' : 'metrics';
  const value = entry?.[group]?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Convert a stored value to its display value. */
export function toDisplay(series: TrendSeries, raw: number | null): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  return raw / series.divisor;
}

export const FAMILY_ORDER: UnitFamily[] = ['score', 'time', 'unitless', 'magnitude'];

export const FAMILY_LABELS: Record<UnitFamily, string> = {
  score: 'Score (0-100)',
  time: 'Time (ms)',
  unitless: 'Unitless',
  magnitude: 'Magnitude (log)',
};

export const DEFAULT_SERIES_KEY = 'performance';
