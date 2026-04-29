import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, sep } from 'path';
import { validateExtension } from '../../scripts/validate-extension.mjs';
import { patchManifestForFirefox } from '../../scripts/patch-firefox-manifest.mjs';

const root = resolve(__dirname, '../..');
const distDir = resolve(root, 'dist');
let firefoxDistDir: string;

const writeManifest = (dir: string, manifest: unknown): void => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
};

const tmp = (prefix: string): string => mkdtempSync(`${tmpdir()}${sep}${prefix}-`);

describe('Extension validation', () => {
  beforeAll(() => {
    execSync('npm run build', { cwd: root, stdio: 'pipe' });
    firefoxDistDir = tmp('broshow-firefox-validate');
    cpSync(distDir, firefoxDistDir, { recursive: true });
    const manifestPath = resolve(firefoxDistDir, 'manifest.json');
    const patched = patchManifestForFirefox(JSON.parse(readFileSync(manifestPath, 'utf8')));
    writeFileSync(manifestPath, JSON.stringify(patched, null, 2) + '\n');
  }, 60_000);

  describe('built bundles', () => {
    it('chrome dist passes validation', () => {
      const result = validateExtension(distDir, { target: 'chrome' });
      expect(result).toEqual({ ok: true, errors: [], warnings: [] });
    });

    it('firefox dist passes validation', () => {
      const result = validateExtension(firefoxDistDir, { target: 'firefox' });
      expect(result).toEqual({ ok: true, errors: [], warnings: [] });
    });
  });

  describe('catches manifest defects', () => {
    it('reports missing manifest.json', () => {
      const dir = tmp('no-manifest');
      const result = validateExtension(dir, { target: 'chrome' });
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toMatch(/manifest\.json not found/);
    });

    it('reports invalid JSON', () => {
      const dir = tmp('bad-json');
      mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(dir, 'manifest.json'), '{ not valid json');
      const result = validateExtension(dir, { target: 'chrome' });
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toMatch(/not valid JSON/);
    });

    it('reports wrong manifest_version', () => {
      const dir = tmp('mv2');
      writeManifest(dir, { manifest_version: 2, name: 'x', version: '1.0' });
      const result = validateExtension(dir, { target: 'chrome' });
      expect(result.ok).toBe(false);
      expect(result.errors).toContain('manifest_version must be 3 (got 2)');
    });

    it('reports missing required top-level fields', () => {
      const dir = tmp('missing-fields');
      writeManifest(dir, { manifest_version: 3 });
      const result = validateExtension(dir, { target: 'chrome' });
      expect(result.ok).toBe(false);
      expect(result.errors).toContain('manifest missing required field: name');
      expect(result.errors).toContain('manifest missing required field: version');
    });

    it('reports a malformed version string', () => {
      const dir = tmp('bad-version');
      writeManifest(dir, { manifest_version: 3, name: 'x', version: 'v1.0-beta' });
      const result = validateExtension(dir, { target: 'chrome' });
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes('version must be'))).toBe(true);
    });

    it('reports manifest references to missing files', () => {
      const dir = tmp('missing-refs');
      writeManifest(dir, {
        manifest_version: 3,
        name: 'x',
        version: '1.0.0',
        background: { service_worker: 'background.js' },
        action: { default_popup: 'popup.html' },
      });
      const result = validateExtension(dir, { target: 'chrome' });
      expect(result.ok).toBe(false);
      expect(result.errors).toContain('manifest references missing file: background.js');
      expect(result.errors).toContain('manifest references missing file: popup.html');
    });
  });

  describe('catches firefox-specific defects', () => {
    it('flags missing gecko.id', () => {
      const dir = tmp('no-gecko');
      writeManifest(dir, {
        manifest_version: 3,
        name: 'x',
        version: '1.0.0',
        background: { service_worker: 'sw.js', scripts: ['sw.js'] },
      });
      writeFileSync(resolve(dir, 'sw.js'), '');
      const result = validateExtension(dir, { target: 'firefox' });
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes('gecko.id'))).toBe(true);
    });

    it('flags missing background.scripts fallback', () => {
      const dir = tmp('no-scripts');
      writeManifest(dir, {
        manifest_version: 3,
        name: 'x',
        version: '1.0.0',
        background: { service_worker: 'sw.js' },
        browser_specific_settings: {
          gecko: { id: 'x@y.com', data_collection_permissions: { required: ['none'] } },
        },
      });
      writeFileSync(resolve(dir, 'sw.js'), '');
      const result = validateExtension(dir, { target: 'firefox' });
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes('background.scripts fallback'))).toBe(true);
    });

    it('flags missing data_collection_permissions (AMO upload rejects without it)', () => {
      const dir = tmp('no-dcp');
      writeManifest(dir, {
        manifest_version: 3,
        name: 'x',
        version: '1.0.0',
        background: { service_worker: 'sw.js', scripts: ['sw.js'] },
        browser_specific_settings: { gecko: { id: 'x@y.com' } },
      });
      writeFileSync(resolve(dir, 'sw.js'), '');
      const result = validateExtension(dir, { target: 'firefox' });
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes('data_collection_permissions'))).toBe(true);
    });

    it('does not flag firefox-specific issues for chrome target', () => {
      const dir = tmp('chrome-no-gecko');
      writeManifest(dir, {
        manifest_version: 3,
        name: 'x',
        version: '1.0.0',
        background: { service_worker: 'sw.js' },
      });
      writeFileSync(resolve(dir, 'sw.js'), '');
      const result = validateExtension(dir, { target: 'chrome' });
      expect(result.ok).toBe(true);
    });
  });
});
