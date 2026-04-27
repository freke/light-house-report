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
  const isLight = body.classList.contains('light-mode');
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

new Chart(document.getElementById('trendsChart'), {
  type: 'line',
  data: {
    datasets: trendData.flatMap((d, i) => allModes.map(mode => {
      const modeShort = { 'desktop': 'D', 'mobile-4g': 'M-4G', 'mobile-wifi': 'M-WiFi' }[mode] || mode.charAt(0).toUpperCase();
      return {
        label: d.label + ' (' + modeShort + ')',
      data: d.modes[mode],
      borderColor: getModeColor(mode),
      borderDash: mode !== 'mobile-4g' ? [5, 5] : [],
      backgroundColor: 'transparent',
      tension: 0.4,
      pointRadius: 5,
      hitRadius: 10,
      hidden: i > 0
      };
    }))
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: 'linear',
        title: { display: true, text: 'Audit Timeline', color: 'hsl(220, 10%, 95%)', font: { weight: '700' } },
        grid: { color: 'hsla(220, 15%, 50%, 0.1)' },
        ticks: { color: 'hsl(220, 10%, 70%)',
          callback: function(value) {
            const d = new Date(value);
            const pad = (n) => n.toString().padStart(2, '0');
            const date = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
            const time = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
            return date + ' ' + time;
          }
        }
      },
      y: { max: 100, min: 0, title: { display: true, text: 'Score', color: 'hsl(220, 10%, 95%)', font: { weight: '700' } }, grid: { color: 'hsla(220, 15%, 50%, 0.1)' }, ticks: { color: 'hsl(220, 10%, 70%)' } }
    },
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
              if (timelineSlider) {
                timelineSlider.set([min, max], true, true);
              }
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
              if (timelineSlider) {
                timelineSlider.set([min, max], true, true);
              }
              updateVisibleLabels(min, max);
            } finally {
              isUpdatingSlider = false;
            }
          }
        },
      },
      legend: { position: 'bottom', labels: { boxWidth: 10, padding: 15 } },
      tooltip: {
        callbacks: {
          title: function(context) {
            const timestamp = context[0].raw.x;
            const d = new Date(timestamp);
            const pad = (n) => n.toString().padStart(2, '0');
            const date = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
            const time = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
            return date + ' ' + time;
          },
          afterTitle: function(context) {
            const iterCount = context[0].raw.iterationCount;
            if (iterCount && iterCount > 1) {
              return 'Run average (' + iterCount + ' iterations)';
            }
            return '';
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

const trendsChart = Chart.getChart('trendsChart');

const formatDate = (ts) => {
  const d = new Date(ts);
  const pad = (n) => n.toString().padStart(2, '0');
  const date = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const time = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  return date + ' ' + time;
};

function updateVisibleLabels(minVal, maxVal) {
  const startEl = document.getElementById('timelineStart');
  const endEl = document.getElementById('timelineEnd');
  if (startEl) startEl.textContent = formatDate(minVal);
  if (endEl) endEl.textContent = formatDate(maxVal);
}

const sliderEl = document.getElementById('timelineSlider');

if (sliderEl && trendsChart) {
  const { fullMin, fullMax } = trendData.reduce((acc, d) => {
    Object.values(d.modes).flat().forEach(p => {
      if (p.x < acc.fullMin) acc.fullMin = p.x;
      if (p.x > acc.fullMax) acc.fullMax = p.x;
    });
    return acc;
  }, { fullMin: Infinity, fullMax: -Infinity });

  if (fullMin !== Infinity) {
    const initialMin = trendsChart.scales.x.min;
    const initialMax = trendsChart.scales.x.max;

    timelineSlider = noUiSlider.create(sliderEl, {
      range: { min: fullMin, max: fullMax },
      start: [initialMin, initialMax],
      connect: true,
      behaviour: 'tap-drag',
      tooltips: [
        { to: (v) => formatDate(v) },
        { to: (v) => formatDate(v) }
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
        updateVisibleLabels(min, max);
      } finally {
        isUpdatingChart = false;
      }
    });


    updateVisibleLabels(initialMin, initialMax);
  }
}

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
  
  const getSafeHref = (u) => {
    try {
      const parsed = new URL(u);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return u;
    } catch {}
    return 'about:blank';
  };

  anchor.href = getSafeHref(summary.url || '');
  anchor.textContent = summary.url || summary.id;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  url.appendChild(anchor);
  
  categories.innerHTML = Object.entries(summary.categories).filter(([key]) => catLabels[key]).map(([key, val]) => {
    const score = Math.round(val);
    const grade = score >= 90 ? 'good' : score >= 50 ? 'avg' : 'poor';
    return '<div class="metric-card"><div class="metric-label">' + catLabels[key] + '</div><div class="metric-value ' + grade + '">' + score + '</div></div>';
  }).join('');
  
  const metricLabels = { lcp: 'LCP', cls: 'CLS', fcp: 'FCP', si: 'SI', tbt: 'TBT', tti: 'TTI' };
  metrics.innerHTML = Object.entries(summary.metrics).filter(([k]) => metricLabels[k]).map(([key, val]) => {
    if (val == null) return '';
    const numVal = Number(val);
    let displayVal, grade;
    if (key === 'cls') {
      displayVal = numVal.toFixed(4);
      grade = numVal < 0.1 ? 'good' : numVal < 0.25 ? 'avg' : 'poor';
    } else if (key === 'lcp' || key === 'fcp' || key === 'si' || key === 'tti') {
      displayVal = (numVal / 1000).toFixed(2) + 's';
      const thresholds = key === 'lcp' ? [2500, 4000] : key === 'fcp' ? [1800, 3000] : key === 'si' ? [3400, 5800] : [3800, 7300];
      grade = numVal < thresholds[0] ? 'good' : numVal < thresholds[1] ? 'avg' : 'poor';
    } else {
      displayVal = numVal.toFixed(0) + 'ms';
      grade = numVal < 200 ? 'good' : numVal < 600 ? 'avg' : 'poor';
    }
    return '<div class="metric-card"><div class="metric-label">' + metricLabels[key] + '</div><div class="metric-value ' + grade + '">' + displayVal + '</div></div>';
  }).join('');
  
  timestamp.textContent = new Date(summary.timestamp).toLocaleString();
  mode.textContent = summary.mode;
  
  modal.style.display = 'block';
};

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