// tests/unit/marketplace-publishing/fs-adapter.test.mjs
//
// EFFECT module integration tests with real tmpdir filesystem.
// Per Mandate 6: every adapter has at least one real-I/O integration test.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  readManifestVersion,
  writeStepSummary,
  fileExists,
  fileSize,
} from '../../../scripts/fs-adapter.effect.mjs';

let tmpDir;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'broshow-fs-adapter-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('fs-adapter.effect :: readManifestVersion', () => {
  it('reads the version field from a JSON manifest', async () => {
    const manifestPath = path.join(tmpDir, 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify({ name: 'BroShow', version: '0.3.0' }));
    expect(await readManifestVersion(manifestPath)).toBe('0.3.0');
  });

  it('throws on a missing file', async () => {
    const missing = path.join(tmpDir, 'nope.json');
    await expect(readManifestVersion(missing)).rejects.toThrow();
  });

  it('throws on malformed JSON', async () => {
    const bad = path.join(tmpDir, 'bad.json');
    await fs.writeFile(bad, '{ not json');
    await expect(readManifestVersion(bad)).rejects.toThrow();
  });

  it('throws when version field is missing', async () => {
    const noVersion = path.join(tmpDir, 'noversion.json');
    await fs.writeFile(noVersion, JSON.stringify({ name: 'no-version' }));
    await expect(readManifestVersion(noVersion)).rejects.toThrow();
  });
});

describe('fs-adapter.effect :: writeStepSummary', () => {
  it('appends to the summary path passed as override', async () => {
    const summaryPath = path.join(tmpDir, 'summary.md');
    await writeStepSummary('## first\n', summaryPath);
    await writeStepSummary('## second\n', summaryPath);
    const content = await fs.readFile(summaryPath, 'utf-8');
    expect(content).toContain('## first');
    expect(content).toContain('## second');
  });

  it('creates the file if it does not exist', async () => {
    const summaryPath = path.join(tmpDir, 'fresh.md');
    await writeStepSummary('# hello\n', summaryPath);
    expect(await fileExists(summaryPath)).toBe(true);
  });

  it('uses GITHUB_STEP_SUMMARY env when no override provided', async () => {
    const summaryPath = path.join(tmpDir, 'github-summary.md');
    const originalEnv = process.env.GITHUB_STEP_SUMMARY;
    process.env.GITHUB_STEP_SUMMARY = summaryPath;
    try {
      await writeStepSummary('# fallback\n');
      const content = await fs.readFile(summaryPath, 'utf-8');
      expect(content).toContain('# fallback');
    } finally {
      if (originalEnv === undefined) delete process.env.GITHUB_STEP_SUMMARY;
      else process.env.GITHUB_STEP_SUMMARY = originalEnv;
    }
  });

  it('is a no-op when neither path nor env is set', async () => {
    const originalEnv = process.env.GITHUB_STEP_SUMMARY;
    delete process.env.GITHUB_STEP_SUMMARY;
    try {
      // Should not throw.
      await writeStepSummary('# nowhere\n');
    } finally {
      if (originalEnv !== undefined) process.env.GITHUB_STEP_SUMMARY = originalEnv;
    }
  });
});

describe('fs-adapter.effect :: fileExists', () => {
  it('returns true for an existing file', async () => {
    const file = path.join(tmpDir, 'present.txt');
    await fs.writeFile(file, 'content');
    expect(await fileExists(file)).toBe(true);
  });

  it('returns false for a missing file', async () => {
    expect(await fileExists(path.join(tmpDir, 'absent.txt'))).toBe(false);
  });
});

describe('fs-adapter.effect :: fileSize', () => {
  it('returns the byte size of an existing file', async () => {
    const file = path.join(tmpDir, 'sized.bin');
    const payload = Buffer.from('hello world');
    await fs.writeFile(file, payload);
    expect(await fileSize(file)).toBe(payload.length);
  });

  it('throws on a missing file', async () => {
    await expect(fileSize(path.join(tmpDir, 'missing.bin'))).rejects.toThrow();
  });
});
