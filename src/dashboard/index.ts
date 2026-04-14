import * as fs from 'fs';
import * as path from 'path';
import { generateHtml } from './template.js';
import { StatsData } from '../utils.js';
import { config } from '../config.js';

export function generateVisualReport(statsData: StatsData): void {
  const reportPath = path.join(config.baseDir, 'visual-summary.html');
  const htmlContent = generateHtml(statsData);
  fs.writeFileSync(reportPath, htmlContent);
  console.log(`\n✨ Refined Premium Dashboard updated: ${reportPath}`);
}