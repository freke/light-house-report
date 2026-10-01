import { styles } from './styles.js';
import { clientJs } from './client.js';
import { StatsData, IterationEntry } from '../utils.js';
import { calcAvg } from '../calculations.js';
import { SERIES, SERIES_BY_KEY, FAMILY_ORDER, FAMILY_LABELS, DEFAULT_SERIES_KEY, TrendSeries, toDisplay, formatValue } from './series.js';
import { aggregateByDay, compareWindows, DayPoint, Verdict } from './trend.js';

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getSafeHref(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return url;
    }
  } catch {
    // Not a valid absolute URL
  }
  return 'about:blank';
}

const METRIC_COLUMNS: { key: string; header: string }[] = [
  { key: 'fcp', header: 'FCP' },
  { key: 'lcp', header: 'LCP' },
  { key: 'tbt', header: 'TBT' },
  { key: 'cls', header: 'CLS' },
  { key: 'si', header: 'SI' },
  { key: 'tti', header: 'TTI' },
  { key: 'serverResponse', header: 'Server' },
  { key: 'jsExecTime', header: 'JS Exec' },
  { key: 'domSize', header: 'DOM' },
  { key: 'totalByteWeight', header: 'Weight' },
];

function buildMetricsRow(metrics: any, url: string, prefix: string): string {
  const escapedUrl = escapeHTML(url);
  const safeHref = getSafeHref(url);

  const cells = METRIC_COLUMNS.map(({ key }) => {
    const spec = SERIES_BY_KEY[key];
    const display = toDisplay(spec, typeof metrics[key] === 'number' ? metrics[key] : null);
    const grade = !spec.thresholds
      ? 'none'
      : display == null
        ? 'none'
        : spec.lowerIsBetter
          ? display < spec.thresholds[0] ? 'good' : display < spec.thresholds[1] ? 'avg' : 'poor'
          : display > spec.thresholds[1] ? 'good' : display > spec.thresholds[0] ? 'avg' : 'poor';
    return `<td class="${grade}">${display == null ? '-' : escapeHTML(formatValue(spec, display))}</td>`;
  }).join('');

  return `<tr class="${prefix.toLowerCase()}">
    <td class="url-cell" title="${escapedUrl}"><a href="${safeHref}" target="_blank" rel="noopener noreferrer">${escapedUrl}</a></td>
    <td class="mode-cell"><span class="badge ${prefix.toLowerCase()}">${prefix}</span></td>
    ${cells}
  </tr>`;
}

const SPARK_W = 132;
const SPARK_H = 34;
const SPARK_PAD = 3;
const SPARK_GAP_DAYS = 7;

const VERDICT_LABEL: Record<Verdict, string> = {
  better: 'Better',
  worse: 'Worse',
  flat: 'Flat',
  insufficient: 'No data',
};

function escapeAttr(str: string): string {
  return escapeHTML(str);
}

/**
 * Inline sparkline of one series across the daily points. Segments are broken
 * wherever the value is missing or more than a week separates two test days, so
 * a gap in testing is visible as a gap rather than a straight line.
 */
