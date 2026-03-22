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
  ],
  bundle: true,
  outdir: distDir,
  format: 'esm',
  target: 'chrome120',
  minify: false,
  sourcemap: true,
});

// Copy static assets from src/ to dist/
cpSync(resolve(srcDir, 'manifest.json'), resolve(distDir, 'manifest.json'));
cpSync(resolve(srcDir, 'popup.html'), resolve(distDir, 'popup.html'));
cpSync(resolve(srcDir, 'offscreen.html'), resolve(distDir, 'offscreen.html'));

console.log('Build complete: dist/');
