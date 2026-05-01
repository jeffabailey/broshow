// tests/unit/marketplace-publishing/amo-listed-adapter.test.mjs
//
// EFFECT module unit tests with a fake fetch (probe) and fake spawn (sign).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  probeAmoListedVersions,
  submitAmoListed,
} from '../../../scripts/amo-listed-adapter.effect.mjs';

const VALID_CREDS = Object.freeze({ issuer: 'user:1234567:1', secret: 'fake-amo-jwt-secret' });

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

const makeFakeChild = ({ code = 0, stdout = '', stderr = '' } = {}) => {
  const handlers = { exit: [], close: [], error: [] };
  const stdoutHandlers = { data: [] };
  const stderrHandlers = { data: [] };
  const proc = {
    stdout: { on(event, cb) { if (event === 'data') stdoutHandlers.data.push(cb); return this; } },
    stderr: { on(event, cb) { if (event === 'data') stderrHandlers.data.push(cb); return this; } },
    on(event, cb) { if (handlers[event]) handlers[event].push(cb); return this; },
    once(event, cb) { return this.on(event, cb); },
    kill() {},
  };
  setImmediate(() => {
    if (stdout) stdoutHandlers.data.forEach((h) => h(Buffer.from(stdout)));
    if (stderr) stderrHandlers.data.forEach((h) => h(Buffer.from(stderr)));
    handlers.exit.forEach((h) => h(code));
    handlers.close.forEach((h) => h(code));
  });
  return proc;
};

describe('amo-listed-adapter.effect :: probeAmoListedVersions', () => {
  it('returns ok with the set of listed versions on 200', async () => {
    const fakeFetch = recordingFetch(() => makeJsonResponse({
      count: 2,
      results: [
        { version: '0.1.0', channel: 'listed' },
        { version: '0.2.0', channel: 'listed' },
      ],
    }));
    const result = await probeAmoListedVersions(VALID_CREDS, 'broshow@jeffabailey.com', { fetch: fakeFetch });
    expect(result.ok).toBe(true);
    expect(result.value).toBeInstanceOf(Set);
    expect([...result.value].sort()).toEqual(['0.1.0', '0.2.0']);
  });

  it('returns ok with empty set when no versions listed', async () => {
    const fakeFetch = recordingFetch(() => makeJsonResponse({ count: 0, results: [] }));
    const result = await probeAmoListedVersions(VALID_CREDS, 'guid', { fetch: fakeFetch });
    expect(result.ok).toBe(true);
    expect(result.value.size).toBe(0);
  });

  it('returns ok with empty set on 404 (addon not yet on AMO)', async () => {
    const fakeFetch = recordingFetch(() => makeJsonResponse({ detail: 'not found' }, 404));
    const result = await probeAmoListedVersions(VALID_CREDS, 'guid', { fetch: fakeFetch });
    expect(result.ok).toBe(true);
    expect(result.value.size).toBe(0);
  });

  it('classifies 429 as rate_limited', async () => {
    const fakeFetch = recordingFetch(() => makeJsonResponse({}, 429));
    const result = await probeAmoListedVersions(VALID_CREDS, 'guid', { fetch: fakeFetch });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('rate_limited');
  });

  it('classifies 401 as auth_expired', async () => {
    const fakeFetch = recordingFetch(() => makeJsonResponse({}, 401));
    const result = await probeAmoListedVersions(VALID_CREDS, 'guid', { fetch: fakeFetch });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('auth_expired');
  });

  it('GETs the AMO v5 versions endpoint with JWT bearer', async () => {
    const fakeFetch = recordingFetch(() => makeJsonResponse({ count: 0, results: [] }));
    await probeAmoListedVersions(VALID_CREDS, 'broshow@jeffabailey.com', { fetch: fakeFetch });
    const call = fakeFetch.calls[0];
    expect(call.url).toContain('/api/v5/addons/addon/');
    expect(call.url).toContain('/versions/');
    expect(call.init.headers.Authorization).toMatch(/^JWT /);
  });

  it('filters to listed-only versions when channel field is present', async () => {
    const fakeFetch = recordingFetch(() => makeJsonResponse({
      count: 3,
      results: [
        { version: '0.1.0', channel: 'listed' },
        { version: '0.1.5', channel: 'unlisted' },
        { version: '0.2.0', channel: 'listed' },
      ],
    }));
    const result = await probeAmoListedVersions(VALID_CREDS, 'guid', { fetch: fakeFetch });
    expect(result.ok).toBe(true);
    expect([...result.value].sort()).toEqual(['0.1.0', '0.2.0']);
  });
});

describe('amo-listed-adapter.effect :: submitAmoListed', () => {
  let tmpDir;
  let xpiPath;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'broshow-amo-sub-'));
    xpiPath = path.join(tmpDir, 'broshow.xpi');
    await fsp.writeFile(xpiPath, Buffer.from('PK\x03\x04fake-xpi'));
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it('spawns web-ext sign with --channel listed and resolves on exit code 0', async () => {
    const spawnCalls = [];
    const fakeSpawn = (cmd, args, opts) => {
      spawnCalls.push({ cmd, args, opts });
      return makeFakeChild({ code: 0, stdout: 'Submission ID: 1234567\n', stderr: '' });
    };
    const result = await submitAmoListed(VALID_CREDS, xpiPath, '0.3.0', { spawn: fakeSpawn });
    expect(result.ok).toBe(true);
    expect(spawnCalls).toHaveLength(1);
    const args = (spawnCalls[0].args || []).join(' ');
    expect(args).toMatch(/sign/);
    expect(args).toMatch(/--channel(\s|=)listed/);
  });

  it('extracts submission ID from web-ext stdout', async () => {
    const fakeSpawn = () => makeFakeChild({ code: 0, stdout: 'Submission ID: 4242424\n' });
    const result = await submitAmoListed(VALID_CREDS, xpiPath, '0.3.0', { spawn: fakeSpawn });
    expect(result.ok).toBe(true);
    expect(result.value.submissionId).toBe('4242424');
  });

  it('classifies version-conflict stderr as version_conflict on non-zero exit', async () => {
    const fakeSpawn = () => makeFakeChild({
      code: 1,
      stderr: 'Version 0.3.0 already exists.\n',
    });
    const result = await submitAmoListed(VALID_CREDS, xpiPath, '0.3.0', { spawn: fakeSpawn });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('version_conflict');
  });

  it('classifies generic non-zero exit as unknown_http', async () => {
    const fakeSpawn = () => makeFakeChild({
      code: 2,
      stderr: 'something went wrong\n',
    });
    const result = await submitAmoListed(VALID_CREDS, xpiPath, '0.3.0', { spawn: fakeSpawn });
    expect(result.ok).toBe(false);
    expect(['unknown_http', 'validation_failed']).toContain(result.error.code);
  });

  it('passes JWT issuer/secret as --api-key/--api-secret', async () => {
    const spawnCalls = [];
    const fakeSpawn = (cmd, args, opts) => {
      spawnCalls.push({ cmd, args, opts });
      return makeFakeChild({ code: 0, stdout: 'Submission ID: 1\n' });
    };
    await submitAmoListed(VALID_CREDS, xpiPath, '0.3.0', { spawn: fakeSpawn });
    const allArgs = spawnCalls[0].args || [];
    expect(allArgs).toContain('--api-key');
    expect(allArgs).toContain(VALID_CREDS.issuer);
    expect(allArgs).toContain('--api-secret');
    expect(allArgs).toContain(VALID_CREDS.secret);
  });
});