function buildSparkline(points: DayPoint[], seriesKey: string, verdict: Verdict): string {
  const series = SERIES_BY_KEY[seriesKey];
  const plotted = points
    .map((p) => ({ x: p.x, y: p.values[seriesKey], n: p.sampleCount, day: p.day }))
    .filter((p) => typeof p.y === 'number' && Number.isFinite(p.y)) as {
    x: number;
    y: number;
    n: number;
    day: string;
  }[];

  if (plotted.length < 2) {
    return `<svg class="spark" viewBox="0 0 ${SPARK_W} ${SPARK_H}" role="img" aria-label="No trend available"></svg>`;
  }

  const xs = plotted.map((p) => p.x);
  const ys = plotted.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  }

  const sx = (x: number) =>
    SPARK_PAD + ((x - minX) / (maxX - minX || 1)) * (SPARK_W - SPARK_PAD * 2);
  const sy = (y: number) =>
    SPARK_H - SPARK_PAD - ((y - minY) / (maxY - minY)) * (SPARK_H - SPARK_PAD * 2);

  // Break the polyline at nulls and at gaps longer than a week.
  const segments: string[][] = [];
  let current: string[] = [];
  let prevX: number | null = null;
  for (const p of points) {
    const value = p.values[seriesKey];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      if (current.length) segments.push(current);
      current = [];
      prevX = null;
      continue;
    }
    if (prevX != null && p.x - prevX > SPARK_GAP_DAYS * 86_400_000) {
      if (current.length) segments.push(current);
      current = [];
    }
    current.push(`${sx(p.x).toFixed(1)},${sy(value).toFixed(1)}`);
    prevX = p.x;
  }
  if (current.length) segments.push(current);

  const title = plotted
    .map((p) => `${p.day}  ${formatValue(series, p.y)}  (${p.n} run${p.n === 1 ? '' : 's'})`)
    .join('\n');

  const paths = segments
    .filter((seg) => seg.length > 1)
    .map((seg) => `<polyline points="${seg.join(' ')}" />`)
    .join('');
  const dots = plotted
    .map((p) => `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="1.7" />`)
    .join('');

  return `<svg class="spark spark-${verdict}" viewBox="0 0 ${SPARK_W} ${SPARK_H}" role="img" aria-label="${escapeAttr(title)}"><title>${escapeHTML(title)}</title>${paths}${dots}</svg>`;
}

function buildDirectionRow(row: {
  label: string;
  mode: string;
  points: DayPoint[];
  current: number | null;
  delta: number | null;
  verdict: Verdict;
  currentN: number;
  priorN: number;
  dayCount: number;
}, series: TrendSeries): string {
  const deltaText =
    row.delta == null ? '—' : `${row.delta > 0 ? '+' : ''}${row.delta.toFixed(series.decimals)}${series.unit}`;
  const currentText = row.current == null ? '—' : formatValue(series, row.current);
  const title = `${row.label} · ${row.mode}\n${row.dayCount} test day(s)\nlast window: ${row.currentN} run(s), prior window: ${row.priorN} run(s)`;

  return `<tr class="verdict-${row.verdict}" data-url="${escapeAttr(row.label)}" data-mode="${escapeAttr(row.mode)}" title="${escapeAttr(title)}">
    <td class="url-cell"><a href="${getSafeHref(row.label.startsWith('http') ? row.label : '')}" target="_blank" rel="noopener noreferrer">${escapeHTML(row.label)}</a></td>
    <td class="mode-cell"><span class="badge ${row.mode.toLowerCase()}">${escapeHTML(row.mode)}</span></td>
    <td class="num" data-field="current">${escapeHTML(currentText)}</td>
    <td class="num delta" data-field="delta">${escapeHTML(deltaText)}</td>
    <td class="verdict-cell"><span class="verdict-pill verdict-${row.verdict}">${VERDICT_LABEL[row.verdict]}</span></td>
    <td class="spark-cell" data-field="spark">${buildSparkline(row.points, series.key, row.verdict)}</td>
  </tr>`;
}

function buildSeriesChips(): string {
  const groups: { id: string; title: string; items: TrendSeries[] }[] = [
    { id: 'categories', title: 'Scores', items: SERIES.filter((s) => s.group === 'categories') },
    { id: 'metrics', title: 'Metrics', items: SERIES.filter((s) => s.group === 'metrics') },
  ];
  return groups
    .map(
      (group) => `
        <div class="chip-group">
          <span class="chip-group-title">${group.title}</span>
          ${group.items
            .map(
              (s) => `<button type="button" class="series-chip${s.key === DEFAULT_SERIES_KEY ? ' active' : ''}" data-series="${s.key}" aria-pressed="${s.key === DEFAULT_SERIES_KEY}">${escapeHTML(s.short)}</button>`,
            )
            .join('')}
        </div>`,
    )
    .join('');
}

const MODE_SHORT: Record<string, string> = {
  desktop: 'Desktop',
  'mobile-4g': 'Mobile 4G',
  'mobile-wifi': 'Mobile WiFi',
};

