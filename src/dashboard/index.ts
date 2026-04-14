import * as fs from 'fs';
import * as path from 'path';
import { generateHtml } from './template';
import { StatsData } from '../utils';
import { config } from '../config';

export function generateVisualReport(statsData: StatsData): void {
  const reportPath = path.join(config.baseDir, 'visual-summary.html');
  const htmlContent = generateHtml(statsData);
  fs.writeFileSync(reportPath, htmlContent);
  console.log(`\n✨ Refined Premium Dashboard updated: ${reportPath}`);
}