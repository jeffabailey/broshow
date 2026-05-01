// tests/acceptance/marketplace-publishing/fixtures/scenarios.mjs
//
// Environment-state setup helpers matching `devops/environments.yaml`.
// Each `loadEnv(name)` returns an object with: cwsState, amoState, env (process.env-shaped).
//
// Pair with vi.stubGlobal('fetch', ...) and vi.spyOn(child_process, 'spawn', ...).

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';

import { createCwsFakeState, cwsFakeHelpers, cwsFakeFetch } from './cws-fake.mjs';
import { createAmoFakeState, amoFakeHelpers, amoFakeFetch, amoFakeSpawn, combineFakeFetches } from './amo-fake.mjs';

/**
 * @typedef {Object} ScenarioContext
 * @property {string} tmpDir
 * @property {string} manifestPath  // dist/manifest.json equivalent
 * @property {string} chromeZipPath
 * @property {string} firefoxXpiPath
 * @property {string} summaryPath
 * @property {Object} cwsState
 * @property {Object} amoState
 * @property {Record<string,string>} env
 * @property {() => Promise<void>} cleanup
 */

const VALID_CWS = {
  CWS_CLIENT_ID: 'fake-client-id-aaaaaaaaaaaa.apps.googleusercontent.com',
  CWS_CLIENT_SECRET: 'fake-client-secret-redacted',
  CWS_REFRESH_TOKEN: '1//09fake-refresh-token-redacted',
  CWS_EXTENSION_ID: 'abcdefghijklmnopqrstuvwxyz123456'
};

const VALID_AMO = {
  AMO_JWT_ISSUER: 'user:1234567:1',
  AMO_JWT_SECRET: 'fake-amo-jwt-secret-redacted'
};

/**
 * Creates a tmpdir with a fake dist/ layout: manifest.json + zip + xpi.
 * @param {string} version
 * @returns {Promise<{ tmpDir: string, manifestPath: string, chromeZipPath: string, firefoxXpiPath: string, summaryPath: string }>}
 */
export async function setupArtifacts(version) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'broshow-distill-'));
  const manifestPath = path.join(tmpDir, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify({
    manifest_version: 3,
    name: 'BroShow',
    version,
    description: 'Browser tab recorder'
  }, null, 2));
  const chromeZipPath = path.join(tmpDir, `broshow-chrome-${version}.zip`);
  // Minimal valid-ish "zip" file so fileExists() and fileSize() return true/non-zero.
  await fs.writeFile(chromeZipPath, Buffer.from('PK\x03\x04fake-zip-payload'));
  const firefoxXpiPath = path.join(tmpDir, `broshow-firefox-${version}.xpi`);
  await fs.writeFile(firefoxXpiPath, Buffer.from('PK\x03\x04fake-xpi-payload'));
  const summaryPath = path.join(tmpDir, 'step-summary.md');
  return { tmpDir, manifestPath, chromeZipPath, firefoxXpiPath, summaryPath };
}

/**
 * @param {string} dir
 * @returns {Promise<void>}
 */
export async function cleanupTmpDir(dir) {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

/**
 * Load a named environment from environments.yaml.
 *
 * @param {'clean'|'with-amo-throttle-active'|'with-cws-rate-limit-active'|'with-stale-cws-token-near-expiry'} name
 * @param {{ version?: string, targets?: string, mode?: string, cwsPublish?: string }} [overrides]
 * @returns {Promise<ScenarioContext>}
 */
export async function loadEnv(name, overrides = {}) {
  const version = overrides.version || '0.3.0';
  const targets = overrides.targets || 'cws,amo-listed';
  const mode = overrides.mode || 'publish';
  const cwsPublish = overrides.cwsPublish || 'default';

  const { tmpDir, manifestPath, chromeZipPath, firefoxXpiPath, summaryPath } =
    await setupArtifacts(version);

  const cwsState = createCwsFakeState();
  const amoState = createAmoFakeState();

  // Apply environment-specific configuration.
  switch (name) {
    case 'clean':
      // defaults are happy-path
      break;
    case 'with-amo-throttle-active':
      amoFakeHelpers.setProbeRateLimited(amoState);
      break;
    case 'with-cws-rate-limit-active':
      cwsFakeHelpers.setUploadRateLimited(cwsState);
      break;
    case 'with-stale-cws-token-near-expiry':
      cwsFakeHelpers.setStaleToken(cwsState);
      break;
    default:
      throw new Error(`loadEnv: unknown environment "${name}"`);
  }

  const env = {
    TARGETS: targets,
    MODE: mode,
    CWS_PUBLISH: cwsPublish,
    TAG: `v${version}`,
    MANIFEST_PATH: manifestPath,
    ARTIFACT_DIR: tmpDir,
    SUMMARY_PATH: summaryPath,
    ...VALID_CWS,
    ...VALID_AMO
  };

  // Build the deps object that DELIVER's orchestrator will accept as its
  // optional second argument. This is the dependency-injection seam described
  // in design/component-boundaries.md section 4.
  const fakeFetch = combineFakeFetches(cwsFakeFetch(cwsState), amoFakeFetch(amoState));
  const fakeSpawn = (cmd, args, opts) => {
    amoState.signCalls.push({ cmd, args, opts });
    return amoFakeSpawn(amoState);
  };
  const logBuffer = [];
  const deps = {
    fetch: fakeFetch,
    spawn: fakeSpawn,
    log: (...a) => logBuffer.push(a.map(String).join(' ')),
    logError: (...a) => logBuffer.push(a.map(String).join(' '))
  };

  return {
    tmpDir,
    manifestPath,
    chromeZipPath,
    firefoxXpiPath,
    summaryPath,
    cwsState,
    amoState,
    env,
    deps,
    logBuffer,
    async cleanup() {
      await cleanupTmpDir(tmpDir);
    }
  };
}

export const knownSecretValues = [
  VALID_CWS.CWS_CLIENT_SECRET,
  VALID_CWS.CWS_REFRESH_TOKEN,
  VALID_AMO.AMO_JWT_SECRET
];
