import * as esbuild from 'esbuild';

const args = process.argv.slice(2);
const watch = args.includes('--watch');
const minify = args.includes('--minify');

const sharedOptions = {
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  minify,
  sourcemap: true,
  external: ['lighthouse', 'chrome-launcher', 'exceljs', 'archiver', 'crypto', 'fs', 'path', 'os', 'stream', 'zlib', 'net', 'tls', 'http', 'https', 'url', 'util'],
};

const builds = [
  {
    ...sharedOptions,
    entryPoints: ['./src/index.ts'],
    outfile: './lighthouse-runner.mjs',
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
  {
    ...sharedOptions,
    entryPoints: ['./src/audit-worker.ts'],
    outfile: './lighthouse-audit-worker.mjs',
  },
];

async function build() {
  try {
    if (watch) {
      const contexts = await Promise.all(builds.map(opts => esbuild.context(opts)));
      await Promise.all(contexts.map(ctx => ctx.watch()));
      console.log('Watching for changes...');
    } else {
      const results = await Promise.all(builds.map(opts => esbuild.build(opts)));
      const hasErrors = results.some(r => r.errors.length > 0);
      if (hasErrors) {
        process.exit(1);
      } else {
        console.log('Built successfully!');
      }
    }
  } catch (err) {
    console.error('Build failed:', err);
    process.exit(1);
  }
}

build();
