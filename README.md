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
| `quality` | Compression quality (1-100) | 30 |
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
  "quality": 30,
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

# Compress existing reports
node lighthouse-runner.mjs --compress --quality 80
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
| `--compress` | Compress existing reports | false |
| `--quality <1-100>` | Compression quality | 30 |

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

### Emulation Modes

| Mode | Description | Throttling |
|------|-------------|------------|
| `mobile-4g` | Mobile device simulation | CPU + network throttling (simulated 4G) |
| `mobile-wifi` | Mobile device simulation | CPU throttling only (unthrottled network) |
| `desktop` | Desktop simulation | No throttling (provided conditions) |

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
