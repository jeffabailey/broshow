// scripts/amo-listed-adapter.effect.mjs
//
// EFFECT module: AMO listed-channel I/O.
// - Probe via fetch (deterministic; mockable in tests).
// - Submission via spawn('web-ext', ['sign', '--channel', 'listed', ...])
//   per ADR-006.
//
// Returns Result-shaped values:
//   { ok: true, value: T }  |  { ok: false, error: { code, message } }
//
// Test seam: pass a `deps` second arg with `{ fetch, spawn }` to inject
// fakes; defaults are globalThis.fetch and node:child_process.spawn.

import { generateJwt } from './amo-jwt.pure.mjs';

const AMO_API_BASE = 'https://addons.mozilla.org/api/v5';
const WEB_EXT_BIN = 'web-ext';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const resolveFetch = (deps) => {
  const fn = (deps && deps.fetch) || globalThis.fetch;
  if (typeof fn !== 'function') {
    throw new Error('amo-listed-adapter: no fetch available (pass deps.fetch or run on Node 18+)');
  }
  return fn;
};

const resolveSpawn = async (deps) => {
  if (deps && typeof deps.spawn === 'function') return deps.spawn;
  const cp = await import('node:child_process');
  return cp.spawn;
};

const safeJson = async (response) => {
  try {
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
};

const classifyHttp = (status) => {
  if (status === 401 || status === 403) return 'auth_expired';
  if (status === 429) return 'rate_limited';
  if (status === 413) return 'payload_too_large';
  if (status >= 500 && status <= 599) return 'upstream_api_down';
  return 'unknown_http';
};

const httpErrorMessage = (status, body) => {
  if (body && typeof body.detail === 'string') return body.detail;
  if (body && typeof body.error === 'string') return body.error;
  return `HTTP ${status}`;
};

// ---------------------------------------------------------------------------
// probeAmoListedVersions
// ---------------------------------------------------------------------------

/**
 * Returns a Set of versions already on the AMO listed channel.
 * 404 (addon not yet on AMO) is normalized to ok: empty Set.
 *
 * @param {{ issuer: string, secret: string }} creds
 * @param {string} addonGuid
 * @param {{ fetch?: typeof fetch }} [deps]
 * @returns {Promise<{ ok: true, value: Set<string> } | { ok: false, error: { code: string, message: string } }>}
 */
export async function probeAmoListedVersions(creds, addonGuid, deps) {
  const fetchFn = resolveFetch(deps);
  const jwt = generateJwt(creds);
  const url =
    `${AMO_API_BASE}/addons/addon/${encodeURIComponent(addonGuid)}/versions/?page_size=100`;
  const response = await fetchFn(url, {
    method: 'GET',
    headers: { Authorization: `JWT ${jwt}` },
  });

  if (response.status === 404) {
    return { ok: true, value: new Set() };
  }

  const json = await safeJson(response);

  if (response.status === 200) {
    const results = Array.isArray(json.results) ? json.results : [];
    const listed = results
      .filter((versionEntry) => versionEntry && typeof versionEntry.version === 'string')
      .filter((versionEntry) => versionEntry.channel === undefined || versionEntry.channel === 'listed')
      .map((versionEntry) => versionEntry.version);
    return { ok: true, value: new Set(listed) };
  }

  return {
    ok: false,
    error: { code: classifyHttp(response.status), message: httpErrorMessage(response.status, json) },
  };
}

// ---------------------------------------------------------------------------
// submitAmoListed
// ---------------------------------------------------------------------------

const SUBMISSION_ID_RE = /Submission ID:\s*(\d+)/i;
const VERSION_CONFLICT_RE = /Version\s+\S+\s+already exists/i;
const VALIDATION_FAILED_RE = /validation (failed|error)/i;

const classifySignError = (stderr, stdout) => {
  const haystack = `${stderr || ''}\n${stdout || ''}`;
  if (VERSION_CONFLICT_RE.test(haystack)) return 'version_conflict';
  if (VALIDATION_FAILED_RE.test(haystack)) return 'validation_failed';
  return 'unknown_http';
};

const collectStream = (stream, sink) => {
  if (!stream || typeof stream.on !== 'function') return;
  stream.on('data', (chunk) => {
    sink.chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf-8'));
  });
};

const waitForExit = (child) =>
  new Promise((resolve, reject) => {
    let settled = false;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      resolve(code);
    };
    if (typeof child.on !== 'function') {
      reject(new Error('amo-listed-adapter: spawn did not return an event-emitting child'));
      return;
    }
    child.on('exit', (code) => finish(code ?? 0));
    child.on('close', (code) => finish(code ?? 0));
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
  });

/**
 * Spawns `web-ext sign --channel listed` with the JWT issuer/secret.
 * Returns ok with submissionId on exit code 0; otherwise classifies stderr.
 *
 * @param {{ issuer: string, secret: string }} creds
 * @param {string} xpiPath  path to either a built xpi or the source dir staged for signing
 * @param {string} version
 * @param {{ spawn?: Function, sourceDir?: string }} [deps]
 * @returns {Promise<{ ok: true, value: { submissionId: string|null, listingUrl: string } } | { ok: false, error: { code: string, message: string } }>}
 */
export async function submitAmoListed(creds, xpiPath, version, deps) {
  const spawnFn = await resolveSpawn(deps);

  const args = [
    'sign',
    '--channel',
    'listed',
    '--api-key',
    creds.issuer,
    '--api-secret',
    creds.secret,
    '--source-dir',
    (deps && deps.sourceDir) || xpiPath,
  ];

  const child = spawnFn(WEB_EXT_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });

  const stdoutSink = { chunks: [] };
  const stderrSink = { chunks: [] };
  collectStream(child.stdout, stdoutSink);
  collectStream(child.stderr, stderrSink);

  let exitCode;
  try {
    exitCode = await waitForExit(child);
  } catch (err) {
    return {
      ok: false,
      error: { code: 'unknown_http', message: err && err.message ? err.message : 'spawn error' },
    };
  }

  const stdout = stdoutSink.chunks.join('');
  const stderr = stderrSink.chunks.join('');

  if (exitCode === 0) {
    const match = stdout.match(SUBMISSION_ID_RE);
    const submissionId = match ? match[1] : null;
    return {
      ok: true,
      value: {
        submissionId,
        listingUrl: `https://addons.mozilla.org/en-US/firefox/addon/${version}/`,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: classifySignError(stderr, stdout),
      message: stderr.trim() || stdout.trim() || `web-ext sign exited ${exitCode}`,
    },
  };
}
