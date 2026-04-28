/** Half-life in days for exponential time-decay weighting */
const HALF_LIFE_DAYS = 7;
const DECAY_LAMBDA = Math.LN2 / HALF_LIFE_DAYS;

/**
 * Simple average for an array of values, ignoring nulls.
 */
export function calcSimpleAvg(arr: any[], prefix: string | null, key: string): number {
  if (!arr || !arr.length) return 0;

  const values = arr
    .map((entry) => {
      const value = prefix ? entry[prefix]?.[key] : entry[key];
      return value != null && !isNaN(value) ? value : null;
    })
    .filter((value) => value !== null);

  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

/**
 * Time-weighted average: each entry's weight decays exponentially based on
 * how old it is relative to the newest entry. Half-life = 7 days.
 *
 * weight(entry) = e^(-λ × age_in_days)
 *
 * Where age_in_days = (newest_timestamp - entry_timestamp) / 86400000
 *
 * Entries missing a timestamp are assigned the newest timestamp found in the
 * dataset (or Date.now() if no entries have timestamps), giving them full
 * weight instead of being penalized as very old entries.
 */
export function calcTimeWeightedAvg(arr: any[], prefix: string | null, key: string): number {
  if (!arr || !arr.length) return 0;

  const candidates = arr
    .map((a) => {
      const val = prefix ? (a[prefix] ? a[prefix][key] : undefined) : a[key];
      const tsRaw = a.timestamp;
      const ts = Number(tsRaw);
      const validTs = Number.isFinite(ts) && ts > 0 ? ts : undefined;
      return val != null && !isNaN(val) ? { val, ts: validTs } : null;
    })
    .filter((v): v is { val: number; ts: number | undefined } => v !== null);

  if (candidates.length === 0) return 0;
  if (candidates.length === 1) return candidates[0].val;

  const withTs = candidates.filter((e): e is { val: number; ts: number } => e.ts !== undefined);
  const newestTs = withTs.length > 0 ? Math.max(...withTs.map((e) => e.ts)) : Date.now();

  let weightedSum = 0;
  let totalWeight = 0;
  for (const entry of candidates) {
    const ts = entry.ts !== undefined ? entry.ts : newestTs;
    const ageDays = (newestTs - ts) / 86400000;
    const weight = Math.exp(-DECAY_LAMBDA * ageDays);
    weightedSum += entry.val * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Calculate average using time-weighted method (default for all reports).
 * This is the unified calculation method for both Excel and HTML reports.
 */
export function calcAvg(arr: any[], prefix: string | null, key: string): number {
  return calcTimeWeightedAvg(arr, prefix, key);
}
