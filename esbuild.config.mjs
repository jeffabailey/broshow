import * as esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(__dirname, 'src');
const distDir = resolve(__dirname, 'dist');

// Ensure dist directory exists
mkdirSync(distDir, { recursive: true });

// Bundle TypeScript entry points
await esbuild.build({
  entryPoints: [
    resolve(srcDir, 'popup.ts'),
    resolve(srcDir, 'background.ts'),
    resolve(srcDir, 'offscreen.ts'),
    resolve(srcDir, 'record.ts'),
  ],
  bundle: true,
  outdir: distDir,
  format: 'esm',
  target: 'chrome120',
  minify: false,
  sourcemap: true,
});

// Copy static assets from src/ to dist/. force:true so concurrent builds
// (e.g., parallel vitest beforeAll hooks) don't race on EEXIST.
const copyOpts = { force: true };
cpSync(resolve(srcDir, 'manifest.json'), resolve(distDir, 'manifest.json'), copyOpts);
cpSync(resolve(srcDir, 'popup.html'), resolve(distDir, 'popup.html'), copyOpts);
cpSync(resolve(srcDir, 'popup.css'), resolve(distDir, 'popup.css'), copyOpts);
cpSync(resolve(srcDir, 'offscreen.html'), resolve(distDir, 'offscreen.html'), copyOpts);
cpSync(resolve(srcDir, 'record.html'), resolve(distDir, 'record.html'), copyOpts);
cpSync(resolve(srcDir, 'icons'), resolve(distDir, 'icons'), { ...copyOpts, recursive: true });

console.log('Build complete: dist/');
