// tests/unit/marketplace-publishing/cws-adapter.test.mjs
//
// EFFECT module unit tests with a fake fetch (the adapter's only I/O surface).
// Verifies request shape, Result classification, and known-error code mapping.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  exchangeCwsRefreshToken,
  probeCwsItemState,
  uploadCwsItem,
  publishCwsItem,
} from '../../../scripts/cws-adapter.effect.mjs';
import { promises as fsp } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const VALID_CREDS = Object.freeze({
  clientId: 'fake-client-id-aaaaaaaaaaaa.apps.googleusercontent.com',
  clientSecret: 'fake-client-secret-redacted',
  refreshToken: '1//09fake-refresh-token-redacted',
  extensionId: 'abcdefghijklmnopqrstuvwxyz123456',
});

const makeJsonResponse = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

const recordingFetch = (handler) => {
  const calls = [];
  const fn = async (input, init) => {
    calls.push({ url: typeof input === 'string' ? input : input.url, init });
    return handler(input, init);
  };
  fn.calls = calls;
  return fn;
};

describe('cws-adapter.effect :: exchangeCwsRefreshToken', () => {
  it('returns ok with accessToken on 200', async () => {
    const fakeFetch = recordingFetch(() =>
      makeJsonResponse({ access_token: 'tok-XYZ', expires_in: 3600 }));
    const result = await exchangeCwsRefreshToken(VALID_CREDS, { fetch: fakeFetch });
    expect(result.ok).toBe(true);
    expect(result.value.accessToken).toBe('tok-XYZ');
    expect(result.value.expiresIn).toBe(3600);
  });

  it('classifies invalid_grant as auth_expired', async () => {
    const fakeFetch = recordingFetch(() =>
      makeJsonResponse({ error: 'invalid_grant', error_description: 'revoked' }, 400));
    const result = await exchangeCwsRefreshToken(VALID_CREDS, { fetch: fakeFetch });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('auth_expired');
  });

  it('classifies 5xx as upstream_api_down', async () => {
    const fakeFetch = recordingFetch(() => makeJsonResponse({ error: 'server' }, 503));
    const result = await exchangeCwsRefreshToken(VALID_CREDS, { fetch: fakeFetch });
    expect(result.ok).toBe(false);
    expect(['upstream_api_down', 'unknown_http']).toContain(result.error.code);
  });

  it('POSTs to oauth2.googleapis.com/token with refresh_token grant', async () => {
    const fakeFetch = recordingFetch(() =>
      makeJsonResponse({ access_token: 't', expires_in: 1 }));
    await exchangeCwsRefreshToken(VALID_CREDS, { fetch: fakeFetch });
    expect(fakeFetch.calls).toHaveLength(1);
    expect(fakeFetch.calls[0].url).toContain('oauth2.googleapis.com/token');
    expect(fakeFetch.calls[0].init.method).toBe('POST');
    const body = String(fakeFetch.calls[0].init.body);
    expect(body).toContain('grant_type=refresh_token');
    expect(body).toContain(`client_id=${encodeURIComponent(VALID_CREDS.clientId)}`);
    expect(body).toContain(`refresh_token=${encodeURIComponent(VALID_CREDS.refreshToken)}`);
  });
});

describe('cws-adapter.effect :: probeCwsItemState', () => {
  it('returns ok with normalized state on 200', async () => {
    const fakeFetch = recordingFetch(() =>
      makeJsonResponse({ uploadState: 'SUCCESS', publishedVersion: '0.3.0', itemError: [] }));
    const result = await probeCwsItemState(VALID_CREDS, 'access-token', { fetch: fakeFetch });
    expect(result.ok).toBe(true);
    expect(result.value.itemId).toBe(VALID_CREDS.extensionId);
    expect(result.value.uploadState).toBe('SUCCESS');
    expect(result.value.publishedVersion).toBe('0.3.0');
  });

  it('GETs the items endpoint with extensionId and Authorization', async () => {
    const fakeFetch = recordingFetch(() =>
      makeJsonResponse({ uploadState: 'SUCCESS', itemError: [] }));
    await probeCwsItemState(VALID_CREDS, 'access-token', { fetch: fakeFetch });
    const call = fakeFetch.calls[0];
    expect(call.url).toContain(`/chromewebstore/v1.1/items/${VALID_CREDS.extensionId}`);
    expect(call.init.headers.Authorization).toBe('Bearer access-token');
  });

  it('classifies 401 as auth_expired', async () => {
    const fakeFetch = recordingFetch(() => makeJsonResponse({ error: 'unauthorized' }, 401));
    const result = await probeCwsItemState(VALID_CREDS, 'tok', { fetch: fakeFetch });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('auth_expired');
  });

  it('classifies 429 as rate_limited', async () => {
    const fakeFetch = recordingFetch(() => makeJsonResponse({}, 429));
    const result = await probeCwsItemState(VALID_CREDS, 'tok', { fetch: fakeFetch });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('rate_limited');
  });
});

