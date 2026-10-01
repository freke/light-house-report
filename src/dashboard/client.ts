export const clientJs = String.raw`const shortenLabel = (label) => {
  if (typeof label === 'string' && label.length > 24) {
    return label.substring(0, 12) + '...' + label.slice(-12);
  }
  return label || '';
};

const urlLabels = INJECT_urlLabels;
const allModes = INJECT_allModes;
const modePerf = INJECT_modePerf;
const modeMetrics = INJECT_modeMetrics;
const trendData = INJECT_trendData;
const allRunsData = INJECT_allRunsData;
const SERIES = INJECT_seriesRegistry;
const FAMILY_ORDER = INJECT_familyOrder;
const FAMILY_LABELS = INJECT_familyLabels;
const NEWEST_TS = INJECT_newestTimestamp;

const seriesByKey = Object.fromEntries(SERIES.map(s => [s.key, s]));
const GAP_DAYS = 7;
const MAX_DATASETS = 120;

// Declared up front so the theme updater, which runs before the charts exist,
// can safely ask whether the trend chart is available yet.
let trendsChart = null;
/**
 * Which series, pages and emulation modes the trend chart is plotting.
 *
 * These live in one holder because several readers (the axis map, the dataset
 * builder, the line count) need the same live list, and a chip toggle replaces
 * the array rather than mutating it. Reading through the holder keeps every
 * reader on the current value.
 */
const selection = {
  series: ['performance'],
  urls: trendData.map((d) => d.url),
  modes: allModes.slice(),
};

let fullMin = Infinity;
let fullMax = -Infinity;
let preservedZoom = null;

/**
 * UTC is the single day authority for this dashboard. utcDate mirrors
 * formatUtcDate in src/dates.ts, which the Node side uses for day bucketing,
 * the Excel test date and the zip name. It is restated here because this block
 * is emitted as a browser script and cannot import modules.
 */
const pad = (n) => n.toString().padStart(2, '0');
const utcDate = (ts) => {
  const d = new Date(ts);
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
};
const utcTime = (ts) => {
  const d = new Date(ts);
  return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds());
};
const utcDateTime = (ts) => utcDate(ts) + ' ' + utcTime(ts);

/**
 * Mirrors formatValue in src/dashboard/series.ts. That one cannot be imported
 * here because this block is emitted as a browser script, and the registry is
 * injected as JSON, so both copies are driven by the same decimals and unit.
 */
const formatValue = (spec, v) => {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toFixed(spec.decimals) + spec.unit;
};
const formatSigned = (spec, v) => {
  if (v == null || !Number.isFinite(v)) return '—';
  return (v > 0 ? '+' : '') + v.toFixed(spec.decimals) + spec.unit;
};

const escapeHTML = (str) => String(str)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const escapeAttr = escapeHTML;

const safeHref = (u) => {
  try {
    const parsed = new URL(u);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return u;
  } catch {}
  return 'about:blank';
};

const SPARK_W = 132;
const SPARK_H = 34;
const SPARK_PAD = 3;

function sparkSvg(points, seriesKey, verdict) {
  const spec = seriesByKey[seriesKey];
  const plotted = points
    .map(p => ({ x: p.x, y: p[seriesKey], n: p.n, day: utcDate(p.x) }))
    .filter(p => typeof p.y === 'number' && Number.isFinite(p.y));

  if (plotted.length < 2) {
    return '<svg class="spark" viewBox="0 0 ' + SPARK_W + ' ' + SPARK_H + '" role="img" aria-label="Not enough days to plot"></svg>';
  }

  const xs = plotted.map(p => p.x);
  const ys = plotted.map(p => p.y);
  const minX = Math.min.apply(null, xs);
  const maxX = Math.max.apply(null, xs);
  let minY = Math.min.apply(null, ys);
  let maxY = Math.max.apply(null, ys);
  if (minY === maxY) { minY -= 1; maxY += 1; }

  const sx = x => SPARK_PAD + ((x - minX) / (maxX - minX || 1)) * (SPARK_W - SPARK_PAD * 2);
  const sy = y => SPARK_H - SPARK_PAD - ((y - minY) / (maxY - minY)) * (SPARK_H - SPARK_PAD * 2);

  const segments = [];
  let current = [];
  let prevX = null;
  for (const p of points) {
    const value = p[seriesKey];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      if (current.length) segments.push(current);
      current = [];
      prevX = null;
      continue;
    }
    if (prevX != null && p.x - prevX > GAP_DAYS * 86400000) {
      if (current.length) segments.push(current);
      current = [];
    }
    current.push(sx(p.x).toFixed(1) + ',' + sy(value).toFixed(1));
    prevX = p.x;
  }
  if (current.length) segments.push(current);

  const title = plotted.map(p => p.day + '  ' + formatValue(spec, p.y) + '  (' + p.n + ' run' + (p.n === 1 ? '' : 's') + ')').join('\n');
  const paths = segments.filter(s => s.length > 1).map(s => '<polyline points="' + s.join(' ') + '" />').join('');
  const dots = plotted.map(p => '<circle cx="' + sx(p.x).toFixed(1) + '" cy="' + sy(p.y).toFixed(1) + '" r="1.7" />').join('');

  return '<svg class="spark spark-' + verdict + '" viewBox="0 0 ' + SPARK_W + ' ' + SPARK_H
    + '" role="img" aria-label="' + escapeAttr(title) + '"><title>' + escapeHTML(title) + '</title>'
    + paths + dots + '</svg>';
}

const colors = {
  blue: 'hsl(210, 100%, 50%)',
  orange: 'hsl(25, 95%, 55%)',
  amber: 'hsl(45, 95%, 50%)',
  teal: 'hsl(170, 70%, 45%)',
  gray: 'hsl(220, 15%, 50%)',
  purple: 'hsl(270, 70%, 60%)',
  pink: 'hsl(330, 80%, 60%)'
};

const modeColors = {
  'desktop': colors.blue,
  'mobile-4g': colors.orange,
  'mobile-wifi': colors.amber,
};

const getModeColor = (mode) => modeColors[mode] || colors.purple;

const transparentize = (hsl, alpha) => {
  return hsl.replace(/hsl\(/i, 'hsla(').replace(/\)\s*$/, ', ' + alpha + ')');
};

const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('section');

window.addEventListener('scroll', () => {
  let current = '';
  sections.forEach(section => {
    const sectionTop = section.offsetTop;
    if (pageYOffset >= (sectionTop - 300)) {
      current = section.getAttribute('id');
    }
  });

  navItems.forEach(item => {
    item.classList.remove('active');
    if (item.getAttribute('href').slice(1) === current) {
      item.classList.add('active');
    }
  });
});

const themeBtn = document.getElementById('themeBtn');
const body = document.body;
const themeText = document.getElementById('themeText');

function setTheme(isLight) {
  if (isLight) {
    body.classList.add('light-mode');
    if (themeText) themeText.innerText = 'Light';
    localStorage.setItem('lhr-theme', 'light');
  } else {
    body.classList.remove('light-mode');
    if (themeText) themeText.innerText = 'Dark';
    localStorage.setItem('lhr-theme', 'dark');
  }
  if (typeof updateChartThemes === 'function') updateChartThemes();
}

if (themeBtn) {
  themeBtn.addEventListener('click', () => setTheme(!body.classList.contains('light-mode')));
}
if (localStorage.getItem('lhr-theme') === 'light') setTheme(true);

function updateChartThemes() {
  const isLight = document.body.classList.contains('light-mode');
  const colorMain = isLight ? 'hsl(220, 20%, 15%)' : 'hsl(220, 10%, 95%)';
  const colorDim = isLight ? 'hsl(220, 15%, 45%)' : 'hsl(220, 10%, 70%)';
  const colorBorder = isLight ? 'hsla(220, 15%, 80%, 0.5)' : 'hsla(220, 15%, 25%, 0.4)';

  Chart.defaults.animation = false;
  Chart.defaults.color = colorDim;
  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.plugins.tooltip.backgroundColor = isLight ? 'white' : 'hsl(220, 15%, 15%)';
  Chart.defaults.plugins.tooltip.titleColor = colorMain;
  Chart.defaults.plugins.tooltip.bodyColor = colorDim;
  Chart.defaults.plugins.tooltip.borderColor = colorBorder;
  Chart.defaults.plugins.tooltip.borderWidth = 1;

  // The trend chart builds its axes dynamically, so re-theme them here.
  if (trendsChart && trendsChart.options && trendsChart.options.scales) {
    trendsChart.options.scales = buildScales(selection.series);
    trendsChart.update('none');
  }
}
updateChartThemes();

new Chart(document.getElementById('performanceChart'), {
  type: 'bar',
  data: {
    labels: urlLabels,
    datasets: allModes.map(mode => ({
      label: mode.replace('-', ' ').toUpperCase(),
      data: modePerf[mode],
      backgroundColor: getModeColor(mode),
      borderRadius: 8
    }))
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: { beginAtZero: true, max: 100, grid: { color: 'hsla(220, 15%, 50%, 0.1)' } },
      x: {
        grid: { display: false },
        ticks: {
          maxRotation: 35,
          minRotation: 35,
          labelOffset: 40,
          callback: function(v) { return shortenLabel(this.getLabelForValue(v)); }
        }
      }
    },
    plugins: { legend: { position: 'top', align: 'end', labels: { usePointStyle: true, padding: 25 } } }
  }
});

const catKeys = INJECT_categoryKeys;
const catLabels = { performance: 'Performance', accessibility: 'Accessibility', 'best-practices': 'Best Practices', seo: 'SEO' };
const modeDataAvg = INJECT_modeDataAvg;
const modeDataRaw = INJECT_modeDataRaw;

const getAggAvg = (data, key) => {
  const vals = data.flatMap(d => d.map(r => r.categories[key]).filter(v => typeof v === 'number' && Number.isFinite(v)));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
};

new Chart(document.getElementById('categoriesChart'), {
  type: 'radar',
  data: {
    labels: catKeys.map(k => catLabels[k]),
    datasets: allModes.map(mode => ({
      label: mode.replace('-', ' ').toUpperCase(),
      data: catKeys.map(k => getAggAvg(modeDataAvg[mode], k)),
      borderColor: getModeColor(mode),
      backgroundColor: transparentize(getModeColor(mode), 0.2),
      pointBackgroundColor: getModeColor(mode),
      borderWidth: 2
    }))
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      r: {
        beginAtZero: true, max: 100,
        grid: { color: 'hsla(220, 15%, 50%, 0.2)' },
        angleLines: { color: 'hsla(220, 15%, 50%, 0.2)' },
        pointLabels: {
          font: { size: 13, weight: '600' },
          backdropColor: 'transparent',
          backdropPadding: 0
        },
        ticks: {
          showLabelBackdrop: false,
          backdropColor: 'transparent',
          backdropPadding: 0,
          color: 'hsl(220, 10%, 70%)',
          font: { size: 10 }
        }
      }
    },
    plugins: { legend: { position: 'bottom', labels: { padding: 30 } } }
  }
});

const createMetricsChart = (id, data, colorPrimary) => {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: urlLabels,
      datasets: [
        { label: 'FCP (s)', data: data.map(d => d.fcp == null ? null : d.fcp / 1000), backgroundColor: colors.gray, borderRadius: 6 },
        { label: 'LCP (s)', data: data.map(d => d.lcp == null ? null : d.lcp / 1000), backgroundColor: colorPrimary, borderRadius: 6 },
        { label: 'TBT (ms)', data: data.map(d => d.tbt == null ? null : d.tbt), borderColor: colors.teal, backgroundColor: colors.teal, type: 'line', yAxisID: 'y1', tension: 0.4, pointRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: {
            maxRotation: 35,
            minRotation: 35,
            labelOffset: 40,
            callback: function(v) { return shortenLabel(this.getLabelForValue(v)); }
          }
        },
        y: { title: { display: true, text: 'Seconds (Lower is Better)' }, grid: { color: 'hsla(220, 15%, 50%, 0.1)' } },
        y1: { position: 'right', title: { display: true, text: 'TBT Milliseconds' }, grid: { display: false } }
      },
      plugins: { legend: { position: 'bottom', labels: { padding: 20 } } }
    }
  });
};

allModes.forEach(mode => {
  createMetricsChart('metricsChart-' + mode, modeMetrics[mode], getModeColor(mode));
});

const getRawScores = (data) => {
  return data.map(u => u.map(r => r.categories.performance).filter(v => typeof v === 'number' && Number.isFinite(v)));
};

new Chart(document.getElementById('distributionChart'), {
  type: 'boxplot',
  data: {
    labels: urlLabels,
    datasets: allModes.map(mode => ({
      label: mode.replace('-', ' ').toUpperCase(),
      data: getRawScores(modeDataRaw[mode]),
      backgroundColor: transparentize(getModeColor(mode), 0.4),
      borderColor: getModeColor(mode),
      borderWidth: 2,
      itemRadius: 3
    }))
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: { max: 100, min: 0, grid: { color: 'hsla(220, 15%, 50%, 0.1)' } },
      x: {
        grid: { display: false },
        ticks: {
          maxRotation: 35,
          minRotation: 35,
          labelOffset: 40,
          callback: function(v) { return shortenLabel(this.getLabelForValue(v)); }
        }
      }
    },
    plugins: { legend: { position: 'bottom', labels: { padding: 20 } } }
  }
});

let isUpdatingSlider = false;
let isUpdatingChart = false;
let timelineSlider = null;

/** Axis id assigned to each unit family, given the current selection. */
function assignAxes(keys) {
  const families = [...new Set(keys.map(k => seriesByKey[k].family))]
    .sort((a, b) => FAMILY_ORDER.indexOf(a) - FAMILY_ORDER.indexOf(b));
  const map = {};
  families.forEach((fam, i) => { map[fam] = i === 0 ? 'y' : 'y' + i; });
  return { families, map };
}

function tickFormatterFor(family, keys) {
  const spec = SERIES.find(s => s.family === family && keys.includes(s.key)) || SERIES.find(s => s.family === family);
  if (!spec) return (v) => String(v);
  return (v) => {
    if (v == null || !Number.isFinite(v)) return '';
    const scaled = v * spec.divisor;
    if (Math.abs(scaled) >= 1048576 && spec.family === 'magnitude') return (scaled / 1048576).toFixed(1) + 'M';
    if (Math.abs(scaled) >= 1000 && spec.family === 'magnitude') return (scaled / 1000).toFixed(0) + 'k';
    if (scaled !== 0 && Math.abs(scaled) < 0.01) return scaled.toPrecision(2);
    return Number(scaled.toFixed(spec.decimals)).toString();
  };
}

function buildScales(keys) {
  const { families, map } = assignAxes(keys);
  const isLight = document.body.classList.contains('light-mode');
  const colorMain = isLight ? 'hsl(220, 20%, 15%)' : 'hsl(220, 10%, 95%)';
  const colorDim = isLight ? 'hsl(220, 15%, 45%)' : 'hsl(220, 10%, 70%)';

  const scales = {
    x: {
      type: 'linear',
      title: { display: true, text: 'Test Day (UTC)', color: colorMain, font: { weight: '700' } },
      grid: { color: 'hsla(220, 15%, 50%, 0.1)' },
      ticks: { color: colorDim, callback: (v) => utcDate(v) }
    }
  };

  families.forEach((fam, i) => {
    const axisId = i === 0 ? 'y' : 'y' + i;
    const show = families.length > 1;
    scales[axisId] = {
      type: fam === 'magnitude' ? 'logarithmic' : 'linear',
      position: i === 0 ? 'left' : 'right',
      display: show,
      title: { display: show, text: FAMILY_LABELS[fam], color: colorMain, font: { weight: '700' } },
      grid: { color: i === 0 ? 'hsla(220, 15%, 50%, 0.1)' : 'transparent', drawOnChartArea: i === 0 },
      ticks: { color: colorDim, callback: tickFormatterFor(fam, keys) }
    };
    if (fam === 'score') {
      scales[axisId].min = 0;
      scales[axisId].max = 100;
    }
  });

  return scales;
}

/**
 * Turn daily points into a line dataset for one series, inserting a null
 * separator wherever more than a week separates two test days so Chart.js
 * breaks the line instead of interpolating across a gap in testing.
 */
function buildSeriesData(points, seriesKey) {
  const out = [];
  let prevX = null;
  for (const p of points) {
    const value = typeof p[seriesKey] === 'number' ? p[seriesKey] : null;
    if (value == null) {
      if (out.length) out.push({ x: p.x, y: null, missing: true });
      prevX = p.x;
      continue;
    }
    if (prevX != null && p.x - prevX > GAP_DAYS * 86400000) {
      out.push({ x: prevX + (p.x - prevX) / 2, y: null, gap: true });
    }
    out.push({ x: p.x, y: value, n: p.n, t: p.t, day: utcDate(p.x) });
    prevX = p.x;
  }
  return out;
}

function buildTrendDatasets() {
  const { map } = assignAxes(selection.series);
  const modeShort = { 'desktop': 'D', 'mobile-4g': 'M-4G', 'mobile-wifi': 'M-WiFi' };
  const entries = trendData.filter(d => selection.urls.includes(d.url));

  const datasets = [];
  entries.forEach((entry) => {
    for (const mode of selection.modes) {
      const points = entry.modes[mode] || [];
      for (const seriesKey of selection.series) {
        const spec = seriesByKey[seriesKey];
        datasets.push({
          label: entry.label + ' · ' + (modeShort[mode] || mode) + ' · ' + spec.short,
          data: buildSeriesData(points, seriesKey),
          yAxisID: map[spec.family] || 'y',
          borderColor: getModeColor(mode),
          borderDash: mode !== 'mobile-4g' ? [5, 5] : [],
          backgroundColor: 'transparent',
          spanGaps: false,
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 7,
          hitRadius: 10,
          _seriesKey: seriesKey,
          _mode: mode,
          _url: entry.label
        });
      }
    }
  });
  return datasets;
}

/**
 * Chart.js gets slow and unreadable past a few hundred lines, but dropping
 * datasets silently is indistinguishable from a page having no data — the
 * failure mode that made URLs look missing. So the cap is reported in the
 * section subtitle instead of being applied by slicing.
 */
function updateDatasetCapNote() {
  const el = document.getElementById('trendsDatasetNote');
  if (!el) return;
  const count = selection.series.length * selection.urls.length * selection.modes.length;
  if (count <= MAX_DATASETS) {
    el.textContent = count + ' line(s) plotted across ' + selection.urls.length + ' page(s) and ' + selection.modes.length + ' mode(s).';
    return;
  }
  el.textContent = count + ' lines requested, which is past the ' + MAX_DATASETS
    + '-line rendering budget. Narrow the selection above to keep the chart responsive.';
}

new Chart(document.getElementById('trendsChart'), {
  type: 'line',
  data: { datasets: buildTrendDatasets() },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'nearest', intersect: false },
    scales: buildScales(selection.series),
    plugins: {
      zoom: {
        zoom: {
          wheel: { enabled: true },
          pinch: { enabled: true },
          mode: 'x',
          onZoom: ({ chart }) => {
            if (isUpdatingChart || isUpdatingSlider) return;
            isUpdatingSlider = true;
            try {
              const min = chart.scales.x.min;
              const max = chart.scales.x.max;
              preservedZoom = { min, max };
              if (timelineSlider) timelineSlider.set([min, max], true, true);
              updateVisibleLabels(min, max);
            } finally {
              isUpdatingSlider = false;
            }
          }
        },
        pan: {
          enabled: true,
          mode: 'x',
          drag: { enabled: true },
          onPan: ({ chart }) => {
            if (isUpdatingChart || isUpdatingSlider) return;
            isUpdatingSlider = true;
            try {
              const min = chart.scales.x.min;
              const max = chart.scales.x.max;
              preservedZoom = { min, max };
              if (timelineSlider) timelineSlider.set([min, max], true, true);
              updateVisibleLabels(min, max);
            } finally {
              isUpdatingSlider = false;
            }
          }
        }
      },
      legend: { position: 'bottom', labels: { boxWidth: 10, padding: 15 } },
      tooltip: {
        callbacks: {
          title: function(context) {
            const raw = context[0]?.raw;
            if (!raw) return '';
            return raw.day ? raw.day + ' (UTC)' : utcDate(raw.x);
          },
          label: function(context) {
            const raw = context.raw;
            if (raw.y == null) return null;
            const spec = seriesByKey[context.dataset._seriesKey];
            return context.dataset.label + ': ' + formatValue(spec, raw.y);
          },
          afterTitle: function(context) {
            const raw = context[0]?.raw;
            if (raw && raw.n > 1) return raw.n + ' runs averaged into this day';
            return '';
          }
        }
      }
    },
    onClick: (e, el) => {
      if (!el.length) return;
      const point = e.chart.data.datasets[el[0].datasetIndex].data[el[0].index];
      if (point && point.day) {
        const entry = trendData.find(d => d.label === point._url);
        if (entry) {
          const dayPoints = (entry.modes[point._mode] || []).filter(p => utcDate(p.x) === point.day);
          if (dayPoints.length) showRunModal(buildDayModal(entry, point._mode, dayPoints[0]));
        }
      }
    }
  }
});

function buildDayModal(entry, mode, dayPoint) {
  const categories = {};
  const metrics = {};
  for (const spec of SERIES) {
    const v = dayPoint[spec.key];
    if (v == null) continue;
    if (spec.group === 'categories') categories[spec.key] = v;
    else metrics[spec.key] = v;
  }
  return {
    id: dayPoint.t,
    url: entry.url,
    urlLabel: entry.label,
    mode: mode,
    timestamp: dayPoint.t,
    day: dayPoint.day,
    sampleCount: dayPoint.n,
    categories: categories,
    metrics: metrics
  };
}


trendsChart = Chart.getChart('trendsChart');
updateDatasetCapNote();

function updateVisibleLabels(minVal, maxVal) {
  const startEl = document.getElementById('timelineStart');
  const endEl = document.getElementById('timelineEnd');
  if (startEl) startEl.textContent = utcDate(minVal);
  if (endEl) endEl.textContent = utcDate(maxVal);
}

const sliderEl = document.getElementById('timelineSlider');

if (sliderEl && trendsChart) {
  trendData.forEach(d => {
    Object.values(d.modes).flat().forEach(p => {
      if (p.x < fullMin) fullMin = p.x;
      if (p.x > fullMax) fullMax = p.x;
    });
  });

  if (fullMin !== Infinity) {
    const initialMin = trendsChart.scales.x.min;
    const initialMax = trendsChart.scales.x.max;

    timelineSlider = noUiSlider.create(sliderEl, {
      range: { min: fullMin, max: fullMax },
      start: [initialMin, initialMax],
      connect: true,
      behaviour: 'tap-drag',
      tooltips: [
        { to: (v) => utcDate(v) },
        { to: (v) => utcDate(v) }
      ],
      format: {
        to: (value) => Math.round(value),
        from: (value) => Number(value)
      }
    });

    if (trendsChart.options.plugins?.zoom) {
      trendsChart.options.plugins.zoom.limits = {
        x: {
          min: fullMin,
          max: fullMax,
          minRange: (fullMax - fullMin) * 0.01
        }
      };
      trendsChart.update('none');
    }

    timelineSlider.on('update', (values) => {
      if (isUpdatingSlider) return;
      isUpdatingChart = true;
      try {
        const min = Number(values[0]);
        const max = Number(values[1]);
        trendsChart.zoomScale('x', { min, max });
        preservedZoom = { min, max };
        updateVisibleLabels(min, max);
      } finally {
        isUpdatingChart = false;
      }
    });


    updateVisibleLabels(initialMin, initialMax);
  }
}

/* ---------- series chips: multi-select for the trend chart ---------- */

/**
 * Toggling a chip rewrites the whole dataset list rather than flipping the
 * Chart.js hidden flag, so a chip and a legend entry always agree about what is
 * plotted. Each list is guarded so the chart can never end up empty.
 */
function toggleIn(list, key) {
  if (list.includes(key)) {
    if (list.length === 1) return null; // always keep one selected
    return list.filter(k => k !== key);
  }
  return list.concat(key);
}

function syncChip(el, key, list) {
  const active = list.includes(key);
  el.classList.toggle('active', active);
  el.setAttribute('aria-pressed', String(active));
}

/** The key names the slice of selection; dataKey is the chip's data attribute. */
function bindChipGroup(containerId, key, dataKey, onChange) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.addEventListener('click', (e) => {
    const chip = e.target.closest('.series-chip');
    if (!chip) return;
    const value = chip.dataset[dataKey];
    const next = toggleIn(selection[key], value);
    if (!next) return;
    selection[key] = next;
    syncChip(chip, value, next);
    onChange();
  });
}

function bindAllChipGroups() {
  bindChipGroup('seriesChips', 'series', 'series', rebuildTrendChart);
  bindChipGroup('urlChips', 'urls', 'url', () => {
    syncChips('urls', 'url', '#urlChips .series-chip');
    rebuildTrendChart();
  });
  bindChipGroup('modeChips', 'modes', 'mode', () => {
    syncChips('modes', 'mode', '#modeChips .series-chip');
    rebuildTrendChart();
  });
}

/** Re-derive every chip's pressed state after its list was replaced. */
function syncChips(key, dataKey, selector) {
  document.querySelectorAll(selector).forEach(chip => syncChip(chip, chip.dataset[dataKey], selection[key]));
}

bindAllChipGroups();

function rebuildTrendChart() {
  if (!trendsChart) return;
  isUpdatingChart = true;
  try {
    const zoom = preservedZoom || (trendsChart.scales.x ? { min: trendsChart.scales.x.min, max: trendsChart.scales.x.max } : null);
    trendsChart.data.datasets = buildTrendDatasets();
    trendsChart.options.scales = buildScales(selection.series);
    updateDatasetCapNote();
    if (trendsChart.options.plugins?.zoom && fullMin !== Infinity) {
      trendsChart.options.plugins.zoom.limits = {
        x: { min: fullMin, max: fullMax, minRange: (fullMax - fullMin) * 0.01 }
      };
    }
    trendsChart.update('none');
    if (zoom && Number.isFinite(zoom.min) && Number.isFinite(zoom.max)) {
      const lo = Math.max(zoom.min, fullMin);
      const hi = Math.min(zoom.max, fullMax);
      if (hi > lo) trendsChart.zoomScale('x', { min: lo, max: hi });
    }
    if (timelineSlider && preservedZoom) {
      isUpdatingSlider = true;
      try { timelineSlider.set([preservedZoom.min, preservedZoom.max], true, true); } finally { isUpdatingSlider = false; }
      updateVisibleLabels(preservedZoom.min, preservedZoom.max);
    }
  } finally {
    isUpdatingChart = false;
  }
}

/* ---------- direction table ---------- */

const dirMetricEl = document.getElementById('directionMetric');
const dirWindowEl = document.getElementById('directionWindow');
const dirBodyEl = document.getElementById('directionBody');
const dirNoteEl = document.getElementById('directionNote');
const dirCurrentHead = document.getElementById('dirCurrentHead');

const VERDICT_LABEL = { better: 'Better', worse: 'Worse', flat: 'Flat', insufficient: 'No data' };
const VERDICT_RANK = { worse: 0, flat: 1, better: 2, insufficient: 3 };

function compareSeries(points, seriesKey, windowDays) {
  const values = p => (typeof p[seriesKey] === 'number' ? p[seriesKey] : null);
  const mean = arr => {
    const v = arr.filter(x => x != null && Number.isFinite(x));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const now = NEWEST_TS;
  const cur = points.filter(p => p.t > now - windowDays * 86400000);
  const prev = points.filter(p => p.t <= now - windowDays * 86400000 && p.t > now - 2 * windowDays * 86400000);
  const current = mean(cur.map(values));
  const prior = mean(prev.map(values));
  const currentN = cur.reduce((s, p) => s + (p.n || 0), 0);
  const priorN = prev.reduce((s, p) => s + (p.n || 0), 0);
  if (current == null || prior == null) {
    return { current, prior, delta: null, verdict: 'insufficient', currentN, priorN, curDays: cur.length, prevDays: prev.length };
  }
  const spec = seriesByKey[seriesKey];
  const delta = current - prior;
  const verdict = Math.abs(delta) < spec.noiseThreshold
    ? 'flat'
    : spec.lowerIsBetter ? (delta < 0 ? 'better' : 'worse') : (delta > 0 ? 'better' : 'worse');
  return { current, prior, delta, verdict, currentN, priorN, curDays: cur.length, prevDays: prev.length };
}

function renderDirection() {
  if (!dirBodyEl) return;
  const seriesKey = dirMetricEl ? dirMetricEl.value : 'performance';
  const windowDays = dirWindowEl ? Number(dirWindowEl.value) : 30;
  const spec = seriesByKey[seriesKey];

  if (dirCurrentHead) dirCurrentHead.textContent = 'Current (' + spec.short + ')';
  if (dirNoteEl) {
    dirNoteEl.textContent = 'Verdict needs runs in both the last ' + windowDays + ' days and the ' + windowDays + ' days before that. '
      + 'Flat means the change is under the measured day-to-day noise (±' + spec.noiseThreshold + spec.unit + ').';
  }

  const rows = [];
  for (const entry of trendData) {
    for (const mode of allModes) {
      const points = entry.modes[mode] || [];
      if (!points.length) continue;
      const cmp = compareSeries(points, seriesKey, windowDays);
      rows.push({ entry, mode, points, cmp });
    }
  }
  rows.sort((a, b) => {
    const r = VERDICT_RANK[a.cmp.verdict] - VERDICT_RANK[b.cmp.verdict];
    if (r !== 0) return r;
    return (a.cmp.delta ?? Infinity) - (b.cmp.delta ?? Infinity);
  });

  const counts = { better: 0, worse: 0, flat: 0, insufficient: 0 };
  rows.forEach(r => counts[r.cmp.verdict]++);

  dirBodyEl.innerHTML = rows.map(({ entry, mode, points, cmp }) => {
    const title = entry.label + ' · ' + mode + '\n'
      + points.length + ' test day(s)\n'
      + 'last window: ' + cmp.currentN + ' run(s) over ' + cmp.curDays + ' day(s)\n'
      + 'prior window: ' + cmp.priorN + ' run(s) over ' + cmp.prevDays + ' day(s)';
    return '<tr class="verdict-' + cmp.verdict + '" title="' + escapeAttr(title) + '">'
      + '<td class="url-cell"><a href="' + safeHref(entry.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHTML(entry.label) + '</a></td>'
      + '<td class="mode-cell"><span class="badge ' + mode.toLowerCase() + '">' + escapeHTML(mode) + '</span></td>'
      + '<td class="num">' + escapeHTML(formatValue(spec, cmp.current)) + '</td>'
      + '<td class="num delta">' + escapeHTML(formatSigned(spec, cmp.delta)) + '</td>'
      + '<td class="verdict-cell"><span class="verdict-pill verdict-' + cmp.verdict + '">' + VERDICT_LABEL[cmp.verdict] + '</span></td>'
      + '<td class="spark-cell">' + sparkSvg(points, seriesKey, cmp.verdict) + '</td>'
      + '</tr>';
  }).join('');

  if (dirNoteEl) {
    dirNoteEl.textContent += '  —  ' + counts.worse + ' worse, ' + counts.better + ' better, '
      + counts.flat + ' flat, ' + counts.insufficient + ' without enough data.';
  }
}

if (dirMetricEl) dirMetricEl.addEventListener('change', renderDirection);
if (dirWindowEl) dirWindowEl.addEventListener('change', renderDirection);
renderDirection();

new Chart(document.getElementById('scatterChart'), {
  type: 'scatter',
  data: {
    datasets: allModes.map(mode => ({
      label: mode.replace('-', ' ').toUpperCase() + ' Dataset',
      data: allRunsData.filter(r => r.mode === mode).map(r => ({ x: r.urlIndex, y: r.score, fileName: r.fileName, summary: r.summary })),
      backgroundColor: getModeColor(mode),
      pointRadius: 6,
      hoverRadius: 10
    }))
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        min: -0.5,
        max: urlLabels.length - 0.5,
        ticks: {
          maxRotation: 35,
          minRotation: 35,
          labelOffset: 40,
          callback: (v) => shortenLabel(urlLabels[v] || ''),
          stepSize: 1,
          precision: 0
        },
        grid: { color: 'hsla(220, 15%, 50%, 0.1)' }
      },
      y: { beginAtZero: true, max: 100, min: 0, grid: { color: 'hsla(220, 15%, 50%, 0.1)' } }
    },
    plugins: {
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const d = ctx.raw;
            return 'Score: ' + d.y + ' ' + urlLabels[d.x] + ' (Click for details) ';
          }
        }
      }
    },
    onClick: (e, el) => {
      if (el.length) {
        const data = e.chart.data.datasets[el[0].datasetIndex].data[el[0].index];
        if (data.summary) {
          showRunModal(data.summary);
        }
      }
    }
  }
});

const showRunModal = (summary) => {
  const modal = document.getElementById('runModal');
  const title = document.getElementById('modalTitle');
  const url = document.getElementById('modalUrl');
  const categories = document.getElementById('modalCategories');
  const metrics = document.getElementById('modalMetrics');
  const timestamp = document.getElementById('modalTimestamp');
  const mode = document.getElementById('modalMode');
  
  title.textContent = summary.urlLabel || summary.id;
  url.innerHTML = '';
  const anchor = document.createElement('a');

  anchor.href = safeHref(summary.url || '');
  anchor.textContent = summary.url || summary.id;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  url.appendChild(anchor);

  categories.innerHTML = SERIES.filter(s => s.group === 'categories' && summary.categories?.[s.key] != null).map(s => {
    const val = summary.categories[s.key];
    const score = Math.round(val);
    return '<div class="metric-card"><div class="metric-label">' + escapeHTML(s.label) + '</div><div class="metric-value ' + gradeOf(s, val) + '">' + score + '</div></div>';
  }).join('');

  metrics.innerHTML = SERIES.filter(s => s.group === 'metrics' && summary.metrics?.[s.key] != null).map(s => {
    const val = summary.metrics[s.key];
    return '<div class="metric-card"><div class="metric-label">' + escapeHTML(s.short) + '</div><div class="metric-value ' + gradeOf(s, val) + '">' + escapeHTML(formatValue(s, val)) + '</div></div>';
  }).join('');

  timestamp.textContent = summary.day
    ? summary.day + ' (UTC) · ' + summary.sampleCount + ' run' + (summary.sampleCount === 1 ? '' : 's') + ' averaged'
    : utcDateTime(summary.timestamp) + ' UTC';
  mode.textContent = summary.mode;

  modal.style.display = 'block';
};

function gradeOf(spec, value) {
  if (!spec.thresholds || value == null) return 'none';
  if (spec.lowerIsBetter) {
    if (value < spec.thresholds[0]) return 'good';
    if (value < spec.thresholds[1]) return 'avg';
    return 'poor';
  }
  if (value > spec.thresholds[1]) return 'good';
  if (value > spec.thresholds[0]) return 'avg';
  return 'poor';
}

const closeModalBtn = document.querySelector('.close-modal');
if (closeModalBtn) {
  closeModalBtn.addEventListener('click', () => {
    const modal = document.getElementById('runModal');
    if (modal) modal.style.display = 'none';
  });
}

window.addEventListener('click', (e) => {
  const modal = document.getElementById('runModal');
  if (e.target === modal) {
    modal.style.display = 'none';
  }
});`;