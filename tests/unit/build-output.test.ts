import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

const distDir = resolve(__dirname, '../../dist');
const readJsonFile = (filePath: string): unknown =>
  JSON.parse(readFileSync(filePath, 'utf-8'));

describe('Build output validation', () => {
  beforeAll(() => {
    execSync('npm run build', {
      cwd: resolve(__dirname, '../..'),
      stdio: 'pipe',
    });
  });

  it('produces a dist directory with manifest.json', () => {
    const manifestPath = resolve(distDir, 'manifest.json');
    expect(existsSync(manifestPath)).toBe(true);
  });

  it('manifest declares manifest_version 3', () => {
    const manifest = readJsonFile(resolve(distDir, 'manifest.json')) as Record<string, unknown>;
    expect(manifest['manifest_version']).toBe(3);
  });

  it('manifest declares offscreen and downloads permissions', () => {
    const manifest = readJsonFile(resolve(distDir, 'manifest.json')) as Record<string, unknown>;
    const permissions = manifest['permissions'] as string[];
    expect(permissions).toContain('tabCapture');
    expect(permissions).toContain('offscreen');
    expect(permissions).toContain('downloads');
  });

  it('manifest declares a service worker background script', () => {
    const manifest = readJsonFile(resolve(distDir, 'manifest.json')) as Record<string, unknown>;
    const background = manifest['background'] as Record<string, unknown>;
    expect(background['service_worker']).toBe('background.js');
  });

  it('manifest declares a popup action', () => {
    const manifest = readJsonFile(resolve(distDir, 'manifest.json')) as Record<string, unknown>;
    const action = manifest['action'] as Record<string, unknown>;
    expect(action['default_popup']).toBe('popup.html');
  });

  it('produces bundled JS files for all entry points', () => {
    expect(existsSync(resolve(distDir, 'popup.js'))).toBe(true);
    expect(existsSync(resolve(distDir, 'background.js'))).toBe(true);
    expect(existsSync(resolve(distDir, 'offscreen.js'))).toBe(true);
  });

  it('produces HTML files for popup and offscreen', () => {
    expect(existsSync(resolve(distDir, 'popup.html'))).toBe(true);
    expect(existsSync(resolve(distDir, 'offscreen.html'))).toBe(true);
  });
});
