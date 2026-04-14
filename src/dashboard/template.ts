import { styles } from './styles';
import { clientJs } from './client';
import { StatsData } from '../utils';
import { config } from '../config';

/** Half-life in days for exponential time-decay weighting */
const HALF_LIFE_DAYS = 7;
const DECAY_LAMBDA = Math.LN2 / HALF_LIFE_DAYS;

/**
 * Simple average for an array of objects, extracting a nested or direct key.
 */
function calcAvg(arr: any[], prefix: string | undefined, key: string): number {
  if (!arr || !arr.length) return 0;
  const values = arr
    .map((a) => {
      const val = prefix ? (a[prefix] ? a[prefix][key] : undefined) : a[key];
      return val != null && !isNaN(val) ? val : null;
    })
    .filter((v) => v !== null);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/**
 * Time-weighted average: each entry's weight decays exponentially based on
 * how old it is relative to the newest entry. Half-life = 7 days.
 *
 * weight(entry) = e^(-λ × age_in_days)
 *
 * Where age_in_days = (newest_timestamp - entry_timestamp) / 86400000
 */
function calcWeightedAvg(arr: any[], prefix: string | undefined, key: string): number {
  if (!arr || !arr.length) return 0;

  const entries = arr
    .map((a) => {
      const val = prefix ? (a[prefix] ? a[prefix][key] : undefined) : a[key];
      const ts = a.timestamp || 0;
      return val != null && !isNaN(val) ? { val, ts } : null;
    })
    .filter((v): v is { val: number; ts: number } => v !== null);

  if (entries.length === 0) return 0;
  if (entries.length === 1) return entries[0].val;

  const newestTs = Math.max(...entries.map((e) => e.ts));

  let weightedSum = 0;
  let totalWeight = 0;
  for (const entry of entries) {
    const ageDays = (newestTs - entry.ts) / 86400000;
    const weight = Math.exp(-DECAY_LAMBDA * ageDays);
    weightedSum += entry.val * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

function buildMetricsRow(metrics: any, url: string, prefix: string): string {
  const fcp = metrics.fcp ? (metrics.fcp / 1000).toFixed(2) + 's' : '-';
  const lcp = metrics.lcp ? (metrics.lcp / 1000).toFixed(2) + 's' : '-';
  const tbt = metrics.tbt ? metrics.tbt.toFixed(0) + 'ms' : '-';
  const cls = metrics.cls ? metrics.cls.toFixed(3) : '-';
  const si = metrics.si ? (metrics.si / 1000).toFixed(2) + 's' : '-';
  const tti = metrics.tti ? (metrics.tti / 1000).toFixed(2) + 's' : '-';

  const getGrade = (val: number | null, thresholds: number[]) => {
    if (!val) return 'none';
    if (val < thresholds[0]) return 'good';
    if (val < thresholds[1]) return 'avg';
    return 'poor';
  };

  return `<tr class="${prefix.toLowerCase()}">
    <td class="url-cell" title="${url}"><a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a></td>
    <td class="mode-cell"><span class="badge ${prefix.toLowerCase()}">${prefix}</span></td>
    <td class="${getGrade(metrics.fcp, [1800, 3000])}">${fcp}</td>
    <td class="${getGrade(metrics.lcp, [2500, 4000])}">${lcp}</td>
    <td class="${getGrade(metrics.tbt, [200, 600])}">${tbt}</td>
    <td class="${getGrade(metrics.cls, [0.1, 0.25])}">${cls}</td>
    <td class="${getGrade(metrics.si, [3400, 5800])}">${si}</td>
    <td class="${getGrade(metrics.tti, [3800, 7300])}">${tti}</td>
  </tr>`;
}

export function generateHtml(statsData: StatsData): string {
  const reportPath = `${config.baseDir}/visual-summary.html`;
  const urls = Object.keys(statsData.urls);
  const urlLabels = urls.map((u) => {
    try {
      const url = new URL(u);
      return url.host + url.pathname + url.search;
    } catch {
      return u;
    }
  });

  const categoryKeys = ['performance', 'accessibility', 'best-practices', 'seo'];

  // Collect all unique modes across all URLs
  const allModes = Array.from(new Set(Object.values(statsData.urls).flatMap(u => Object.keys(u.modes))));
  
  // Group data by mode for various visualizations
  const modeDataAvg: Record<string, IterationEntry[][]> = {};
  const modeDataRaw: Record<string, IterationEntry[][]> = {};
  const modePerf: Record<string, number[]> = {};
  const overallModePerf: Record<string, number> = {};
  const modeMetrics: Record<string, any[]> = {};

  for (const mode of allModes) {
    modeDataAvg[mode] = urls.map(u => statsData.urls[u].modes[mode] || []);
    modeDataRaw[mode] = urls.map(u => statsData.urls[u].modesRaw[mode] || []);
    
    modePerf[mode] = modeDataAvg[mode].map(d => calcWeightedAvg(d, 'categories', 'performance'));
    overallModePerf[mode] = calcWeightedAvg(modeDataAvg[mode].flat(), 'categories', 'performance');
    
    modeMetrics[mode] = urls.map(url => ({
      fcp: calcWeightedAvg(statsData.urls[url].modes[mode] || [], 'metrics', 'fcp'),
      lcp: calcWeightedAvg(statsData.urls[url].modes[mode] || [], 'metrics', 'lcp'),
      tbt: calcWeightedAvg(statsData.urls[url].modes[mode] || [], 'metrics', 'tbt'),
      cls: calcWeightedAvg(statsData.urls[url].modes[mode] || [], 'metrics', 'cls'),
      si: calcWeightedAvg(statsData.urls[url].modes[mode] || [], 'metrics', 'si'),
      tti: calcWeightedAvg(statsData.urls[url].modes[mode] || [], 'metrics', 'tti'),
    }));
  }

  const totalRuns = statsData.runs.length;
  const allAveragedRuns = Object.values(statsData.urls).flatMap(u => Object.values(u.modes).flat());
  const totalRunGroups = allAveragedRuns.length;
  const avgIterations = totalRunGroups > 0 
    ? allAveragedRuns.reduce((sum, r) => sum + (r.iterationCount || 1), 0) / totalRunGroups 
    : 0;

  // Aggregate performance and metrics are already handled in the loop above.

  // Trend data uses the averaged-per-run data
  const trendData = urls.map((url) => {
    const modesTrend: Record<string, any[]> = {};
    for (const mode of allModes) {
      modesTrend[mode] = (statsData.urls[url].modes[mode] || []).map((r) => ({
        x: r.timestamp,
        y: r.categories.performance,
        iterationCount: r.iterationCount || 1,
        summary: { 
          id: r.id || r.fileName, 
          url: r.url, 
          urlLabel: r.urlLabel || url, 
          mode: mode, 
          timestamp: r.timestamp, 
          categories: r.categories, 
          metrics: r.metrics 
        },
      }));
    }
    return {
      label: (() => {
        try {
          const u = new URL(url);
          return u.host + u.pathname + u.search;
        } catch {
          return url;
        }
      })(),
      modes: modesTrend
    };
  });

  const allRunsData = statsData.runs.map((r) => ({
    urlIndex: urls.indexOf(r.url),
    urlLabel: (() => {
      try {
        const u = new URL(r.url);
        return u.host + u.pathname + u.search;
      } catch {
        return r.url;
      }
    })(),
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
      categories: r.categories,
      metrics: r.metrics,
    },
  }));

  // Time-weighted metrics for the table
  const metricsRows = urls
    .flatMap((url) => {
      return allModes.map(mode => {
        const entries = statsData.urls[url].modes[mode] || [];
        if (entries.length === 0) return '';
        const avg = {
          fcp: calcWeightedAvg(entries, 'metrics', 'fcp'),
          lcp: calcWeightedAvg(entries, 'metrics', 'lcp'),
          tbt: calcWeightedAvg(entries, 'metrics', 'tbt'),
          cls: calcWeightedAvg(entries, 'metrics', 'cls'),
          si: calcWeightedAvg(entries, 'metrics', 'si'),
          tti: calcWeightedAvg(entries, 'metrics', 'tti'),
        };
        return buildMetricsRow(avg, url, mode);
      });
    })
    .join('');

  const clientInjected = clientJs
    .replace(/\bINJECT_urlLabels\b/g, JSON.stringify(urlLabels))
    .replace(/\bINJECT_allModes\b/g, JSON.stringify(allModes))
    .replace(/\bINJECT_modePerf\b/g, JSON.stringify(modePerf))
    .replace(/\bINJECT_modeMetrics\b/g, JSON.stringify(modeMetrics))
    .replace(/\bINJECT_trendData\b/g, JSON.stringify(trendData))
    .replace(/\bINJECT_allRunsData\b/g, JSON.stringify(allRunsData))
    .replace(/\bINJECT_categoryKeys\b/g, JSON.stringify(categoryKeys))
    .replace(/\bINJECT_modeDataAvg\b/g, JSON.stringify(modeDataAvg))
    .replace(/\bINJECT_modeDataRaw\b/g, JSON.stringify(modeDataRaw));

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
                    <strong>Total Audits:</strong> The total number of individual Lighthouse iterations run across all pages.<br><br>
                    <strong>Mode Health:</strong> An overall performance score from 0 to 100 for that specific device and network profile. A score of 90+ is considered Good. It is calculated by taking the weighted average of the Performance category score for all URLs, where newer tests are weighted exponentially more heavily than older tests (7-day half-life).
                </div>
            </div>

            <div class="stats-grid">
                <div class="card stat-card">
                    <div class="label">Total Audits</div>
                    <div class="value">${totalRuns}</div>
                    <div class="trend">${totalRunGroups} averaged runs across ${urls.length} pages</div>
                </div>
                ${allModes.map(mode => `
                <div class="card stat-card">
                    <div class="label">${mode.replace('-', ' ').toUpperCase()} Health</div>
                    <div class="value">${overallModePerf[mode].toFixed(0)}</div>
                    <div class="trend">Time-weighted · Target: 90+</div>
                </div>`).join('')}
                <div class="card stat-card">
                    <div class="label">Data Quality</div>
                    <div class="value">${avgIterations.toFixed(2)}</div>
                    <div class="trend">Avg iterations per data point</div>
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
                <p>Complete statistical mapping for every page. Recent data has more influence.</p>
            </div>

            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>URL PATH</th>
                            <th>TYPE</th>
                            <th>FCP</th>
                            <th>LCP</th>
                            <th>TBT</th>
                            <th>CLS</th>
                            <th>SI</th>
                            <th>TTI</th>
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
                    <strong>Performance Envelope (Box Plot):</strong> Shows the distribution of scores across multiple runs. The box represents the middle 50% of your scores, and the vertical line inside is the median. A smaller, tighter box indicates highly consistent performance.<br><br>
                    <strong>Iterative Progression (Line Chart):</strong> Tracks how the time-weighted average score has changed over time. Dashed lines indicate unthrottled environments (Desktop, Mobile WiFi), while solid lines represent throttled environments (Mobile 4G).
                </div>
            </div>

            <div class="chart-container">
                <div class="chart-header">
                    <h3>Performance Envelope</h3>
                    <p>Visualizing score range (Min/Avg/Max) across all individual iterations.</p>
                </div>
                <div class="chart-box">
                    <canvas id="distributionChart"></canvas>
                </div>
            </div>

            <div class="chart-container">
                <div class="chart-header">
                    <h3>Iterative Progression Trend</h3>
                    <p>Historical score progression. Each point is an averaged run. Drag slider handles, scroll to zoom, click points for details. Double-click to reset.</p>
                </div>
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
                    <h3>Core Web Vitals</h3>
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