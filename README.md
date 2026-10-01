# Lighthouse Runner

Automated Lighthouse performance auditing with visual dashboard, Excel reports, and zip archives.

## Quick Start

Download and run a release:

1. Download latest release from [GitHub Releases](https://github.com/freke/light-house-report/releases)
2. Extract the archive
3. Ensure Node.js >= 24 is installed
4. Create `config.json` with your configuration (see Configuration below)
5. Run: `node lighthouse-runner.mjs`

---

## Prerequisites

- **Node.js** >= 24.0.0
- **Google Chrome** (installed locally or specify path via `CHROME_PATH`)
- **just** (optional, for development tasks)

---

## Installation

### Download Release
```bash
# Visit: https://github.com/freke/light-house-report/releases
# Download and extract the latest release

npm install
```

### Clone for Development
```bash
git clone git@github.com:freke/light-house-report.git
cd light-house-report
npm install
```

---

## Configuration

### Getting Started

Copy the example config to get started:
```bash
cp config.json.example config.json
```

Edit `config.json` to add your URLs and settings.

### Basic Options

These options are included in `config.json.example`:

| Option | Description | Default |
|--------|-------------|---------|
| `urls` | Array of URLs to test (required) | - |
| `iterations` | Number of test iterations per URL/emulation | 3 |
| `delay` | Delay between tests (seconds) | 3 |
| `baseDir` | Base report directory | `./reports` |
| `tester` | Tester name (CLI `--tester` overrides) | `""` |
| `region` | Testing region (CLI `--region` overrides) | `""` |

### Advanced Options

These options can be added to `config.json` for advanced control:

| Option | Description | Default |
|--------|-------------|---------|
| `chromePath` | Custom Chrome/Chromium executable path | System default |
| `reportSubDir` | Report subdirectory | `"runs"` |
| `emulations` | Emulation modes to run | All 3 modes |
| `skipExcel` | Skip Excel export by default | `false` |
| `skipZip` | Skip ZIP export by default | `false` |

### Example `config.json` (Advanced)
```json
{
  "urls": ["https://example.com"],
  "iterations": 3,
  "delay": 3,
  "baseDir": "./reports",
  "tester": "Your Name",
  "region": "us-east",
  "chromePath": "/usr/bin/chromium",
  "reportSubDir": "runs",
  "emulations": ["mobile-4g", "desktop"],
  "skipExcel": false,
  "skipZip": false
}
```

### Environment Variables (Optional)

| Variable | Description | Default |
|----------|-------------|---------|
| `LHR_ITERATIONS` | Number of test iterations | 3 |
| `LHR_DELAY` | Delay between runs (seconds) | 3 |
| `LHR_BASE_DIR` | Reports output directory | ./reports |
| `LHR_EMULATIONS` | Comma-separated emulation modes | mobile-4g,mobile-wifi,desktop |
| `CHROME_PATH` | Path to Chrome executable | System default |

**Note:** CLI arguments override both config file and environment variables.

---

## Usage

### Basic Run
```bash
node lighthouse-runner.mjs
```

### With Options
```bash
# Run 5 iterations
node lighthouse-runner.mjs --run 5

# Add metadata for reporting
node lighthouse-runner.mjs --date 2026-04-28 --tester "Name" --region "us-east"

# Skip Excel export
node lighthouse-runner.mjs --no-excel

# Skip zip archive
node lighthouse-runner.mjs --no-zip

# Specify output paths
node lighthouse-runner.mjs --excel-output /path/to/report.xlsx --zip-output /path/to/archive.zip

# Slim stored reports in place (see "Saved Report Contents")
node lighthouse-runner.mjs --slim-existing
```

---

## CLI Reference

| Flag | Description | Default |
|------|-------------|---------|
| `--run <n>` | Number of Lighthouse iterations | 3 |
| `--date <date>` | Test date for reports | Current date |
| `--tester <name>` | Tester name (overrides config) | - |
| `--region <region>` | Region identifier (overrides config) | - |
| `--excel-output <path>` | Excel report path | ./reports/visual-summary.xlsx |
| `--zip-output <path>` | Zip archive path | Auto-generated |
| `--no-excel` | Skip Excel export | false |
| `--no-zip` | Skip zip creation | false |
| `--slim-existing` | Slim stored reports in place and rebuild legacy summaries, then exit | false |

---

## Metrics & Calculations

### Captured Metrics

The following performance metrics are captured from each Lighthouse audit:

| Metric | Description | Unit | Lighthouse Audit |
|--------|-------------|------|------------------|
| **FCP** | First Contentful Paint - Time until first text or image is painted | seconds | `first-contentful-paint` |
| **LCP** | Largest Contentful Paint - Time until largest content element is rendered | seconds | `largest-contentful-paint` |
| **TBT** | Total Blocking Time - Sum of time where main thread was blocked | milliseconds | `total-blocking-time` |
| **CLS** | Cumulative Layout Shift - Visual stability score | unitless (0-1) | `cumulative-layout-shift` |
| **SI** | Speed Index - How quickly content is visually displayed | seconds | `speed-index` |
| **TTI** | Time to Interactive - Time until page is fully interactive | seconds | `interactive` |

### Category Scores

Lighthouse category scores are also captured (0-100 scale):

| Category | Description |
|----------|-------------|
| **Performance** | Overall performance score |
| **Accessibility** | Accessibility best practices |
| **Best Practices** | Modern web development best practices |
| **SEO** | Search engine optimization |

### Unified Calculation Method

All reports (Excel and HTML dashboard) use the **same time-weighted averaging** with exponential decay:

1. **Data Source**: Summary JSON files in the configured `reportSubDir` directory (e.g., `reportSubDir/*.summary.json`). Refer to `src/config.ts` for the `reportSubDir` setting.
2. **Grouping**: Iterations are grouped by `runId` (or temporal proximity for legacy files)
3. **Time-Weighted Averaging**: Newer runs have more influence than older runs
   - **Half-life**: 7 days
   - **Formula**: `weight = e^(-λ × age_in_days)` where λ = ln(2) / 7
   - **Result**: `weighted_avg = Σ(value × weight) / Σ(weight)`
4. **Metric Conversion**:
    ```text
    FCP (s) = timeWeightedAvg(fcp values) / 1000
   LCP (s) = timeWeightedAvg(lcp values) / 1000
   TBT (ms) = round(timeWeightedAvg(tbt values))
   CLS = timeWeightedAvg(cls values)
   SI (s) = timeWeightedAvg(si values) / 1000
   TTI (s) = timeWeightedAvg(tti values) / 1000
   ```
5. **Test Date**: Set via `--date` flag, or defaults to the most recent run date in the data

### Day Aggregation

Every condensed data point represents **one UTC test day**, averaged across all runs recorded
that day. The tool is often invoked several times a day; treating those as separate observations
overstates how much data exists and would let a busy day dominate the average.

- `modes` (the condensed series) is per day. This is what drives the dashboard tables, the
  radar charts, the trend chart and the Excel.
- `modesRaw` and the raw run registry stay **per run**, so the Performance Envelope box plot
  still shows how repeatable a single measurement is, and the Discrete Run Mapping scatter still
  plots individual runs.
- Day buckets are **UTC** throughout: day bucketing, the Excel test date, the zip file name and
  the dashboard's own date labels. Roughly an eighth of the stored runs happen between 01:00 and
  08:00 local time, so mixing local and UTC would place the same run on two different days.

### Direction of Travel

The dashboard's primary answer to "are the pages getting better or worse". For each URL and mode
it compares the most recent window against the window before it and only calls a change when it
exceeds the measured day-to-day noise for that metric:

```text
noiseThreshold = 90th percentile of |day-over-day change| in the stored data
verdict: delta > +threshold → better, delta < -threshold → worse, otherwise flat
```

Those thresholds live in `src/dashboard/series.ts` next to each metric's unit and formatting, so
the rule is auditable in one place. Series whose measured noise is zero — the category scores
barely move — are floored at 1 point. Rows where either window has no runs are reported as
`insufficient` rather than showing a partial comparison, and rows are sorted worst first.

Window means are plain means rather than the 7-day decay: a decay would let the newest test day
dominate a 30-day window, and the two windows have to be comparable for their difference to mean
anything. The decay-weighted figure is still reported separately as the *current* score.

### Emulation Modes

| Mode | Description | Throttling |
|------|-------------|------------|
| `mobile-4g` | Mobile device simulation | CPU + network throttling (simulated 4G) |
| `mobile-wifi` | Mobile device simulation | CPU throttling only (unthrottled network) |
| `desktop` | Desktop simulation | No throttling (provided conditions) |

---

## Saved Report Contents

Each audit writes two files into `reportSubDir`:

| File | Purpose | Size |
|------|---------|------|
| `<hash>-<mode>-<timestamp>-iter<N>.json` | Full Lighthouse report | ~100 KB |
| `<hash>-<mode>-<timestamp>-iter<N>.summary.json` | The ten metrics and four category scores | ~800 B |

**The dashboard, Excel and ZIP are built entirely from the `.summary.json` files.** The full
Lighthouse JSON is kept so that new metrics can be added or existing ones recomputed later
without re-running an audit, and it retains every scalar value that makes that possible:

- **Kept**: every audit's `score`, `numericValue`, `numericUnit`, `scoreDisplayMode`,
  `displayValue`, `metricSavings`, `scoringOptions` and `title`, plus the `timing` entries
  (per-step tool timings), `categories`, `categoryGroups`, `stackPacks`, `configSettings`,
  `entities`, `environment`, `runWarnings` and `lighthouseVersion`.
- **Dropped**: images (`screenshot-thumbnails` filmstrip and `fullPageScreenshot`), prose
  (the `i18n` message catalog and each audit's `description`, `explanation` and `warnings`),
  the redundant per-audit `id`, and all `details` row tables.

Dropping `details` is what makes the file small. Every metric Lighthouse reports is an audit
scalar, so all ten metrics remain recalculable; what is lost is the ability to recompute a
metric from raw request or DOM rows.

The ten stored metrics are `fcp`, `lcp`, `tbt`, `cls`, `si`, `tti`, `serverResponse`,
`jsExecTime`, `domSize` and `totalByteWeight`. `serverResponse`, `jsExecTime`, `domSize` and
`totalByteWeight` have no published thresholds, so the dashboard shows them ungraded.

`src/dashboard/series.ts` is the single registry of what can be charted, compared and trended.
Adding a metric means adding one entry there: unit, formatting, grading thresholds and its
measured noise floor. Day bucketing, the Excel test date, the zip name and the dashboard's date
labels all resolve through `src/dates.ts`, so a run can never appear under two different days.

The same rules are applied to Lighthouse HTML reports in `html-backup/`, by rewriting the LHR
embedded in `window.__LIGHTHOSE_JSON__`. The report stays valid and viewable.

Summaries are retained indefinitely; no run is ever deleted. To convert reports written by an
older version, run `just slim` (or `--slim-existing`), which slims stored reports and rebuilds
`.summary.json` files for legacy HTML reports that never had one.

---

## Development

### Using `just`
```bash
just              # List tasks
just build        # Build project
just watch        # Watch mode
just dev          # Build and run
just excel        # Generate Excel only
just zip          # Generate zip only
just slim         # Slim stored reports in place
just release      # Release with metadata
just check        # TypeScript check
just clean        # Clean build artifacts
just distclean    # Remove node_modules
```

### Using npm
```bash
npm run build           # Build project
npm run build:watch     # Watch mode  
npm run typecheck       # Type check
npm start              # Run
npm run build:minify   # Minified build
```

---

## Build Configuration

- **Target**: Node.js 24
- **Bundler**: esbuild
- **Module System**: ESM
- **TypeScript**: 5.3+ with NodeNext resolution

---

## Dependencies

**Runtime**:
- `lighthouse` (^13.1.0) - Google Lighthouse
- `chrome-launcher` (^1.2.1) - Launch Chrome for testing
- `exceljs` (^4.4.0) - Excel report generation
- `archiver` (^7.0.1) - Zip archive creation
