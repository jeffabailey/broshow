// scripts/cws-adapter.effect.mjs
//
// EFFECT module: Chrome Web Store API I/O.
// Implements the driven-port signatures defined in
// design/architecture-design.md section 6.
//
// Returns Result-shaped values:
//   { ok: true, value: T }  |  { ok: false, error: { code, message } }
//
// Throws are reserved for unrecoverable bugs; orchestrator's outer
// try/catch converts those to PublishOutcome failures.

import { promises as fsp } from 'node:fs';

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CWS_BASE = 'https://www.googleapis.com/chromewebstore/v1.1';
const CWS_UPLOAD_BASE = 'https://www.googleapis.com/upload/chromewebstore/v1.1';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const resolveFetch = (deps) => {
  const fn = (deps && deps.fetch) || globalThis.fetch;
  if (typeof fn !== 'function') {
    throw new Error('cws-adapter: no fetch available (pass deps.fetch or run on Node 18+)');
  }
  return fn;
};

const safeJson = async (response) => {
  try {
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
};

const classifyHttp = (status, body) => {
  if (status === 401 || status === 403) return 'auth_expired';
  if (status === 429) return 'rate_limited';
  if (status === 413) return 'payload_too_large';
  if (status === 404) return 'item_not_found';
  if (status >= 500 && status <= 599) return 'upstream_api_down';
  if (body && typeof body.error === 'object' && body.error.code === 429) return 'rate_limited';
  if (body && body.error === 'invalid_grant') return 'auth_expired';
  return 'unknown_http';
};

const errorMessage = (status, body) => {
  if (body && body.error_description) return body.error_description;
  if (body && body.error && typeof body.error === 'object' && body.error.message) {
    return body.error.message;
  }
  if (body && typeof body.error === 'string') return body.error;
  return `HTTP ${status}`;
};

// ---------------------------------------------------------------------------
// exchangeCwsRefreshToken
// ---------------------------------------------------------------------------

/**
 * @param {{clientId: string, clientSecret: string, refreshToken: string, extensionId: string}} creds
 * @param {{ fetch?: typeof fetch }} [deps]
 */
export async function exchangeCwsRefreshToken(creds, deps) {
  const fetchFn = resolveFetch(deps);
  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    refresh_token: creds.refreshToken,
    grant_type: 'refresh_token',
  });
  const response = await fetchFn(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = await safeJson(response);
  if (response.status === 200 && json.access_token) {
    return { ok: true, value: { accessToken: json.access_token, expiresIn: json.expires_in } };
  }
  return {
    ok: false,
    error: {
      code: classifyHttp(response.status, json),
      message: errorMessage(response.status, json),
    },
  };
}

// ---------------------------------------------------------------------------
// probeCwsItemState
// ---------------------------------------------------------------------------

/**
 * @param {{extensionId: string}} creds
 * @param {string} accessToken
 * @param {{ fetch?: typeof fetch }} [deps]
 */
export async function probeCwsItemState(creds, accessToken, deps) {
  const fetchFn = resolveFetch(deps);
  const url = `${CWS_BASE}/items/${creds.extensionId}?projection=DRAFT`;
  const response = await fetchFn(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}`, 'x-goog-api-version': '2' },
  });
  const json = await safeJson(response);
  if (response.status === 200) {
    return {
      ok: true,
      value: {
        itemId: creds.extensionId,
        uploadState: typeof json.uploadState === 'string' ? json.uploadState : 'UNKNOWN',
        draftVersion: typeof json.draftVersion === 'string' ? json.draftVersion : null,
        publishedVersion: typeof json.publishedVersion === 'string' ? json.publishedVersion : null,
      },
    };
  }
  return {
    ok: false,
    error: { code: classifyHttp(response.status, json), message: errorMessage(response.status, json) },
  };
}

// ---------------------------------------------------------------------------
// uploadCwsItem
// ---------------------------------------------------------------------------

/**
 * @param {{extensionId: string}} creds
 * @param {string} accessToken
 * @param {string} zipPath
 * @param {{ fetch?: typeof fetch }} [deps]
 */
export async function uploadCwsItem(creds, accessToken, zipPath, deps) {
  const fetchFn = resolveFetch(deps);
  const url = `${CWS_UPLOAD_BASE}/items/${creds.extensionId}`;
  const zipBytes = await fsp.readFile(zipPath);
  const response = await fetchFn(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'x-goog-api-version': '2' },
    body: zipBytes,
  });
  const json = await safeJson(response);
  if (response.status === 200 && json.uploadState === 'SUCCESS') {
    return { ok: true, value: { uploadState: json.uploadState } };
  }
  if (response.status === 200 && json.uploadState && json.uploadState !== 'SUCCESS') {
    const itemErrors = Array.isArray(json.itemError) ? json.itemError : [];
    const code = itemErrors.find((e) => e && e.error_code === 'VERSION_ALREADY_EXISTS')
      ? 'version_conflict'
      : 'unknown_http';
    const detail = itemErrors.map((e) => e.error_detail || e.error_code).filter(Boolean).join('; ')
      || `uploadState=${json.uploadState}`;
    return { ok: false, error: { code, message: detail } };
  }
  return {
    ok: false,
    error: { code: classifyHttp(response.status, json), message: errorMessage(response.status, json) },
  };
}

// ---------------------------------------------------------------------------
// publishCwsItem
// ---------------------------------------------------------------------------

/**
 * @param {{extensionId: string}} creds
 * @param {string} accessToken
 * @param {'default'|'trustedTesters'} target
 * @param {{ fetch?: typeof fetch }} [deps]
 */
export async function publishCwsItem(creds, accessToken, target, deps) {
  const fetchFn = resolveFetch(deps);
  const url = `${CWS_BASE}/items/${creds.extensionId}/publish?publishTarget=${encodeURIComponent(target)}`;
  const response = await fetchFn(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-goog-api-version': '2',
      'Content-Length': '0',
    },
  });
  const json = await safeJson(response);
  if (response.status === 200) {
    return { ok: true, value: { status: Array.isArray(json.status) ? json.status : [] } };
  }
  return {
    ok: false,
    error: { code: classifyHttp(response.status, json), message: errorMessage(response.status, json) },
  };
}