describe('cws-adapter.effect :: uploadCwsItem', () => {
  let tmpDir;
  let zipPath;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'broshow-cws-up-'));
    zipPath = path.join(tmpDir, 'broshow.zip');
    await fsp.writeFile(zipPath, Buffer.from('PK\x03\x04fake-zip-payload'));
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it('PUTs the zip to upload endpoint and returns ok on SUCCESS uploadState', async () => {
    const fakeFetch = recordingFetch(() => makeJsonResponse({ uploadState: 'SUCCESS' }));
    const result = await uploadCwsItem(VALID_CREDS, 'tok', zipPath, { fetch: fakeFetch });
    expect(result.ok).toBe(true);
    expect(result.value.uploadState).toBe('SUCCESS');
    expect(fakeFetch.calls[0].url).toContain(`/upload/chromewebstore/v1.1/items/${VALID_CREDS.extensionId}`);
    expect(fakeFetch.calls[0].init.method).toBe('PUT');
    expect(fakeFetch.calls[0].init.headers.Authorization).toBe('Bearer tok');
  });

  it('classifies 429 quota-exceeded as rate_limited', async () => {
    const fakeFetch = recordingFetch(() => makeJsonResponse({
      error: { code: 429, message: "Quota exceeded for quota metric 'Upload requests'" }
    }, 429));
    const result = await uploadCwsItem(VALID_CREDS, 'tok', zipPath, { fetch: fakeFetch });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('rate_limited');
  });

  it('classifies 413 as payload_too_large', async () => {
    const fakeFetch = recordingFetch(() => makeJsonResponse({ error: 'too big' }, 413));
    const result = await uploadCwsItem(VALID_CREDS, 'tok', zipPath, { fetch: fakeFetch });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('payload_too_large');
  });

  it('classifies FAILURE uploadState body even on 200 as failure', async () => {
    const fakeFetch = recordingFetch(() => makeJsonResponse({
      uploadState: 'FAILURE',
      itemError: [{ error_code: 'ITEM_NOT_UPDATABLE', error_detail: 'pending review' }]
    }));
    const result = await uploadCwsItem(VALID_CREDS, 'tok', zipPath, { fetch: fakeFetch });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBeDefined();
  });
});

describe('cws-adapter.effect :: publishCwsItem', () => {
  it('POSTs publish endpoint with publishTarget=default by default', async () => {
    const fakeFetch = recordingFetch(() => makeJsonResponse({ status: ['OK'] }));
    const result = await publishCwsItem(VALID_CREDS, 'tok', 'default', { fetch: fakeFetch });
    expect(result.ok).toBe(true);
    expect(fakeFetch.calls[0].url).toContain('/publish');
    expect(fakeFetch.calls[0].url).toContain('publishTarget=default');
    expect(fakeFetch.calls[0].init.method).toBe('POST');
  });

  it('POSTs with publishTarget=trustedTesters when target=trustedTesters', async () => {
    const fakeFetch = recordingFetch(() => makeJsonResponse({ status: ['OK'] }));
    await publishCwsItem(VALID_CREDS, 'tok', 'trustedTesters', { fetch: fakeFetch });
    expect(fakeFetch.calls[0].url).toContain('publishTarget=trustedTesters');
  });

  it('classifies 401 as auth_expired', async () => {
    const fakeFetch = recordingFetch(() => makeJsonResponse({}, 401));
    const result = await publishCwsItem(VALID_CREDS, 'tok', 'default', { fetch: fakeFetch });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('auth_expired');
  });
});

