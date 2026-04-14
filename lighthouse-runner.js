const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ExcelJS = require("exceljs");
const lighthouse = require('lighthouse').default || require('lighthouse');
const chromeLauncher = require("chrome-launcher");

let loadedUrls = [];
try {
    loadedUrls = require('./urls.json');
} catch(e) {
    console.error("❌ Fatal: Could not load urls.json. Please create it with an array of URLs.");
    process.exit(1);
}

const config = {
    urls: loadedUrls,
    iterations: 3,
    delay: 3,
    baseDir: "./reports",
    reportSubDir: "runs",
    dataFile: "persistent_stats.json",
    emulations: ['mobile', 'desktop']
};

const runsDir = path.join(config.baseDir, config.reportSubDir);
if (!fs.existsSync(runsDir)) fs.mkdirSync(runsDir, { recursive: true });

const dataPath = path.join(config.baseDir, config.dataFile);
let statsData = { runs: [], urls: {} };

function parseArgs(argv) {
    const parsed = {
        runIterations: undefined,
        testDate: '',
        tester: '',
        region: '',
        excelOutput: undefined,
        skipExcel: false
    };

    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        const next = argv[index + 1];

        if (arg === '--run' && next !== undefined) {
            const value = parseInt(next, 10);
            if (!isNaN(value)) parsed.runIterations = value;
            index += 1;
            continue;
        }

        if (arg === '--date' && next !== undefined) {
            parsed.testDate = next;
            index += 1;
            continue;
        }

        if (arg === '--tester' && next !== undefined) {
            parsed.tester = next;
            index += 1;
            continue;
        }

        if (arg === '--region' && next !== undefined) {
            parsed.region = next;
            index += 1;
            continue;
        }

        if (arg === '--excel-output' && next !== undefined) {
            parsed.excelOutput = next;
            index += 1;
            continue;
        }

        if (arg === '--no-excel') {
            parsed.skipExcel = true;
        }
    }

    return parsed;
}

const args = parseArgs(process.argv.slice(2));

function calculateAverage(arr, prefix, key) {
    if (!arr || !arr.length) return 0;

    const values = arr.map(entry => {
        const value = prefix ? entry[prefix]?.[key] : entry[key];
        return (value != null && !isNaN(value)) ? value : null;
    }).filter(value => value !== null);

    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function buildExcelRows() {
    return Object.keys(statsData.urls).flatMap(url => {
        const urlStats = statsData.urls[url];

        return [
            { mode: 'mobile', label: 'Mobile' },
            { mode: 'desktop', label: 'Desktop' }
        ].flatMap(({ mode, label }) => {
            const entries = urlStats[mode] || [];
            if (!entries.length) return [];

            return [{
                url,
                type: label,
                testDate: args.testDate || '',
                tester: args.tester || '',
                region: args.region || '',
                fcp: calculateAverage(entries, 'metrics', 'fcp') / 1000,
                lcp: calculateAverage(entries, 'metrics', 'lcp') / 1000,
                tbt: Math.round(calculateAverage(entries, 'metrics', 'tbt')),
                cls: calculateAverage(entries, 'metrics', 'cls'),
                si: calculateAverage(entries, 'metrics', 'si') / 1000,
                tti: calculateAverage(entries, 'metrics', 'tti') / 1000
            }];
        });
    });
}

function getExcelOutputPath() {
    if (args.excelOutput) {
        return path.resolve(args.excelOutput);
    }

    return path.join(config.baseDir, 'visual-summary.xlsx');
}

async function writeExcelReport() {
    if (args.skipExcel) {
        console.log('⏭️ Skipping Excel export (--no-excel).');
        return;
    }

    const rows = buildExcelRows();
    if (!rows.length) {
        console.warn('⚠️ No aggregated rows available for Excel export.');
        return;
    }

    const outputPath = getExcelOutputPath();
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Parsed Results', {
        views: [{ state: 'frozen', ySplit: 1 }]
    });

    const headers = [
        'URL',
        'Type',
        'Test Date',
        'Tester',
        'Region',
        'FCP (s)',
        'LCP (s)',
        'TBT (ms)',
        'CLS',
        'SI (s)',
        'TTI (s)'
    ];

    const tableRows = rows.map(row => [
        row.url,
        row.type,
        row.testDate,
        row.tester,
        row.region,
        row.fcp,
        row.lcp,
        row.tbt,
        row.cls,
        row.si,
        row.tti
    ]);

    worksheet.addTable({
        name: 'ParsedResults',
        ref: 'A1',
        headerRow: true,
        style: {
            theme: 'TableStyleMedium2',
            showRowStripes: true,
            showColumnStripes: false
        },
        columns: headers.map(name => ({ name })),
        rows: tableRows
    });

    const widths = [70, 12, 14, 18, 12, 10, 10, 11, 8, 10, 10];
    widths.forEach((width, index) => {
        worksheet.getColumn(index + 1).width = width;
    });

    worksheet.getRow(1).eachCell(cell => {
        cell.alignment = { horizontal: 'center' };
        cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '1F4E78' }
        };
    });

    for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex++) {
        worksheet.getCell(`F${rowIndex}`).numFmt = '0.00';
        worksheet.getCell(`G${rowIndex}`).numFmt = '0.00';
        worksheet.getCell(`H${rowIndex}`).numFmt = '0';
        worksheet.getCell(`I${rowIndex}`).numFmt = '0.000';
        worksheet.getCell(`J${rowIndex}`).numFmt = '0.00';
        worksheet.getCell(`K${rowIndex}`).numFmt = '0.00';
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    await workbook.xlsx.writeFile(outputPath);
    console.log(`📗 Excel summary updated: ${outputPath}`);
}

