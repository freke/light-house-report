import archiver from 'archiver';
import * as fs from 'fs';
import * as path from 'path';
import { config, args, runsDir } from './config.js';

function sanitizeFileNamePart(value: string, fallback: string): string {
  if (!value || !String(value).trim()) {
    return fallback;
  }

  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || fallback;
}

function getZipOutputPath(): string {
  if (args.zipOutput) {
    return path.resolve(args.zipOutput);
  }

  const datePart = sanitizeFileNamePart(args.testDate, new Date().toISOString().slice(0, 10));
  const regionPart = sanitizeFileNamePart(config.region, 'unknown-region');
  const testerPart = sanitizeFileNamePart(config.tester, 'unknown-tester');
  const fileName = `reports-${datePart}-${regionPart}-${testerPart}.zip`;
  return path.join(config.baseDir, fileName);
}

function getExcelOutputPath(): string {
  if (args.excelOutput) {
    return path.resolve(args.excelOutput);
  }

  return path.join(config.baseDir, 'visual-summary.xlsx');
}

function getDataPath(): string {
  return path.join(config.baseDir, 'persistent_stats.json');
}

export async function writeReportsZip(): Promise<void> {
  if (args.skipZip || config?.skipZip) {
    console.log('⏭️ Skipping zip export (--no-zip or config).');
    return;
  }

  const zipOutputPath = getZipOutputPath();
  const sourceFiles = [
    path.join(config.baseDir, 'visual-summary.html'),
    getDataPath(),
    ...(!config.skipExcel && !args.skipExcel ? [getExcelOutputPath()] : []),
  ].filter((filePath) => fs.existsSync(filePath));

  const hasRuns = fs.existsSync(runsDir) && fs.readdirSync(runsDir).length > 0;
  if (!sourceFiles.length && !hasRuns) {
    console.warn('⚠️ No report artifacts available to zip.');
    return;
  }

  fs.mkdirSync(path.dirname(zipOutputPath), { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(zipOutputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve());
    output.on('error', reject);
    archive.on('error', reject);

    archive.pipe(output);

    sourceFiles.forEach((filePath) => {
      archive.file(filePath, { name: path.join('reports', path.basename(filePath)) });
    });

    if (hasRuns) {
      archive.directory(runsDir, path.join('reports', config.reportSubDir));
    }

    archive.finalize();
  });

  console.log(`🗜️ Reports archive updated: ${zipOutputPath}`);
}
