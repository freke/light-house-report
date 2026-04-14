# Lighthouse Runner

> Lightweight wrapper to run Google Lighthouse audits, collect HTML reports, and generate both a visual dashboard and an Excel summary.

## Quick overview
- Entry file: `lighthouse-runner.js`
- Environment: optional `devenv` (see `devenv.nix` / `devenv.yaml`)
- Reports: `./reports/runs/`, aggregated data: `./reports/persistent_stats.json`, visual summary: `./reports/visual-summary.html`, Excel summary: `./reports/visual-summary.xlsx`, zip archive: `./reports/reports-<date>-<region>-<tester>.zip`

## Prerequisites
- Node.js (v16+ recommended) and `npm` (if running without `devenv`)
- Chromium available on PATH as `chromium` (or change `chromePath` in `lighthouse-runner.js`)
- (Optional) Nix + `devenv` CLI for reproducible environment

## Using `devenv` (recommended)
1. Install Nix and the `devenv` CLI per https://devenv.sh/getting-started/
2. From the project root run:

```bash
devenv shell
```

This yields a shell with the packages declared in `devenv.nix` (includes `google-lighthouse` and `chromium`) available.

Inside the `devenv` shell run the normal Node steps below.

## Run locally (Node)
1. Install dependencies:

```bash
npm install
```

2. Create `urls.json` in the project root (required). Example:

```json
[
  "https://example.com",
  "https://example.org"
]
```

3. Run the runner (default 3 iterations):

```bash
node lighthouse-runner.js
# or specify iterations:
node lighthouse-runner.js --run 2
# or regenerate summaries from existing reports only:
node lighthouse-runner.js --run 0
```

Notes:
- If `lighthouse-runner.js` exits with `Could not load urls.json`, create the file as shown above.
- Reports are saved to `./reports/runs/`, the dashboard is written to `./reports/visual-summary.html`, the Excel summary is written to `./reports/visual-summary.xlsx`, and a zip archive is created in `./reports/`.

## Excel export
The runner now replaces the old Python parser flow by exporting the averaged dashboard table directly to Excel.

Supported flags:

```bash
node lighthouse-runner.js --run 0 --date 2026-04-09 --tester David --region JA
node lighthouse-runner.js --excel-output reports/custom-summary.xlsx
node lighthouse-runner.js --zip-output reports/custom-bundle.zip
node lighthouse-runner.js --no-excel
node lighthouse-runner.js --no-zip
```

Available options:
- `--run <n>`: number of Lighthouse iterations. Use `0` for extract-only mode.
- `--date <YYYY-MM-DD>`: adds a test date column to the Excel file.
- `--tester <name>`: adds a tester name column to the Excel file.
- `--region <code>`: adds a region value to the Excel file.
- `--excel-output <path>`: writes the Excel file to a custom path.
- `--zip-output <path>`: writes the zip archive to a custom path.
- `--no-excel`: skip Excel generation.
- `--no-zip`: skip zip generation.

Default zip naming:
- `reports-<date>-<region>-<tester>.zip`
- Missing values fall back to the current date, `unknown-region`, and `unknown-tester`.

The zip archive contains:
- `reports/visual-summary.html`
- `reports/persistent_stats.json`
- `reports/visual-summary.xlsx` (or your custom Excel output if it exists)
- `reports/runs/` with all Lighthouse HTML run reports

## Running without `chromium` on PATH
If your system's Chrome/Chromium binary is named differently (e.g. `google-chrome`), edit the `chromeLauncher.launch` `chromePath` option inside `lighthouse-runner.js`.

## Troubleshooting
- Chrome launch errors: ensure `chromium` is installed and executable. Inside a `devenv shell` run `which chromium` to verify.
- Permission or sandbox errors on Linux: try the `--no-sandbox` flag is already set in the script but ensure your environment allows running headless Chromium.