/**
 * URL chips for the trend chart. Every page starts visible: the chart plots
 * whichever selection is active rather than one hardcoded page, so a URL can
 * never be absent from the legend or silently dropped from the data.
 */
function buildUrlChips(urls: string[], labels: Record<string, string>): string {
  return `
    <div class="chip-group">
      <span class="chip-group-title">Pages</span>
      ${urls
        .map(
          (url) =>
            `<button type="button" class="series-chip active" data-url="${escapeAttr(url)}" aria-pressed="true" title="${escapeAttr(url)}">${escapeHTML(shortenUrl(labels[url] ?? url))}</button>`,
        )
        .join('')}
    </div>`;
}

function buildModeChips(modes: string[]): string {
  return `
    <div class="chip-group">
      <span class="chip-group-title">Emulation</span>
      ${modes
        .map(
          (mode) =>
            `<button type="button" class="series-chip active" data-mode="${escapeAttr(mode)}" aria-pressed="true" title="${escapeAttr(mode)}">${escapeHTML(MODE_SHORT[mode] ?? mode)}</button>`,
        )
        .join('')}
    </div>`;
}

/**
 * Strip the scheme and host so a chip reads `/ja/specifications` instead of a
 * full 80-character URL. Labels are stored as host + path with no scheme, so
 * the scheme is added back before parsing rather than assuming one.
 */
