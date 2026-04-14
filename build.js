import * as esbuild from 'esbuild';

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
  sourcemap: true,
  external: ['lighthouse', 'chrome-launcher'],
  banner: {
    js: '#!/usr/bin/env node',
  },
  plugins: [{
    name: 'rebuild-notify',
    setup(build) {
      build.onEnd(result => {
        if (result.errors.length > 0) {
          console.error('Build errors:', result.errors);
        } else {
          console.log('Built successfully!');
        }
      });
    },
  }],
};

async function build() {
  try {
    if (watch) {
      const ctx = await esbuild.context(buildOptions);
      await ctx.watch();
      console.log('Watching for changes...');
    } else {
      const result = await esbuild.build(buildOptions);
      if (result.errors.length > 0) {
        process.exit(1);
      }
    }
  } catch (err) {
    console.error('Build failed:', err);
    process.exit(1);
  }
}

build();