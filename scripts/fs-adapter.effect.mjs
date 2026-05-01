// scripts/fs-adapter.effect.mjs
//
// EFFECT module: filesystem seam. Single point where the orchestrator
// and tests both read/write filesystem state. Enables real-FS in
// acceptance tests (Strategy B) without monkey-patching node:fs globally.

import { promises as fsp, statSync } from 'node:fs';

/**
 * @param {string} manifestPath
 * @returns {Promise<string>} the manifest's `version` field
 */
export async function readManifestVersion(manifestPath) {
  const raw = await fsp.readFile(manifestPath, 'utf-8');
  const parsed = JSON.parse(raw);
  if (typeof parsed.version !== 'string' || parsed.version.length === 0) {
    throw new Error(`readManifestVersion: manifest at ${manifestPath} has no string version field`);
  }
  return parsed.version;
}

/**
 * Appends to $GITHUB_STEP_SUMMARY (or to summaryPath when provided as override).
 * No-op when neither override nor env is set.
 *
 * @param {string} markdown
 * @param {string} [summaryPath]
 * @returns {Promise<void>}
 */
export async function writeStepSummary(markdown, summaryPath) {
  const target = summaryPath ?? process.env.GITHUB_STEP_SUMMARY;
  if (!target) return;
  await fsp.appendFile(target, markdown, 'utf-8');
}

/**
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
export async function fileExists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} filePath
 * @returns {Promise<number>} byte size
 */
export async function fileSize(filePath) {
  const stats = await fsp.stat(filePath);
  return stats.size;
}
