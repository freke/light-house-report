import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import * as os from 'os';
import { runsDir, args } from './config';

function fixDoublePrefixesInReport(filePath: string): void {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  const doublePrefixRegex = /data:image\/(jpeg|png|webp);base64,data:image\/(jpeg|png|webp);base64,/g;
  content = content.replace(doublePrefixRegex, (match, outerType, innerType) => {
    modified = true;
    return `data:image/${innerType};base64,`;
  });

  if (content.includes('var ye="data:image/jpeg;base64,"')) {
    content = content.replace(/var ye="data:image\/jpeg;base64,"/g, 'var ye=""');
    modified = true;
  }
  if (content.includes('var ye = "data:image/jpeg;base64,"')) {
    content = content.replace(/var ye = "data:image\/jpeg;base64,"/g, 'var ye = ""');
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(filePath, content);
  }
}

interface CompressionResult {
  originalSize: number;
  compressedSize: number;
  imagesProcessed: number;
}

function compressReportImages(filePath: string, quality: number = 30): CompressionResult {
  let content = fs.readFileSync(filePath, 'utf8');
  const originalSize = Buffer.byteLength(content, 'utf8');

  const imgRegex = /data:image\/(jpeg|png|webp);base64,([^"\s>}\]]+)/g;
  let match;
  let imagesProcessed = 0;
  const replacements: Array<{ original: string; replacement: string }> = [];

  while ((match = imgRegex.exec(content)) !== null) {
    const [fullMatch, imgType, b64Data] = match;
    try {
      const inputBuf = Buffer.from(b64Data, 'base64');

      if (imgType === 'webp' && inputBuf.length < 50 * 1024) {
        continue;
      }

      const uid = `${Date.now()}_${imagesProcessed}`;
      const ext = imgType === 'jpeg' ? 'jpg' : imgType;
      const tmpIn = path.join(os.tmpdir(), `lhr_img_${uid}.${ext}`);
      const tmpOut = path.join(os.tmpdir(), `lhr_img_${uid}.webp`);

      const useQuality = imgType === 'webp' ? Math.min(quality * 2, 80) : quality;

      fs.writeFileSync(tmpIn, inputBuf);
      execFileSync('convert', [tmpIn, '-quality', String(useQuality), tmpOut], {
        timeout: 15000,
      });

      const outputBuf = fs.readFileSync(tmpOut);

      if (outputBuf.length < inputBuf.length) {
        const newB64 = outputBuf.toString('base64');
        replacements.push({
          original: fullMatch,
          replacement: `data:image/webp;base64,${newB64}`,
        });
        imagesProcessed++;
      }

      try {
        fs.unlinkSync(tmpIn);
      } catch {}
      try {
        fs.unlinkSync(tmpOut);
      } catch {}
    } catch {}
  }

  for (const { original, replacement } of replacements) {
    content = content.replace(original, replacement);
  }

  fs.writeFileSync(filePath, content);
  const compressedSize = Buffer.byteLength(content, 'utf8');

  return { originalSize, compressedSize, imagesProcessed };
}

export function compressAllReports(quality: number): void {
  const files = fs.readdirSync(runsDir).filter((f) => f.endsWith('.html'));
  console.log(
    `\n🗜️  Compressing ${files.length} HTML reports (WebP quality: ${quality})...`,
  );

  let totalOriginal = 0;
  let totalCompressed = 0;
  let totalImages = 0;
  let skipped = 0;

  for (const file of files) {
    const filePath = path.join(runsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');

    const hasNonWebp = /data:image\/(jpeg|png);base64,/.test(content);
    const hasLargeWebp = /data:image\/webp;base64,([^"\s>}]{68000,})/.test(content);
    if (!hasNonWebp && !hasLargeWebp) {
      skipped++;
      continue;
    }

    const result = compressReportImages(filePath, quality);
    totalOriginal += result.originalSize;
    totalCompressed += result.compressedSize;
    totalImages += result.imagesProcessed;

    const saved = (
      (1 - result.compressedSize / result.originalSize) *
      100
    ).toFixed(0);
    console.log(
      `   ✓ ${file}: ${(result.originalSize / 1024).toFixed(0)}KB → ${(result.compressedSize / 1024).toFixed(0)}KB (-${saved}%, ${result.imagesProcessed} images)`,
    );
  }

  const totalSaved =
    totalOriginal > 0
      ? ((1 - totalCompressed / totalOriginal) * 100).toFixed(0)
      : 0;
  console.log(`\n📊 Compression summary:`);
  console.log(
    `   Files processed: ${files.length - skipped} (${skipped} already compressed)`,
  );
  console.log(`   Images converted: ${totalImages}`);
  if (totalOriginal > 0) {
    console.log(
      `   Total: ${(totalOriginal / 1024 / 1024).toFixed(1)}MB → ${(totalCompressed / 1024 / 1024).toFixed(1)}MB (-${totalSaved}%)`,
    );
  }
}

export { fixDoublePrefixesInReport, compressReportImages };