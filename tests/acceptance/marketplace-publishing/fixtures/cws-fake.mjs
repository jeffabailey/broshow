// tests/acceptance/marketplace-publishing/fixtures/cws-fake.mjs
//
// Minimal fake CWS server: an in-process fetch interceptor.
// Records every call (in `state`) so tests can assert on observable
// side-effects on the marketplace. Returns canned responses keyed by
// (method + URL pattern). Uses no network; uses no Docker.
//
// Used by walking-skeleton + milestone-1 + milestone-4 + milestone-5
// scenarios per the @in-memory tag.

/**
 * @typedef {Object} CwsFakeState
 * @property {string[]} oauthCalls
 * @property {string[]} probeCalls
 * @property {{ extensionId: string, zipPath: string }[]} uploadCalls
 * @property {{ extensionId: string, target: string }[]} publishCalls
 * @property {Set<string>} publishedVersions
 * @property {string|null} draftVersion
 * @property {Object} responses  // overrides per endpoint
 */

/**
 * @returns {CwsFakeState}
 */
export function createCwsFakeState() {
  return {
    oauthCalls: [],
    probeCalls: [],
    uploadCalls: [],
    publishCalls: [],
    publishedVersions: new Set(),
    draftVersion: null,
    responses: {
      // Defaults are happy-path; tests override with `state.responses.X = {...}`.
      oauth: { ok: true, status: 200, body: { access_token: 'fake-cws-access-token-XYZ', expires_in: 3600 } },
      probe: { ok: true, status: 200, body: { uploadState: 'SUCCESS', itemError: [] } },
      upload: { ok: true, status: 200, body: { uploadState: 'SUCCESS' } },
      publish: { ok: true, status: 200, body: { status: ['OK'] } }
    }
  };
}

/**
 * Returns a fetch-shaped function that consults `state` to decide responses.
 * Pass to `vi.stubGlobal('fetch', cwsFakeFetch(state))`.
 *
 * @param {CwsFakeState} state
 * @returns {typeof fetch}
 */
export function cwsFakeFetch(state) {
  return async function fakeFetch(input, init) {
    const url = typeof input === 'string' ? input : input.url;
    const method = (init && init.method) || (typeof input === 'object' && input.method) || 'GET';

    // Google OAuth token endpoint
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      state.oauthCalls.push(`${method} ${url}`);
      return makeResponse(state.responses.oauth);
    }

    // CWS probe: GET /chromewebstore/v1.1/items/{id}
    if (url.includes('/chromewebstore/v1.1/items/') && !url.includes('/publish') && method === 'GET') {
      state.probeCalls.push(`GET ${url}`);
      const r = state.responses.probe;
      if (r.ok && state.draftVersion) {
        return makeResponse({ ...r, body: { ...r.body, draftVersion: state.draftVersion } });
      }
      return makeResponse(r);
    }

    // CWS upload: PUT /upload/chromewebstore/v1.1/items/{id}
    if (url.includes('/upload/chromewebstore/v1.1/items/') && method === 'PUT') {
      const m = url.match(/items\/([^/?]+)/);
      const extensionId = m ? m[1] : 'unknown';
      state.uploadCalls.push({ extensionId, zipPath: 'streamed' });
      return makeResponse(state.responses.upload);
    }

    // CWS publish: POST /chromewebstore/v1.1/items/{id}/publish[?publishTarget=...]
    if (url.includes('/chromewebstore/v1.1/items/') && /\/publish(\?|$)/.test(url) && method === 'POST') {
      const m = url.match(/items\/([^/?]+)\/publish/);
      const extensionId = m ? m[1] : 'unknown';
      const target = url.includes('publishTarget=trustedTesters') ? 'trustedTesters' : 'default';
      state.publishCalls.push({ extensionId, target });
      return makeResponse(state.responses.publish);
    }

    // Anything else: not handled by CWS fake
    throw new Error(`cws-fake: no handler for ${method} ${url}`);
  };
}

/**
 * @param {{ ok: boolean, status: number, body: any, headers?: Record<string,string> }} r
 * @returns {Response}
 */
function makeResponse(r) {
  return new Response(JSON.stringify(r.body), {
    status: r.status,
    headers: { 'Content-Type': 'application/json', ...(r.headers || {}) }
  });
}

/**
 * Helpers to set common scenario states.
 */
export const cwsFakeHelpers = {
  /** Refresh token has been revoked (AC-3-4 / AC-4-1). */
  setStaleToken(state) {
    state.responses.oauth = {
      ok: false,
      status: 400,
      body: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }
    };
  },

  /** Upload returns 429 quota-exceeded. */
  setUploadRateLimited(state) {
    state.responses.upload = {
      ok: false,
      status: 429,
      body: {
        error: {
          code: 429,
          message: "Quota exceeded for quota metric 'Upload requests' and limit 'Upload requests per minute per project'"
        }
      }
    };
  },

  /** Mark a version as already published (probe will reflect it). */
  setVersionAlreadyPublished(state, version) {
    state.publishedVersions.add(version);
    state.responses.probe = {
      ok: true,
      status: 200,
      body: { uploadState: 'SUCCESS', publishedVersion: version, itemError: [] }
    };
  }
};
