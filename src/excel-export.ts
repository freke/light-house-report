import ExcelJS from 'exceljs';
import * as path from 'path';
import * as fs from 'fs';
import { config, args } from './config.js';
import { StatsData } from './utils.js';
import { calcAvg } from './calculations.js';

function buildExcelRows(statsData: StatsData): any[] {
  // Compute test date: use provided date, or most recent run date, or today
  const testDate = args.testDate || (() => {
    const timestamps = statsData.runs
      .map(r => r.timestamp)
      .filter((t): t is number => typeof t === 'number' && t > 0);
    
    if (timestamps.length > 0) {
      const mostRecent = Math.max(...timestamps);
      return new Date(mostRecent).toISOString().split('T')[0];
    }
    
    return new Date().toISOString().split('T')[0];
  })();

  return Object.keys(statsData.urls).flatMap((url) => {
    const urlStats = statsData.urls[url];

    return [
      { mode: 'mobile-4g', label: 'Mobile 4G' },
      { mode: 'mobile-wifi', label: 'Mobile WiFi' },
      { mode: 'desktop', label: 'Desktop' },
    ].flatMap(({ mode, label }) => {
      const entries = urlStats.modes[mode] || [];
      if (!entries.length) return [];

      const fcpVal = calcAvg(entries, 'metrics', 'fcp') / 1000;
      const lcpVal = calcAvg(entries, 'metrics', 'lcp') / 1000;
      const tbtVal = Math.round(calcAvg(entries, 'metrics', 'tbt'));
      const clsVal = calcAvg(entries, 'metrics', 'cls');
      const siVal = calcAvg(entries, 'metrics', 'si') / 1000;
      const ttiVal = calcAvg(entries, 'metrics', 'tti') / 1000;

      return [
        {
          url,
          type: label,
          testDate,
          tester: config.tester || '',
          region: config.region || '',
          fcp: fcpVal,
          lcp: lcpVal,
          tbt: tbtVal,
          cls: clsVal,
          si: siVal,
          tti: ttiVal,
        },
      ];
    });
  });
}

function getExcelOutputPath(): string {
  if (args.excelOutput) {
    return path.resolve(args.excelOutput);
  }

  return path.join(config.baseDir, 'visual-summary.xlsx');
}

export async function writeExcelReport(statsData: StatsData): Promise<void> {
  if (args.skipExcel || config?.skipExcel) {
    console.log('⏭️ Skipping Excel export (--no-excel).');
    return;
  }

  const rows = buildExcelRows(statsData);
  if (!rows.length) {
    console.warn('⚠️ No aggregated rows available for Excel export.');
    return;
  }

  const outputPath = getExcelOutputPath();
  const parentDir = path.dirname(outputPath);
  await fs.promises.mkdir(parentDir, { recursive: true });
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Parsed Results');

  worksheet.views = [{ state: 'frozen', ySplit: 1 }];

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
    'TTI (s)',
  ];

  // Add header row
  const headerRow = worksheet.addRow(headers);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4F81BD' },
  };
  worksheet.columns = headers.map(() => ({ width: 20 }));

  rows.forEach((row) => {
    worksheet.addRow([
      row.url,
      row.type,
      row.testDate,
      row.tester,
      row.region,
      row.fcp.toFixed(2),
      row.lcp.toFixed(2),
      Math.round(row.tbt),
      row.cls.toFixed(3),
      row.si.toFixed(2),
      row.tti.toFixed(2),
    ]);
  });

  await workbook.xlsx.writeFile(outputPath);
  console.log(`📗 Excel summary updated: ${outputPath}`);
}