function extractDataFromReports() {
    console.log("📂 Extracting data from HTML reports...");
    const extracted = { runs: [], urls: {} };

    if (!fs.existsSync(runsDir)) {
        console.log("   No runs directory found, starting fresh.");
        return extracted;
    }

    const files = fs.readdirSync(runsDir).filter(f => f.endsWith('.html'));
    console.log(`   Found ${files.length} HTML report files.`);

    for (const file of files) {
        try {
            const content = fs.readFileSync(path.join(runsDir, file), 'utf8');
            const jsonMatch = content.match(/window\.__LIGHTHOUSE_JSON__\s*=\s*({[\s\S]*?});/);

            if (!jsonMatch) {
                console.warn(`   ⚠️ No Lighthouse JSON found in ${file}`);
                continue;
            }

            const lhr = JSON.parse(jsonMatch[1]);

            const url = lhr.requestedUrl || lhr.finalUrl || '';
            const urlHash = getUrlHash(url);
            const mode = file.includes('-desktop-') ? 'desktop' : 'mobile';

            const categories = {
                performance: (lhr.categories.performance?.score || 0) * 100,
                accessibility: (lhr.categories.accessibility?.score || 0) * 100,
                'best-practices': (lhr.categories['best-practices']?.score || 0) * 100,
                seo: (lhr.categories.seo?.score || 0) * 100
            };

            const metrics = {
                fcp: lhr.audits['first-contentful-paint']?.numericValue || null,
                lcp: lhr.audits['largest-contentful-paint']?.numericValue || null,
                tbt: lhr.audits['total-blocking-time']?.numericValue || null,
                cls: lhr.audits['cumulative-layout-shift']?.numericValue || null,
                si: lhr.audits['speed-index']?.numericValue || null,
                tti: lhr.audits['interactive']?.numericValue || null,
                fid: lhr.audits['max-potential-fid']?.numericValue || null,
                inp: lhr.audits['interaction-to-next-paint']?.numericValue || null,
                serverResponse: lhr.audits['server-response-time']?.numericValue || null,
                domSize: lhr.audits['dom-size']?.numericValue || null,
                mainThreadWork: lhr.audits['mainthread-work-breakdown']?.numericValue || null,
                jsExecTime: lhr.audits['runtime-external-javascript']?.numericValue || null,
                totalByteWeight: lhr.audits['network-summary']?.numericValue || null
            };

            const runData = {
                id: file.replace('.html', ''),
                url,
                urlLabel: getUrlLabel(url),
                mode,
                iteration: 1,
                timestamp: lhr.fetchTime ? new Date(lhr.fetchTime).getTime() : Date.now(),
                fileName: file,
                categories,
                metrics
            };

            extracted.runs.push(runData);

            if (!extracted.urls[url]) {
                extracted.urls[url] = { label: getUrlLabel(url), mobile: [], desktop: [] };
            }
            extracted.urls[url][mode].push({
                iteration: 1,
                timestamp: runData.timestamp,
                fileName: file,
                categories,
                metrics
            });

        } catch (err) {
            console.warn(`   ⚠️ Failed to parse ${file}: ${err.message}`);
        }
    }

    console.log(`   ✓ Extracted ${extracted.runs.length} runs from HTML reports.`);
    return extracted;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function getUrlHash(url) {
    return crypto.createHash('md5').update(url).digest('hex').slice(0, 8);
}

function getUrlLabel(url) {
    try {
        const u = new URL(url);
        return u.pathname + u.search;
    } catch {
        return url;
    }
}

async function runLighthouse(url, iteration, mode) {
    const chrome = await chromeLauncher.launch({
        chromePath: 'chromium',
        chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu']
    });

    const options = {
        logLevel: 'info',
        output: 'html',
        port: chrome.port,
        formFactor: mode,
        screenEmulation: mode === 'desktop' ? { disabled: true } : undefined,
        throttlingMethod: 'simulate'
    };

    const urlHash = getUrlHash(url);
    console.log(`\n🚀 [${mode.toUpperCase()}] Audit: ${url} (ID: ${urlHash})`);

    try {
        const runnerResult = await lighthouse(url, options);
        const lhr = runnerResult.lhr;

        const categories = {
            performance: (lhr.categories.performance?.score || 0) * 100,
            accessibility: (lhr.categories.accessibility?.score || 0) * 100,
            'best-practices': (lhr.categories['best-practices']?.score || 0) * 100,
            seo: (lhr.categories.seo?.score || 0) * 100
        };

        const keyMetrics = {
            fcp: lhr.audits['first-contentful-paint']?.numericValue || null,
            lcp: lhr.audits['largest-contentful-paint']?.numericValue || null,
            tbt: lhr.audits['total-blocking-time']?.numericValue || null,
            cls: lhr.audits['cumulative-layout-shift']?.numericValue || null,
            si: lhr.audits['speed-index']?.numericValue || null,
            tti: lhr.audits['interactive']?.numericValue || null,
            fid: lhr.audits['max-potential-fid']?.numericValue || null,
            inp: lhr.audits['interaction-to-next-paint']?.numericValue || null,
            fcp1: lhr.audits['first-contentful-paint-1']?.numericValue || null,
            lcp1: lhr.audits['largest-contentful-paint-1']?.numericValue || null,
            lcpLate: lhr.audits['lcp-largest-contentful-paint']?.numericValue || null,
            fcpL: lhr.audits['first-contentful-paint-1']?.numericValue || null,
            serverResponse: lhr.audits['server-response-time']?.numericValue || null,
            domSize: lhr.audits['dom-size']?.numericValue || null,
            mainThreadWork: lhr.audits['mainthread-work-breakdown']?.numericValue || null,
            jsExecTime: lhr.audits['runtime-external-javascript']?.numericValue || null,
            networkRequests: lhr.audits['network-requests']?.numericValue || null,
            totalByteWeight: lhr.audits['network-summary']?.numericValue || null
        };

        const metrics = keyMetrics;

        const timestamp = Date.now();
        const fileName = `${urlHash}-${mode}-${timestamp}.html`;

        const runData = {
            id: `${urlHash}-${mode}-${timestamp}`,
            url,
            urlLabel: getUrlLabel(url),
            mode,
            iteration,
            timestamp,
            fileName,
            categories,
            metrics
        };

        statsData.runs.push(runData);

        if (!statsData.urls[url]) {
            statsData.urls[url] = { label: getUrlLabel(url), mobile: [], desktop: [] };
        }
        statsData.urls[url][mode].push({
            iteration,
            timestamp,
            fileName,
            categories,
            metrics
        });

        fs.writeFileSync(path.join(runsDir, fileName), runnerResult.report);
        fs.writeFileSync(dataPath, JSON.stringify(statsData, null, 2));

        console.log(`✅ Perf: ${categories.performance.toFixed(0)} | FCP: ${(metrics.fcp / 1000).toFixed(2)}s | LCP: ${(metrics.lcp / 1000).toFixed(2)}s | TBT: ${metrics.tbt}ms | Saved: ${fileName}`);
    } catch (error) {
        console.error(`❌ Failed to audit ${url}:`, error.message);
    } finally {
        await chrome.kill();
    }
}

function generateVisualReport() {
    const reportPath = path.join(config.baseDir, "visual-summary.html");

    const urls = Object.keys(statsData.urls);
    const urlLabels = urls.map(u => statsData.urls[u].label);

    const categoryKeys = ['performance', 'accessibility', 'best-practices', 'seo'];
    const mobileData = urls.map(u => statsData.urls[u].mobile);
    const desktopData = urls.map(u => statsData.urls[u].desktop);

    const totalRuns = statsData.runs.length;
    const mobileRuns = statsData.runs.filter(r => r.mode === 'mobile').length;
    const desktopRuns = statsData.runs.filter(r => r.mode === 'desktop').length;
    const runsPerUrl = mobileData[0] ? mobileData[0].length : 0;

    const mobilePerf = mobileData.map(d => calculateAverage(d, 'categories', 'performance'));
    const desktopPerf = desktopData.map(d => calculateAverage(d, 'categories', 'performance'));
    const overallMobilePerf = calculateAverage(statsData.runs.filter(r => r.mode === 'mobile'), 'categories', 'performance');
    const overallDesktopPerf = calculateAverage(statsData.runs.filter(r => r.mode === 'desktop'), 'categories', 'performance');

    const mobileMetrics = urls.map(url => ({
        fcp: calculateAverage(statsData.urls[url].mobile, 'metrics', 'fcp'),
        lcp: calculateAverage(statsData.urls[url].mobile, 'metrics', 'lcp'),
        tbt: calculateAverage(statsData.urls[url].mobile, 'metrics', 'tbt'),
        cls: calculateAverage(statsData.urls[url].mobile, 'metrics', 'cls'),
        si: calculateAverage(statsData.urls[url].mobile, 'metrics', 'si'),
        tti: calculateAverage(statsData.urls[url].mobile, 'metrics', 'tti')
    }));

    const desktopMetrics = urls.map(url => ({
        fcp: calculateAverage(statsData.urls[url].desktop, 'metrics', 'fcp'),
        lcp: calculateAverage(statsData.urls[url].desktop, 'metrics', 'lcp'),
        tbt: calculateAverage(statsData.urls[url].desktop, 'metrics', 'tbt'),
        cls: calculateAverage(statsData.urls[url].desktop, 'metrics', 'cls'),
        si: calculateAverage(statsData.urls[url].desktop, 'metrics', 'si'),
        tti: calculateAverage(statsData.urls[url].desktop, 'metrics', 'tti')
    }));

    const trendData = urls.map(url => ({
        label: statsData.urls[url].label,
        mobile: statsData.urls[url].mobile.map(r => ({ x: r.timestamp, y: r.categories.performance })),
        desktop: statsData.urls[url].desktop.map(r => ({ x: r.timestamp, y: r.categories.performance }))
    }));

    const allRunsData = statsData.runs.map(r => ({
        urlIndex: urls.indexOf(r.url),
        urlLabel: r.urlLabel,
        score: r.categories.performance,
        mode: r.mode,
        fileName: r.fileName,
        timestamp: r.timestamp
    }));

    function buildMetricsRow(metrics, url, prefix) {
        const fcp = metrics.fcp ? (metrics.fcp / 1000).toFixed(2) + 's' : '-';
        const lcp = metrics.lcp ? (metrics.lcp / 1000).toFixed(2) + 's' : '-';
        const tbt = metrics.tbt ? metrics.tbt.toFixed(0) + 'ms' : '-';
        const cls = metrics.cls ? metrics.cls.toFixed(3) : '-';
        const si = metrics.si ? (metrics.si / 1000).toFixed(2) + 's' : '-';
        const tti = metrics.tti ? (metrics.tti / 1000).toFixed(2) + 's' : '-';

        const getGrade = (val, thresholds) => {
            if (!val) return 'none';
            if (val < thresholds[0]) return 'good';
            if (val < thresholds[1]) return 'avg';
            return 'poor';
        };

        return `<tr class="${prefix.toLowerCase()}">
      <td class="url-cell" title="${url}">${url}</td>
      <td class="mode-cell"><span class="badge ${prefix.toLowerCase()}">${prefix}</span></td>
      <td class="${getGrade(metrics.fcp, [1800, 3000])}">${fcp}</td>
      <td class="${getGrade(metrics.lcp, [2500, 4000])}">${lcp}</td>
      <td class="${getGrade(metrics.tbt, [200, 600])}">${tbt}</td>
      <td class="${getGrade(metrics.cls, [0.1, 0.25])}">${cls}</td>
      <td class="${getGrade(metrics.si, [3400, 5800])}">${si}</td>
      <td class="${getGrade(metrics.tti, [3800, 7300])}">${tti}</td>
    </tr>`;
    }

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Lighthouse Performance Dashboard</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;600;700&display=swap" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.2"></script>
    <script src="https://cdn.jsdelivr.net/npm/@sgratzl/chartjs-chart-boxplot@4.3.0/build/index.umd.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/luxon@3.4.4/build/global/luxon.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-luxon@1.3.1/dist/chartjs-adapter-luxon.bundle.min.js"></script>
    <style>
        :root {
            --bg-deep: hsl(220, 15%, 8%);
            --bg-surface: hsl(220, 15%, 12%);
            --bg-card: hsla(220, 15%, 16%, 0.6);
            --border: hsla(220, 15%, 25%, 0.4);
            --text-main: hsl(220, 10%, 95%);
            --text-dim: hsl(220, 10%, 70%);
            --accent: hsl(210, 100%, 55%);
            --accent-glow: hsla(210, 100%, 55%, 0.3);
            --success: hsl(150, 60%, 45%);
            --warning: hsl(40, 90%, 50%);
            --danger: hsl(0, 80%, 55%);
            --sidebar-width: 280px;
            --glass: blur(12px) saturate(180%);
            --chart-bg: hsla(210, 100%, 55%, 0.1);
        }

        .light-mode {
            --bg-deep: hsl(220, 20%, 97%);
            --bg-surface: hsl(220, 20%, 92%);
            --bg-card: hsla(220, 20%, 100%, 0.8);
            --border: hsla(220, 15%, 80%, 0.5);
            --text-main: hsl(220, 20%, 15%);
            --text-dim: hsl(220, 15%, 45%);
            --accent: hsl(210, 100%, 45%);
            --accent-glow: hsla(210, 100%, 45%, 0.15);
            --chart-bg: hsla(210, 100%, 45%, 0.05);
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        body { 
            font-family: 'Inter', system-ui, -apple-system, sans-serif; 
            background: var(--bg-deep); 
            color: var(--text-main);
            overflow-x: hidden;
            display: flex;
            transition: background 0.3s ease, color 0.3s ease;
        }

        /* Sidebar Navigation */
        .sidebar {
            width: var(--sidebar-width);
            height: 100vh;
            background: var(--bg-surface);
            border-right: 1px solid var(--border);
            padding: 2.5rem 1.5rem;
            position: fixed;
            display: flex;
            flex-direction: column;
            z-index: 100;
        }

        .logo {
            font-family: 'Outfit', sans-serif;
            font-size: 1.6rem;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 0.75rem;
            color: var(--accent);
            margin-bottom: 2.5rem;
            letter-spacing: -0.5px;
        }

        .nav-links {
            list-style: none;
            display: flex;
            flex-direction: column;
            gap: 0.4rem;
        }

        .nav-item {
            padding: 0.8rem 1.2rem;
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            color: var(--text-dim);
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 0.75rem;
            text-decoration: none;
            font-size: 0.95rem;
        }

        .nav-item:hover {
            color: var(--text-main);
            background: hsla(220, 15%, 50%, 0.1);
            transform: translateX(4px);
        }

        .nav-item.active {
            color: white;
            background: var(--accent);
            box-shadow: 0 4px 15px var(--accent-glow);
        }

        .theme-toggle {
            margin-top: auto;
            padding: 1.5rem 0 0.5rem;
            border-top: 1px solid var(--border);
            display: flex;
            align-items: center;
            justify-content: space-between;
            color: var(--text-dim);
            font-size: 0.9rem;
            font-weight: 600;
        }

        #themeBtn {
            background: var(--accent);
            border: none;
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            cursor: pointer;
            font-weight: 700;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 8px;
            box-shadow: 0 4px 12px var(--accent-glow);
        }

        #themeBtn:hover {
            transform: scale(1.05);
            filter: brightness(1.1);
        }

        /* Main Content */
        main {
            margin-left: var(--sidebar-width);
            padding: 4rem 5rem;
            width: 100%;
            max-width: 1400px;
        }

        header {
            margin-bottom: 5rem;
            border-bottom: 2px solid var(--accent);
            padding-bottom: 2.5rem;
        }

        .header-info h1 {
            font-family: 'Outfit', sans-serif;
            font-size: 3.5rem;
            font-weight: 800;
            margin-bottom: 0.75rem;
            letter-spacing: -1.5px;
        }

        .header-info p {
            color: var(--text-dim);
            font-size: 1.2rem;
            max-width: 700px;
            line-height: 1.6;
        }

        /* Section Layout */
        section {
            margin-bottom: 12rem;
            scroll-margin-top: 4rem;
        }

        .section-header {
            margin-bottom: 4rem;
        }

        .section-header h2 {
            font-family: 'Outfit', sans-serif;
            font-size: 2.5rem;
            margin-bottom: 1.25rem;
            color: var(--text-main);
            position: relative;
            display: inline-block;
        }

        .section-header h2::after {
            content: '';
            position: absolute;
            left: 0;
            bottom: -8px;
            width: 60px;
            height: 4px;
            background: var(--accent);
            border-radius: 2px;
        }

        .section-header p {
            color: var(--text-dim);
            font-size: 1.1rem;
            line-height: 1.5;
            max-width: 850px;
        }

        /* Metric Cards */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 2rem;
            margin-bottom: 5rem;
        }

        .card {
            background: var(--bg-card);
            backdrop-filter: var(--glass);
            -webkit-backdrop-filter: var(--glass);
            border: 1px solid var(--border);
            border-radius: 24px;
            padding: 2.5rem;
            transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        .card:hover {
            transform: translateY(-8px);
            box-shadow: 0 30px 60px rgba(0,0,0,0.3);
            border-color: var(--accent);
        }

        .stat-card .label {
            color: var(--text-dim);
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 2px;
            margin-bottom: 1rem;
            font-weight: 800;
        }

        .stat-card .value {
            font-size: 3.5rem;
            font-weight: 800;
            font-family: 'Outfit', sans-serif;
            color: var(--text-main);
            line-height: 1;
        }

        .stat-card .trend {
            margin-top: 1rem;
            font-size: 0.95rem;
            color: var(--accent);
            font-weight: 600;
        }

        /* Charts */
        .chart-container {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 28px;
            padding: 3rem;
            margin-bottom: 3.5rem;
        }

        .chart-header {
            margin-bottom: 3rem;
        }

        .chart-header h3 {
            font-family: 'Outfit', sans-serif;
            font-size: 1.8rem;
            margin-bottom: 0.75rem;
            color: var(--text-main);
        }

        .chart-header p {
            font-size: 1rem;
            color: var(--text-dim);
            max-width: 800px;
        }

        .chart-box {
            position: relative;
            height: 500px;
        }

        /* Tables */
        .table-container {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 28px;
            padding: 2rem;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }

        table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            font-size: 0.95rem;
        }

        th {
            text-align: left;
            padding: 1.5rem 1rem;
            color: var(--text-dim);
            font-weight: 800;
            text-transform: uppercase;
            font-size: 0.8rem;
            letter-spacing: 1.5px;
            border-bottom: 2px solid var(--border);
        }

        td {
            padding: 1.5rem 1rem;
            border-bottom: 1px solid var(--border);
            font-weight: 500;
        }

        tr:last-child td { border-bottom: none; }
        
        tr:hover td {
            background: hsla(210, 100%, 55%, 0.05);
        }

        .url-cell { 
            font-family: 'SFMono-Regular', Consolas, monospace; 
            font-size: 0.85rem; 
            color: var(--accent);
            max-width: 400px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        
        .badge {
            padding: 8px 14px;
            border-radius: 10px;
            font-size: 0.7rem;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .badge.mobile { background: hsla(25, 95%, 60%, 0.15); color: hsl(25, 95%, 60%); border: 1px solid hsla(25, 95%, 60%, 0.3); }
        .badge.desktop { background: hsla(210, 100%, 55%, 0.15); color: hsl(210, 100%, 55%); border: 1px solid hsla(210, 100%, 55%, 0.3); }

        .good { color: var(--success); font-weight: 800; }
        .avg { color: var(--warning); font-weight: 800; }
        .poor { color: var(--danger); font-weight: 800; }

        /* Custom Scrollbar */
        ::-webkit-scrollbar { width: 12px; }
        ::-webkit-scrollbar-track { background: var(--bg-deep); }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 6px; border: 3px solid var(--bg-deep); }
        ::-webkit-scrollbar-thumb:hover { background: var(--accent); }

        @media print {
            html { font-size: 12px !important; }
            body { font-size: 12px !important; background: white !important; color: black !important; }
            .sidebar { display: none !important; }
            main { margin-left: 0 !important; padding: 0 !important; max-width: none !important; }
            .theme-toggle { display: none !important; }
            
            /* Reduce Graph Sizes */
            .chart-box { height: 260px !important; }
            .chart-box canvas { width: 100% !important; height: 100% !important; object-fit: contain !important; }
            .chart-container { padding: 1.5rem !important; margin-bottom: 2rem !important; }
            
            /* Prevent Page Breaks Inside Elements */
            .card, .chart-container, tr { 
                page-break-inside: avoid !important; 
                break-inside: avoid !important; 
            }
            
            /* Adjust Typography for Print */
            .header-info h1 { font-size: 2.2rem !important; }
            .header-info p { font-size: 1rem !important; }
            .section-header h2 { font-size: 1.8rem !important; margin-bottom: 0.5rem !important; }
            .section-header p { font-size: 1rem !important; }
            .stat-card .value { font-size: 2.2rem !important; }
            .stat-card .label { font-size: 0.8rem !important; margin-bottom: 0.5rem !important; }
            
            /* Compress Spacing */
            section { margin-bottom: 3rem !important; }
            header { margin-bottom: 3rem !important; padding-bottom: 1rem !important; }
            .card { padding: 1.5rem !important; }
            .stats-grid { gap: 1rem !important; margin-bottom: 2rem !important; }
            .chart-header { margin-bottom: 1rem !important; }
            .chart-header h3 { font-size: 1.4rem !important; margin-bottom: 0.2rem !important; }
            .chart-header p { font-size: 0.95rem !important; }
            
            td, th { padding: 0.8rem !important; font-size: 0.8rem !important; }
            .url-cell { 
                font-size: 0.75rem !important; 
                max-width: 150px !important; 
                direction: rtl; 
                text-align: left; 
            }
        }

        @media (max-width: 1000px) {
            .sidebar { width: 90px; padding: 2.5rem 1rem; }
            .logo span, .nav-item span, .theme-toggle span { display: none; }
            main { margin-left: 90px; padding: 2rem; }
        }
    </style>
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

        <!-- OVERVIEW SECTION -->
        <section id="overview">
            <div class="section-header">
                <h2>Executive Summary</h2>
                <p>A high-level health check of your digital property. We aggregate performance scores from across your ecosystem to provide a standardized metric of user satisfaction and technical efficiency. This snapshot represents the current state of stability and speed for both mobile hardware and high-performance desktop environments.</p>
            </div>
            
            <div class="stats-grid">
                <div class="card stat-card">
                    <div class="label">Total Audits</div>
                    <div class="value">${totalRuns}</div>
                    <div class="trend">Across ${urls.length} target pages</div>
                </div>
                <div class="card stat-card">
                    <div class="label">Mobile Health</div>
                    <div class="value">${overallMobilePerf.toFixed(0)}</div>
                    <div class="trend">Target: 90+ Excellence</div>
                </div>
                <div class="card stat-card">
                    <div class="label">Desktop Health</div>
                    <div class="value">${overallDesktopPerf.toFixed(0)}</div>
                    <div class="trend">Target: 90+ Excellence</div>
                </div>
                <div class="card stat-card">
                    <div class="label">Data Quality</div>
                    <div class="value">${runsPerUrl}</div>
                    <div class="trend">Samples per segment</div>
                </div>
            </div>

            <div class="chart-container">
                <div class="chart-header">
                    <h3>Page Performance Breakdown</h3>
                    <p>Comparative scoring per URL. Each bar represents the aggregated Lighthouse Performance Score (0-100), accounting for critical loading and interactivity thresholds.</p>
                </div>
                <div class="chart-box">
                    <canvas id="performanceChart"></canvas>
                </div>
            </div>

            <div class="chart-container">
                <div class="chart-header">
                    <h3>Site Quality Radar</h3>
                    <p>Holistic health across categories. This visualization helps balance speed with user accessibility and SEO visibility.</p>
                </div>
                <div class="chart-box" style="height: 400px;">
                    <canvas id="categoriesChart"></canvas>
                </div>
            </div>
        </section>

        <!-- METRICS SECTION -->
        <section id="metrics">
            <div class="section-header">
                <h2>Technical Vitals Analysis</h2>
                <p>Detailed performance telemetry based on Google's Core Web Vitals. We measure the exact moments your users see content and the responsiveness of the interface. This data is critical for understanding SEO ranking and user retention impacts.</p>
            </div>

            <div class="chart-container">
                <div class="chart-header">
                    <h3>Mobile UX Core Metrics</h3>
                    <p>Simulating mid-tier mobile experience. Metrics shown include <strong>First Contentful Paint</strong> (loading start) and <strong>Largest Contentful Paint</strong> (content ready).</p>
                </div>
                <div class="chart-box">
                    <canvas id="mobileMetricsChart"></canvas>
                </div>
            </div>

            <div class="chart-container">
                <div class="chart-header">
                    <h3>Desktop Power User Metrics</h3>
                    <p>Experience on high-powered machines. Expect significantly lower latency; outliers in desktop view often point to severe asset delivery issues.</p>
                </div>
                <div class="chart-box">
                    <canvas id="desktopMetricsChart"></canvas>
                </div>
            </div>

            <div class="section-header" style="margin-top: 6rem;">
                <h3>Audit Log (Averages)</h3>
                <p>Complete statistical mapping for every page, showing all primary speed factors and layout consistency (CLS).</p>
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
                        ${urls.flatMap(url => {
        const mobile = statsData.urls[url].mobile;
        const desktop = statsData.urls[url].desktop;
        const avgMobile = {
            fcp: calculateAverage(mobile, 'metrics', 'fcp'),
            lcp: calculateAverage(mobile, 'metrics', 'lcp'),
            tbt: calculateAverage(mobile, 'metrics', 'tbt'),
            cls: calculateAverage(mobile, 'metrics', 'cls'),
            si: calculateAverage(mobile, 'metrics', 'si'),
            tti: calculateAverage(mobile, 'metrics', 'tti')
        };
        const avgDesktop = {
            fcp: calculateAverage(desktop, 'metrics', 'fcp'),
            lcp: calculateAverage(desktop, 'metrics', 'lcp'),
            tbt: calculateAverage(desktop, 'metrics', 'tbt'),
            cls: calculateAverage(desktop, 'metrics', 'cls'),
            si: calculateAverage(desktop, 'metrics', 'si'),
            tti: calculateAverage(desktop, 'metrics', 'tti')
        };
        return [
            buildMetricsRow(avgMobile, url, 'Mobile'),
            buildMetricsRow(avgDesktop, url, 'Desktop')
        ];
    }).join('')}
                    </tbody>
                </table>
            </div>
        </section>

        <!-- TRENDS SECTION -->
        <section id="trends">
            <div class="section-header">
                <h2>Stability & Landscape Analysis</h2>
                <p>Tracking variability and consistency over time. Performance is not static—it fluctuates based on server load and network volatility. This section models the "envelope" of performance for each page.</p>
            </div>

            <div class="chart-container">
                <div class="chart-header">
                    <h3>Performance Envelope</h3>
                    <p>Visualizing score range (Min/Avg/Max) to determine consistency. A narrow band indicates high reliability.</p>
                </div>
                <div class="chart-box">
                    <canvas id="distributionChart"></canvas>
                </div>
            </div>
            
            <div class="chart-container">
                <div class="chart-header">
                    <h3>Iterative Progression Trend</h3>
                    <p>Historical score progression through the current audit session. Tracks stability and transient server issues.</p>
                </div>
                <div class="chart-box">
                    <canvas id="trendsChart"></canvas>
                </div>
            </div>
        </section>

        <!-- RUNS SECTION -->
        <section id="runs">
            <div class="section-header">
                <h2>Raw Audit Registry</h2>
                <p>Individual test results for deep-level technical auditing. Use this interactive scatterplot to isolate outliers or open specific reports.</p>
            </div>

            <div class="chart-container" id="scatterChartContainer">
                <div class="chart-header">
                    <h3>Discrete Run Mapping</h3>
                    <p>Click any point to open the corresponding Lighthouse HTML report for detailed technical recommendations.</p>
                </div>
                <div class="chart-box">
                    <canvas id="scatterChart"></canvas>
                </div>
            </div>
        </section>
    </main>

    <script>
        const urlLabels = ${JSON.stringify(urlLabels)};
        const mobilePerf = ${JSON.stringify(mobilePerf)};
        const desktopPerf = ${JSON.stringify(desktopPerf)};
        const mobileMetrics = ${JSON.stringify(mobileMetrics)};
        const desktopMetrics = ${JSON.stringify(desktopMetrics)};
        const trendData = ${JSON.stringify(trendData)};
        const allRunsData = ${JSON.stringify(allRunsData)};

        // Navigation Highlight
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

        // Theme Toggle
        const themeBtn = document.getElementById('themeBtn');
        const body = document.body;
        const themeText = document.getElementById('themeText');
        
        function setTheme(isLight) {
            if (isLight) {
                body.classList.add('light-mode');
                themeText.innerText = 'Light';
                localStorage.setItem('lhr-theme', 'light');
            } else {
                body.classList.remove('light-mode');
                themeText.innerText = 'Dark';
                localStorage.setItem('lhr-theme', 'dark');
            }
            updateChartThemes();
        }

        themeBtn.addEventListener('click', () => setTheme(!body.classList.contains('light-mode')));
        if (localStorage.getItem('lhr-theme') === 'light') setTheme(true);

        // Common Chart Defaults
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

        const colors = {
            blue: 'hsl(210, 100%, 50%)',
            orange: 'hsl(25, 95%, 55%)',
            teal: 'hsl(170, 70%, 45%)',
            gray: 'hsl(220, 15%, 50%)'
        };

        const transparentize = (hsl, alpha) => {
            const h = hsl.match(/\\d+/g);
            return 'hsla(' + h[0] + ', ' + h[1] + '%, ' + h[2] + '%, ' + alpha + ')';
        };

        // Performance Bar Chart
        new Chart(document.getElementById('performanceChart'), {
            type: 'bar',
            data: {
                labels: urlLabels,
                datasets: [
                    { label: 'Mobile Score', data: mobilePerf, backgroundColor: colors.orange, borderRadius: 8 },
                    { label: 'Desktop Score', data: desktopPerf, backgroundColor: colors.blue, borderRadius: 8 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { 
                    y: { beginAtZero: true, max: 100, grid: { color: 'hsla(220, 15%, 50%, 0.1)' } },
                    x: { grid: { display: false } }
                },
                plugins: { legend: { position: 'top', align: 'end', labels: { usePointStyle: true, padding: 25 } } }
            }
        });

        // Categories Radar
        const catKeys = ${JSON.stringify(categoryKeys)};
        const mobileDataRaw = ${JSON.stringify(mobileData)};
        const desktopDataRaw = ${JSON.stringify(desktopData)};
        
        const getAggAvg = (data, key) => {
            const vals = data.flatMap(d => d.map(r => (r.categories[key] || 0)));
            return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        };

        new Chart(document.getElementById('categoriesChart'), {
            type: 'radar',
            data: {
                labels: ['Performance', 'Accessibility', 'Best Practices', 'SEO'],
                datasets: [
                    { 
                        label: 'Mobile Ecosystem', 
                        data: catKeys.map(k => getAggAvg(mobileDataRaw, k)), 
                        borderColor: colors.orange, 
                        backgroundColor: transparentize(colors.orange, 0.2),
                        pointBackgroundColor: colors.orange,
                        borderWidth: 2
                    },
                    { 
                        label: 'Desktop Ecosystem', 
                        data: catKeys.map(k => getAggAvg(desktopDataRaw, k)), 
                        borderColor: colors.blue, 
                        backgroundColor: transparentize(colors.blue, 0.2),
                        pointBackgroundColor: colors.blue,
                        borderWidth: 2
                    }
                ]
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

        // Metrics Charts
        const createMetricsChart = (id, data, colorPrimary) => {
            new Chart(document.getElementById(id), {
                type: 'bar',
                data: {
                    labels: urlLabels,
                    datasets: [
                        { label: 'FCP (s)', data: data.map(d => d.fcp/1000), backgroundColor: colors.gray, borderRadius: 6 },
                        { label: 'LCP (s)', data: data.map(d => d.lcp/1000), backgroundColor: colorPrimary, borderRadius: 6 },
                        { label: 'TBT (ms)', data: data.map(d => d.tbt), borderColor: colors.teal, backgroundColor: colors.teal, type: 'line', yAxisID: 'y1', tension: 0.4, pointRadius: 4 }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { title: { display: true, text: 'Seconds (Lower is Better)' }, grid: { color: 'hsla(220, 15%, 50%, 0.1)' } },
                        y1: { position: 'right', title: { display: true, text: 'TBT Milliseconds' }, grid: { display: false } }
                    },
                    plugins: { legend: { position: 'bottom', labels: { padding: 20 } } }
                }
            });
        };

        createMetricsChart('mobileMetricsChart', mobileMetrics, colors.orange);
        createMetricsChart('desktopMetricsChart', desktopMetrics, colors.blue);

        // Distribution Chart (Boxplot)
        const getRawScores = (data) => {
            return data.map(u => u.map(r => r.categories.performance));
        };

        new Chart(document.getElementById('distributionChart'), {
            type: 'boxplot',
            data: {
                labels: urlLabels,
                datasets: [
                    {
                        label: 'Mobile Distribution',
                        data: getRawScores(mobileDataRaw),
                        backgroundColor: transparentize(colors.orange, 0.4),
                        borderColor: colors.orange,
                        borderWidth: 2,
                        itemRadius: 3
                    },
                    {
                        label: 'Desktop Distribution',
                        data: getRawScores(desktopDataRaw),
                        backgroundColor: transparentize(colors.blue, 0.4),
                        borderColor: colors.blue,
                        borderWidth: 2,
                        itemRadius: 3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { 
                    y: { max: 100, min: 0, grid: { color: 'hsla(220, 15%, 50%, 0.1)' } },
                    x: { grid: { display: false } }
                },
                plugins: { legend: { position: 'bottom', labels: { padding: 20 } } }
            }
        });

        // Landscape Trends Chart - ABSOLUTE HH:mm ACCURACY
        const trendLabels = trendData.length ? trendData[0].mobile.map(p => {
            const date = new Date(p.x);
            return (date.getHours().toString().padStart(2, '0')) + ':' + (date.getMinutes().toString().padStart(2, '0'));
        }) : [];

        new Chart(document.getElementById('trendsChart'), {
            type: 'line',
            data: {
                labels: trendLabels,
                datasets: trendData.flatMap((d, i) => [
                    { 
                        label: d.label + ' (M)', 
                        data: d.mobile.map(p => p.y), 
                        borderColor: colors.orange, 
                        borderDash: [5, 5], 
                        backgroundColor: 'transparent', 
                        tension: 0.4, 
                        pointRadius: 2,
                        hidden: i > 0
                    },
                    { 
                        label: d.label + ' (D)', 
                        data: d.desktop.map(p => p.y), 
                        borderColor: colors.blue, 
                        backgroundColor: 'transparent', 
                        tension: 0.4, 
                        pointRadius: 2,
                        hidden: i > 0
                    }
                ])
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { 
                        type: 'category', 
                        display: true,
                        title: { display: true, text: 'Audit Timeline', color: 'hsl(220, 10%, 95%)', font: { weight: '700' } },
                        grid: { color: 'hsla(220, 15%, 50%, 0.1)' },
                        ticks: { color: 'hsl(220, 10%, 70%)' }
                    },
                    y: { max: 100, min: 0, title: { display: true, text: 'Score', color: 'hsl(220, 10%, 95%)', font: { weight: '700' } }, grid: { color: 'hsla(220, 15%, 50%, 0.1)' }, ticks: { color: 'hsl(220, 10%, 70%)' } }
                },
                plugins: { 
                    legend: { position: 'bottom', labels: { boxWidth: 10, padding: 15 } }
                }
            }
        });

        // Scatter Chart - FIXED AXIS
        new Chart(document.getElementById('scatterChart'), {
            type: 'scatter',
            data: {
                datasets: [
                    {
                        label: 'Mobile Dataset',
                        data: allRunsData.filter(r => r.mode === 'mobile').map(r => ({ x: r.urlIndex, y: r.score, fileName: r.fileName })),
                        backgroundColor: colors.orange,
                        pointRadius: 6,
                        hoverRadius: 10
                    },
                    {
                        label: 'Desktop Dataset',
                        data: allRunsData.filter(r => r.mode === 'desktop').map(r => ({ x: r.urlIndex, y: r.score, fileName: r.fileName })),
                        backgroundColor: colors.blue,
                        pointRadius: 6,
                        hoverRadius: 10
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { 
                        min: 0,
                        max: urlLabels.length - 1,
                        ticks: { 
                            callback: (v) => urlLabels[v] || '',
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
                                return 'Score: ' + d.y + ' (Click to view report)';
                            }
                        }
                    }
                },
                onClick: (e, el) => {
                    if (el.length) {
                        const data = e.chart.data.datasets[el[0].datasetIndex].data[el[0].index];
                        window.open('runs/' + data.fileName, '_blank');
                    }
                }
            }
        });
    </script>
</body>
</html>`;

    fs.writeFileSync(reportPath, htmlContent);
    console.log(`\n✨ Refined Premium Dashboard updated: ${reportPath}`);
}
async function main() {
    const iterations = (args.runIterations !== undefined) ? args.runIterations : config.iterations;

    console.log(`\n📊 Mode: ${iterations > 0 ? `Run ${iterations} Lighthouse iteration(s)` : 'Extract-only (no new tests)'}`);

    const extractedData = extractDataFromReports();
    statsData = extractedData || { runs: [], urls: {} };

    if (iterations > 0) {
        for (let i = 1; i <= iterations; i++) {
            console.log(`\n--- 🔄 Round Robin: Pass ${i} of ${iterations} ---`);

            for (const url of config.urls) {
                for (const mode of config.emulations) {
                    await runLighthouse(url, i, mode);

                    console.log(`Waiting ${config.delay}s...`);
                    await sleep(config.delay * 1000);
                }
            }
        }
    }

    fs.writeFileSync(dataPath, JSON.stringify(statsData, null, 2));
    generateVisualReport();
    await writeExcelReport();
    console.log('\n🏁 Complete.');
}

main().catch(console.error);
