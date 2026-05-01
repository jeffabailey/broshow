// tests/acceptance/marketplace-publishing/fixtures/amo-fake.mjs
//
// Minimal fake AMO server: an in-process fetch interceptor for the
// `/api/v5/addons/addon/{guid}/versions/` probe endpoint, plus a
// canned spawn() return value for `web-ext sign --channel listed`.
//
// Used by walking-skeleton + milestone-2 + milestone-4 + milestone-5
// scenarios per the @in-memory tag.

/**
 * @typedef {Object} AmoFakeState
 * @property {string[]} probeCalls
 * @property {{ xpiPath: string, version: string, channel: string }[]} signCalls
 * @property {Set<string>} listedVersions
 * @property {Object} responses
 */

/**
 * @returns {AmoFakeState}
 */
export function createAmoFakeState() {
  return {
    probeCalls: [],
    signCalls: [],
    listedVersions: new Set(),
    responses: {
      probe: { ok: true, status: 200, body: { count: 0, results: [] } },
      sign: {
        code: 0,
        stdout: 'Signed and submitted as 0.3.0\nSubmission ID: 1234567\n',
        stderr: ''
      }
    }
  };
}

/**
 * @param {AmoFakeState} state
 * @returns {typeof fetch}
 */
export function amoFakeFetch(state) {
  return async function fakeFetch(input, init) {
    const url = typeof input === 'string' ? input : input.url;
    const method = (init && init.method) || 'GET';

    if (url.includes('/api/v5/addons/addon/') && url.includes('/versions/')) {
      state.probeCalls.push(`${method} ${url}`);
      const r = state.responses.probe;
      if (r.ok && state.listedVersions.size > 0) {
        const results = [...state.listedVersions].map(v => ({ version: v, channel: 'listed' }));
        return makeResponse({ ...r, body: { count: results.length, results } });
      }
      return makeResponse(r);
    }

    throw new Error(`amo-fake: no handler for ${method} ${url}`);
  };
}

/**
 * Combines CWS and AMO fake fetch handlers. First match wins.
 * @param {Array<typeof fetch>} handlers
 * @returns {typeof fetch}
 */
export function combineFakeFetches(...handlers) {
  return async function combined(input, init) {
    let lastError;
    for (const h of handlers) {
      try {
        return await h(input, init);
      } catch (err) {
        if (err && err.message && err.message.startsWith && (err.message.includes('no handler'))) {
          lastError = err;
          continue;
        }
        throw err;
      }
    }
    if (lastError) throw lastError;
    throw new Error('combineFakeFetches: no handlers');
  };
}

/**
 * Builds a child_process.spawn return value mimicking `web-ext sign`.
 * Use with `vi.spyOn(child_process, 'spawn').mockReturnValue(amoFakeSpawn(state))`.
 *
 * @param {AmoFakeState} state
 */
export function amoFakeSpawn(state) {
  const { code, stdout, stderr } = state.responses.sign;
  return makeFakeChildProcess({ code, stdout, stderr });
}

function makeFakeChildProcess({ code, stdout, stderr }) {
  const handlers = { exit: [], close: [], error: [] };
  const stdoutHandlers = { data: [] };
  const stderrHandlers = { data: [] };

  const proc = {
    stdout: {
      on(event, cb) {
        if (event === 'data') stdoutHandlers.data.push(cb);
        return this;
      }
    },
    stderr: {
      on(event, cb) {
        if (event === 'data') stderrHandlers.data.push(cb);
        return this;
      }
    },
    on(event, cb) {
      if (handlers[event]) handlers[event].push(cb);
      return this;
    },
    once(event, cb) {
      return this.on(event, cb);
    },
    kill() {}
  };

  // Schedule deterministic firing of stdout, stderr, exit, close.
  setImmediate(() => {
    if (stdout) stdoutHandlers.data.forEach(h => h(Buffer.from(stdout)));
    if (stderr) stderrHandlers.data.forEach(h => h(Buffer.from(stderr)));
    handlers.exit.forEach(h => h(code));
    handlers.close.forEach(h => h(code));
  });

  return proc;
}

export const amoFakeHelpers = {
  /** Probe returns 429 throttled. */
  setProbeRateLimited(state) {
    state.responses.probe = {
      ok: false,
      status: 429,
      headers: { 'Retry-After': '3600' },
      body: { detail: 'Request was throttled. Expected available in 3600 seconds.' }
    };
  },

  /** Mark a listed version as already submitted. */
  setVersionAlreadyListed(state, version) {
    state.listedVersions.add(version);
  },

  /** web-ext sign exits non-zero indicating version conflict. */
  setSignVersionConflict(state, version) {
    state.responses.sign = {
      code: 1,
      stdout: '',
      stderr: `Version ${version} already exists.\n`
    };
  }
};

function makeResponse(r) {
  return new Response(JSON.stringify(r.body), {
    status: r.status,
    headers: { 'Content-Type': 'application/json', ...(r.headers || {}) }
  });
}
