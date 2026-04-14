const esbuild = require('esbuild');

const args = process.argv.slice(2);
const watch = args.includes('--watch');
const minify = args.includes('--minify');

const buildOptions = {
  entryPoints: ['./src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  outfile: './lighthouse-runner.mjs',
  minify,
  sourcemap: false,
  external: ['lighthouse', 'chrome-launcher'],
  banner: {
    js: '#!/usr/bin/env node',
  },
};

async function build() {
  if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    const result = await esbuild.build(buildOptions);
    if (result.errors.length > 0) {
      console.error('Build errors:', result.errors);
      process.exit(1);
    }
    console.log('Built successfully!');
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});