function shortenUrl(label: string): string {
  try {
    const parsed = new URL(/^[a-z]+:\/\//i.test(label) ? label : `https://${label}`);
    const path = parsed.pathname.replace(/\/$/, '');
    return path ? path + parsed.search : parsed.hostname;
  } catch {
    return label;
  }
}

export function generateHtml(statsData: StatsData): string {
  const urls = Object.keys(statsData.urls);
  const urlLabels = urls.map((u) => {
    try {
      const url = new URL(u);
      return url.host + url.pathname + url.search;
    } catch {
      return u;
    }
  });

  const categoryKeys = SERIES.filter(s => s.group === 'categories').map(s => s.key);

  // Collect all unique modes across all URLs
  const allModes = Array.from(new Set(Object.values(statsData.urls).flatMap(u => Object.keys(u.modes))));

  // Group data by mode for various visualizations
  const modeDataAvg: Record<string, IterationEntry[][]> = {};
  const modeDataRaw: Record<string, IterationEntry[][]> = {};
  const modePerf: Record<string, number[]> = {};
  const overallModePerf: Record<string, number> = {};
  const modeMetrics: Record<string, any[]> = {};

  const METRIC_KEYS = SERIES.filter(s => s.group === 'metrics').map(s => s.key);
  const getWeightedMetrics = (entries: any[]) => {
    const result: Record<string, number> = {};
    for (const key of METRIC_KEYS) {
      result[key] = calcAvg(entries, 'metrics', key);
    }
    return result;
  };

  for (const mode of allModes) {
    modeDataAvg[mode] = urls.map(u => statsData.urls[u].modes[mode] || []);
    modeDataRaw[mode] = urls.map(u => statsData.urls[u].modesRaw[mode] || []);

    modePerf[mode] = modeDataAvg[mode].map(d => calcAvg(d, 'categories', 'performance'));
    const perUrlScores = modePerf[mode].filter(v => v != null && !isNaN(v));
    overallModePerf[mode] = perUrlScores.length > 0
      ? perUrlScores.reduce((sum, val) => sum + val, 0) / perUrlScores.length
      : 0;

    modeMetrics[mode] = urls.map(url => getWeightedMetrics(statsData.urls[url].modes[mode] || []));
  }

  const totalRuns = statsData.runs.length;
  const allDayPoints = Object.values(statsData.urls).flatMap(u => Object.values(u.modes).flat());
  const totalDayPoints = allDayPoints.length;
  const avgRunsPerDay = totalDayPoints > 0
    ? allDayPoints.reduce((sum, r) => sum + (r.sampleCount || 1), 0) / totalDayPoints
    : 0;

  // Aggregate performance and metrics are already handled in the loop above.

  const newestTimestamp = statsData.runs.length
    ? Math.max(...statsData.runs.map((r) => r.timestamp))
    : Date.now();

  // Per-day points per URL and mode. Values are display units so the client can
  // plot any series without re-deriving divisors.
  const seriesKeys = SERIES.map((s) => s.key);
  const dayPoints: Record<string, Record<string, DayPoint[]>> = {};
  for (const url of urls) {
    dayPoints[url] = {};
    for (const mode of allModes) {
      dayPoints[url][mode] = aggregateByDay(statsData.urls[url].modes[mode] || []);
    }
  }

  // Direction table: one row per URL and mode, worst change first.
  const directionRows = urls
    .flatMap((url) =>
      allModes.map((mode) => {
        const points = dayPoints[url][mode];
        if (!points || points.length === 0) return null;
        const comparison = compareWindows(points, DEFAULT_SERIES_KEY, 30, newestTimestamp);
        return {
          url,
          label: statsData.urls[url].label,
          mode,
          points,
          current: comparison.current,
          delta: comparison.delta,
          verdict: comparison.verdict,
          currentN: comparison.currentN,
          priorN: comparison.priorN,
          dayCount: points.length,
        };
      }),
    )
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => {
      if (a.verdict === 'insufficient' && b.verdict !== 'insufficient') return 1;
      if (b.verdict === 'insufficient' && a.verdict !== 'insufficient') return -1;
      const av = a.delta ?? -Infinity;
      const bv = b.delta ?? -Infinity;
      return av - bv;
    });

  const compactPoints = (points: DayPoint[]) =>
    points.map((p) => {
      const row: Record<string, number | null> = { x: p.x, n: p.sampleCount, t: p.timestamp };
      for (const key of seriesKeys) {
        if (p.values[key] !== undefined) row[key] = p.values[key];
      }
      return row;
    });

  const trendData = urls.map((url) => ({
    label: statsData.urls[url].label,
    url,
    modes: Object.fromEntries(allModes.map((mode) => [mode, compactPoints(dayPoints[url][mode] || [])])),
  }));

  // Modal payloads carry display units so the run modal has one code path
  // whether it was opened from a daily trend point or an individual run.
  const allRunsData = statsData.runs.map((r) => {
    const categories: Record<string, number> = {};
    const metrics: Record<string, number> = {};
    for (const spec of SERIES) {
      const source: Record<string, number | null> = spec.group === 'categories'
        ? (r.categories as Record<string, number | null>)
        : (r.metrics as Record<string, number | null>);
      const raw = source?.[spec.key];
      const display = toDisplay(spec, typeof raw === 'number' ? raw : null);
      if (display == null) continue;
      if (spec.group === 'categories') categories[spec.key] = display;
      else metrics[spec.key] = display;
    }
    return {
      urlIndex: urls.indexOf(r.url),
      urlLabel: r.urlLabel,
      score: r.categories.performance,
      mode: r.mode,
      fileName: r.fileName,
      timestamp: r.timestamp,
      summary: {
        id: r.id,
        url: r.url,
        urlLabel: r.urlLabel,
        mode: r.mode,
        timestamp: r.timestamp,
        categories,
        metrics,
      },
    };
  });

  // Time-weighted metrics for the table
  const metricsRows = urls
    .flatMap((url) => {
      return allModes.map(mode => {
        const entries = statsData.urls[url].modes[mode] || [];
        if (entries.length === 0) return '';
        const avg = getWeightedMetrics(entries);
        return buildMetricsRow(avg, url, mode);
      });
    })
    .join('');

  const safeInject = (data: any) => JSON.stringify(data).replace(/<\/script>/g, '<\\/script>');

  const clientInjected = clientJs
    .replace(/\bINJECT_urlLabels\b/g, () => safeInject(urlLabels))
    .replace(/\bINJECT_allModes\b/g, () => safeInject(allModes))
    .replace(/\bINJECT_modePerf\b/g, () => safeInject(modePerf))
    .replace(/\bINJECT_modeMetrics\b/g, () => safeInject(modeMetrics))
    .replace(/\bINJECT_trendData\b/g, () => safeInject(trendData))
    .replace(/\bINJECT_allRunsData\b/g, () => safeInject(allRunsData))
    .replace(/\bINJECT_categoryKeys\b/g, () => safeInject(categoryKeys))
    .replace(/\bINJECT_modeDataAvg\b/g, () => safeInject(modeDataAvg))
    .replace(/\bINJECT_modeDataRaw\b/g, () => safeInject(modeDataRaw))
    .replace(/\bINJECT_seriesRegistry\b/g, () => safeInject(SERIES))
    .replace(/\bINJECT_familyOrder\b/g, () => safeInject(FAMILY_ORDER))
    .replace(/\bINJECT_familyLabels\b/g, () => safeInject(FAMILY_LABELS))
    .replace(/\bINJECT_newestTimestamp\b/g, () => safeInject(newestTimestamp));

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Lighthouse Performance Dashboard</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;600;700&display=swap" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.2"></script>
    <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-zoom@2.2.0/dist/chartjs-plugin-zoom.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/@sgratzl/chartjs-chart-boxplot@4.3.0/build/index.umd.min.js"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/noUiSlider/15.7.1/nouislider.min.css" rel="stylesheet">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/noUiSlider/15.7.1/nouislider.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/luxon@3.4.4/build/global/luxon.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-luxon@1.3.1/dist/chartjs-adapter-luxon.bundle.min.js"></script>
    <style>${styles}</style>
</head>
<body>
    <nav class="sidebar">
        <div class="logo">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            <span>LHR Dashboard</span>
        </div>
        <ul class="nav-links">
            <a href="#overview" class="nav-item active">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                <span>Overview</span>
            </a>
            <a href="#metrics" class="nav-item">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
                <span>Performance</span>
            </a>
            <a href="#trends" class="nav-item">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                <span>Analysis</span>
            </a>
            <a href="#runs" class="nav-item">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                <span>History</span>
            </a>
        </ul>
        <div class="theme-toggle">
            <span>Theme</span>
            <button id="themeBtn" title="Toggle Light/Dark Mode">
                <svg id="themeIcon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
                <span id="themeText">Dark</span>
            </button>
        </div>
    </nav>

    <main>
        <header>
            <div class="header-info">
                <h1>Performance Intelligence</h1>
                <p>Advanced real-time analytics for your digital ecosystem. Identifying friction, optimizing vitals, and ensuring a premium user experience across all devices.</p>
            </div>
        </header>

        <section id="overview">
            <div class="section-header">
                <h2>Executive Summary</h2>
                <p>A high-level health check of your digital property. Scores are time-weighted (7-day half-life) — recent runs have more influence than older ones.</p>
                <div class="explainer-box">
                    <strong>Total Runs:</strong> The total number of individual Lighthouse runs recorded across all pages.<br><br>
                    <strong>Mode Health:</strong> An overall performance score from 0 to 100 for that specific device and network profile. A score of 90+ is considered Good. It is calculated by taking the weighted average of the Performance category score for all URLs, where newer tests are weighted exponentially more heavily than older tests (7-day half-life).<br><br>
                    <strong>Runs per Day:</strong> How many runs on average are averaged into a single daily data point. Each point in every chart represents one UTC test day.
                </div>
            </div>

            <div class="stats-grid">
                <div class="card stat-card">
                    <div class="label">Total Runs</div>
                    <div class="value">${totalRuns}</div>
                    <div class="trend">${totalDayPoints} test days across ${urls.length} pages</div>
                </div>
                ${allModes.map(mode => `
                <div class="card stat-card">
                    <div class="label">${mode.replace('-', ' ').toUpperCase()} Health</div>
                    <div class="value">${(overallModePerf[mode] ?? 0).toFixed(0)}</div>
                    <div class="trend">Time-weighted · Target: 90+</div>
                </div>`).join('')}
                <div class="card stat-card">
                    <div class="label">Runs per Day</div>
                    <div class="value">${avgRunsPerDay.toFixed(2)}</div>
                    <div class="trend">Average runs averaged into each daily point</div>
                </div>
            </div>
        </section>

        <section id="performance">
            <div class="chart-container">
                <div class="chart-header">
                    <h3>Page Performance Breakdown</h3>
                    <p>Comparative scoring per URL. Scores are time-weighted — recent runs contribute more to the displayed value.</p>
                </div>
                <div class="chart-box">
                    <canvas id="performanceChart"></canvas>
                </div>
            </div>

            <div class="chart-container">
                <div class="chart-header">
                    <h3>Site Quality Radar</h3>
                    <p>Holistic health across categories.</p>
                </div>
                <div class="chart-box" style="height: 600px;">
                    <canvas id="categoriesChart"></canvas>
                </div>
            </div>
        </section>

        <section id="metrics">
            <div class="section-header">
                <h2>Technical Vitals Analysis</h2>
                <p>Detailed performance telemetry based on Google's Core Web Vitals. Values are time-weighted averages.</p>
                <div class="explainer-box">
                    <strong>FCP (First Contentful Paint):</strong> Time until the first text or image is painted. Lower is better.<br>
                    <strong>LCP (Largest Contentful Paint):</strong> Time until the largest text or image block is rendered. Critical for perceived load speed.<br>
                    <strong>TBT (Total Blocking Time):</strong> Total amount of time between FCP and Time to Interactive where the main thread was blocked long enough to prevent input responsiveness.<br>
                    <strong>CLS (Cumulative Layout Shift):</strong> Measures visual stability. A score below 0.1 is Good.<br>
                    <strong>SI (Speed Index):</strong> How quickly the contents of a page are visibly populated.<br>
                    <strong>TTI (Time to Interactive):</strong> Amount of time it takes for the page to become fully interactive.
                </div>
            </div>

            <div id="metricsChartsContainer">
                ${allModes.map(mode => `
                <div class="chart-container">
                    <div class="chart-header">
                        <h3>${mode.replace('-', ' ').toUpperCase()} Core Metrics</h3>
                    </div>
                    <div class="chart-box">
                        <canvas id="metricsChart-${mode}"></canvas>
                    </div>
                </div>`).join('')}
            </div>

            <div class="section-header" style="margin-top: 6rem;">
                <h3>Audit Log (Time-Weighted Averages)</h3>
                <p>Complete statistical mapping for every page. Recent data has more influence. All ten stored metrics are shown; Server, JS Exec, DOM and Weight have no published thresholds, so they are listed ungraded.</p>
            </div>

            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>URL PATH</th>
                            <th>TYPE</th>
                            ${METRIC_COLUMNS.map(c => `<th>${c.header}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${metricsRows}
                    </tbody>
                </table>
            </div>
        </section>

        <section id="trends">
            <div class="section-header">
                <h2>Stability & Landscape Analysis</h2>
                <p>Tracking variability and consistency over time.</p>
                <div class="explainer-box">
                    <strong>Direction of Travel:</strong> The primary answer to "are the pages getting better or worse". Each row compares the most recent window against the window before it and only calls a change when it is larger than the measured day-to-day noise for that metric, so ordinary jitter is not reported as a regression. Worst changes are listed first.<br><br>
                    <strong>Performance Envelope (Box Plot):</strong> The distribution of scores across individual runs, not across days, so it shows how repeatable a single measurement is. A smaller, tighter box indicates highly consistent performance.<br><br>
                    <strong>Iterative Progression (Line Chart):</strong> One point per UTC test day. Lines are broken wherever more than a week separates two test days, so a gap in testing never looks like continuous measurement. Dashed lines indicate unthrottled environments (Desktop, Mobile WiFi); solid lines are throttled (Mobile 4G).<br><br>
                    <strong>Note on early data:</strong> Runs from 2026-04-09 to 2026-04-15 predate the current emulation configuration. The large step changes around them reflect a configuration change, not a site change.
                </div>
            </div>

            <div class="chart-container" id="directionContainer">
                <div class="chart-header">
                    <h3>Direction of Travel</h3>
                    <p>Better or worse, judged against measured noise. Worst first.</p>
                </div>
                <div class="controls-row">
                    <label class="control">
                        <span>Metric</span>
                        <select id="directionMetric">
                            ${SERIES.map(s => `<option value="${s.key}"${s.key === DEFAULT_SERIES_KEY ? ' selected' : ''}>${escapeHTML(s.label)}</option>`).join('')}
                        </select>
                    </label>
                    <label class="control">
                        <span>Window</span>
                        <select id="directionWindow">
                            <option value="14">14 days</option>
                            <option value="30" selected>30 days</option>
                            <option value="60">60 days</option>
                            <option value="90">90 days</option>
                        </select>
                    </label>
                    <span class="control-note" id="directionNote"></span>
                </div>
                <div class="table-container">
                    <table class="direction-table">
                        <thead>
                            <tr>
                                <th>URL PATH</th>
                                <th>TYPE</th>
                                <th class="num" id="dirCurrentHead">Current</th>
                                <th class="num">Change</th>
                                <th>Verdict</th>
                                <th>Daily trend</th>
                            </tr>
                        </thead>
                        <tbody id="directionBody">
                            ${directionRows.map(r => buildDirectionRow(r, SERIES_BY_KEY[DEFAULT_SERIES_KEY])).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="chart-container">
                <div class="chart-header">
                    <h3>Performance Envelope</h3>
                    <p>Visualizing score range (Min/Avg/Max) across all individual runs.</p>
                </div>
                <div class="chart-box">
                    <canvas id="distributionChart"></canvas>
                </div>
            </div>

            <div class="chart-container">
                <div class="chart-header">
                    <h3>Iterative Progression Trend</h3>
                    <p>One point per test day. Choose series, pages and emulation modes with the controls below. Drag slider handles, scroll to zoom, click points for details. Double-click to reset.</p>
                </div>
                <div class="controls-row" id="seriesChips">
                    ${buildSeriesChips()}
                </div>
                <div class="controls-row" id="urlChips">
                    ${buildUrlChips(urls, Object.fromEntries(urls.map((u) => [u, statsData.urls[u].label])))}
                </div>
                <div class="controls-row" id="modeChips">
                    ${buildModeChips(allModes)}
                </div>
                <p class="control-note" id="trendsDatasetNote"></p>
                <div class="timeline-slider-container">
                    <div id="timelineSlider" class="timeline-slider" style="height: 24px;"></div>
                    <div class="timeline-current-labels">
                        <span class="current-label">Visible: <span id="timelineStart"></span> - <span id="timelineEnd"></span></span>
                    </div>
                </div>
                <div class="chart-box">
                    <canvas id="trendsChart"></canvas>
                </div>
            </div>
        </section>

        <section id="runs">
            <div class="section-header">
                <h2>Raw Audit Registry</h2>
                <p>Individual test results for deep-level technical auditing.</p>
            </div>

            <div class="chart-container" id="scatterChartContainer">
                <div class="chart-header">
                    <h3>Discrete Run Mapping</h3>
                    <p>Click any point to open the corresponding Lighthouse HTML report.</p>
                </div>
                <div class="chart-box">
                    <canvas id="scatterChart"></canvas>
                </div>
            </div>
        </section>
    </main>

    <div id="runModal" class="modal">
        <div class="modal-content">
            <span class="close-modal">&times;</span>
            <div id="modalBody">
                <div class="modal-header">
                    <h2 id="modalTitle">Run Details</h2>
                    <p id="modalUrl" class="modal-url"></p>
                </div>
                <div class="modal-section">
                    <h3>Categories</h3>
                    <div id="modalCategories" class="metrics-grid"></div>
                </div>
                <div class="modal-section">
                    <h3>Metrics</h3>
                    <div id="modalMetrics" class="metrics-grid"></div>
                </div>
                <div class="modal-meta">
                    <span id="modalTimestamp"></span>
                    <span id="modalMode"></span>
                </div>
            </div>
        </div>
    </div>

    <script>${clientInjected}</script>
</body>
</html>`;
}