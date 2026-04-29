import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, sep } from 'path';
import { patchManifestForFirefox } from '../../scripts/patch-firefox-manifest.mjs';

const root = resolve(__dirname, '../..');
const distDir = resolve(root, 'dist');
let firefoxDistDir: string;

const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path, 'utf8'));

const runLint = (cwd: string): { errors: number; warnings: number } => {
  let stdout: string;
  try {
    stdout = execSync('npx web-ext lint --output json', {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (e) {
    const err = e as { stdout?: string | Buffer };
    stdout = typeof err.stdout === 'string' ? err.stdout : err.stdout?.toString('utf8') ?? '';
  }
  const report = JSON.parse(stdout) as { summary: { errors: number; warnings: number } };
  return report.summary;
};

describe('Release bundle install validation', () => {
  beforeAll(() => {
    execSync('npm run build', { cwd: root, stdio: 'pipe' });
    firefoxDistDir = mkdtempSync(`${tmpdir()}${sep}broshow-firefox-`);
    cpSync(distDir, firefoxDistDir, { recursive: true });
    const manifestPath = resolve(firefoxDistDir, 'manifest.json');
    const patched = patchManifestForFirefox(readJson(manifestPath));
    writeFileSync(manifestPath, JSON.stringify(patched, null, 2) + '\n');
  }, 60_000);

  describe('Chrome bundle', () => {
    it('manifest declares MV3', () => {
      expect(readJson(resolve(distDir, 'manifest.json')).manifest_version).toBe(3);
    });

    it('background declares a service worker', () => {
      const m = readJson(resolve(distDir, 'manifest.json'));
      const bg = m.background as Record<string, unknown>;
      expect(bg.service_worker).toBe('background.js');
    });

    it('manifest version follows semver so the release tag check can match', () => {
      expect(readJson(resolve(distDir, 'manifest.json')).version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('Firefox bundle', () => {
    it('manifest has browser_specific_settings.gecko.id (without it Firefox reports the xpi as corrupt)', () => {
      const m = readJson(resolve(firefoxDistDir, 'manifest.json'));
      const bss = m.browser_specific_settings as Record<string, unknown>;
      const gecko = bss?.gecko as Record<string, unknown>;
      expect(gecko?.id).toBeTruthy();
    });

    it('background includes a scripts fallback alongside service_worker (Firefox MV3 install requirement)', () => {
      const m = readJson(resolve(firefoxDistDir, 'manifest.json'));
      const bg = m.background as Record<string, unknown>;
      expect(bg.scripts).toEqual(expect.arrayContaining(['background.js']));
      expect(bg.service_worker).toBe('background.js');
    });

    it('passes web-ext lint with zero errors', () => {
      const summary = runLint(firefoxDistDir);
      expect(summary.errors).toBe(0);
    }, 60_000);
  });
});
