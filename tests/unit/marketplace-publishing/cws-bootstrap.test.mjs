// tests/unit/marketplace-publishing/cws-bootstrap.test.mjs
//
// Pure-helper unit tests for cws-bootstrap. The OAuth dance itself is
// manual UAT (covered by the maintainer running `node scripts/cws-bootstrap.mjs`
// once); only the pure helpers exercised by that flow are unit-tested.

import { describe, it, expect } from 'vitest';

import {
  buildAuthUrl,
  formatScopeMismatchError,
} from '../../../scripts/cws-bootstrap.mjs';

// Lightweight property generator — keeps the project dependency-free
// while still exercising 100 random inputs per property.
const sampleStrings = (count, minLen = 1, maxLen = 60) => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789-_.';
  const out = [];
  for (let i = 0; i < count; i++) {
    const len = minLen + Math.floor(Math.random() * (maxLen - minLen + 1));
    let s = '';
    for (let j = 0; j < len; j++) s += chars[Math.floor(Math.random() * chars.length)];
    out.push(s);
  }
  return out;
};

describe('cws-bootstrap :: buildAuthUrl', () => {
  it('targets the Google OAuth v2 authorize endpoint', () => {
    const url = buildAuthUrl({
      clientId: 'abc.apps.googleusercontent.com',
      redirectUri: 'http://127.0.0.1:8765/callback',
      scope: 'https://www.googleapis.com/auth/chromewebstore',
    });
    expect(url).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
  });

  it('encodes the client_id in the query string', () => {
    const url = buildAuthUrl({
      clientId: 'my-app.apps.googleusercontent.com',
      redirectUri: 'http://127.0.0.1:8765/callback',
      scope: 'scope-x',
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('client_id')).toBe('my-app.apps.googleusercontent.com');
  });

  it('encodes the redirect_uri verbatim through the query string', () => {
    const url = buildAuthUrl({
      clientId: 'c',
      redirectUri: 'http://127.0.0.1:8765/callback',
      scope: 'scope-x',
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:8765/callback');
  });

  it('declares response_type=code (auth-code flow)', () => {
    const url = buildAuthUrl({
      clientId: 'c',
      redirectUri: 'http://127.0.0.1:8765/callback',
      scope: 'scope-x',
    });
    expect(new URL(url).searchParams.get('response_type')).toBe('code');
  });

  it('requests offline access to receive a refresh token', () => {
    const url = buildAuthUrl({
      clientId: 'c',
      redirectUri: 'http://127.0.0.1:8765/callback',
      scope: 'scope-x',
    });
    expect(new URL(url).searchParams.get('access_type')).toBe('offline');
  });

  it('forces a fresh consent (so refresh_token is always returned)', () => {
    const url = buildAuthUrl({
      clientId: 'c',
      redirectUri: 'http://127.0.0.1:8765/callback',
      scope: 'scope-x',
    });
    expect(new URL(url).searchParams.get('prompt')).toBe('consent');
  });

  it('passes the requested scope verbatim', () => {
    const scope = 'https://www.googleapis.com/auth/chromewebstore';
    const url = buildAuthUrl({
      clientId: 'c',
      redirectUri: 'http://127.0.0.1:8765/callback',
      scope,
    });
    expect(new URL(url).searchParams.get('scope')).toBe(scope);
  });

  it('property: every call yields a parseable URL on the auth endpoint (100 samples)', () => {
    const clientIds = sampleStrings(100, 1, 60);
    const redirectUris = [
      'http://127.0.0.1:8765/callback',
      'http://localhost:9090/cb',
      'https://example.test/oauth',
    ];
    const scopes = sampleStrings(100, 1, 80);
    for (let i = 0; i < 100; i++) {
      const input = {
        clientId: clientIds[i],
        redirectUri: redirectUris[i % redirectUris.length],
        scope: scopes[i],
      };
      const url = buildAuthUrl(input);
      const parsed = new URL(url);
      expect(parsed.origin).toBe('https://accounts.google.com');
      expect(parsed.pathname).toBe('/o/oauth2/v2/auth');
      expect(parsed.searchParams.get('client_id')).toBe(input.clientId);
      expect(parsed.searchParams.get('redirect_uri')).toBe(input.redirectUri);
      expect(parsed.searchParams.get('scope')).toBe(input.scope);
    }
  });
});

describe('cws-bootstrap :: formatScopeMismatchError', () => {
  it('mentions the required scope in the error message', () => {
    const msg = formatScopeMismatchError({
      requiredScope: 'https://www.googleapis.com/auth/chromewebstore',
      actualScopes: ['openid'],
    });
    expect(msg).toContain('https://www.googleapis.com/auth/chromewebstore');
  });

  it('mentions the granted scopes when present', () => {
    const msg = formatScopeMismatchError({
      requiredScope: 'scope-required',
      actualScopes: ['scope-a', 'scope-b'],
    });
    expect(msg).toContain('scope-a');
    expect(msg).toContain('scope-b');
  });

  it('handles missing actualScopes (undefined)', () => {
    const msg = formatScopeMismatchError({ requiredScope: 'scope-x' });
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
    expect(msg).toContain('scope-x');
  });

  it('handles empty actualScopes array', () => {
    const msg = formatScopeMismatchError({
      requiredScope: 'scope-x',
      actualScopes: [],
    });
    expect(msg).toContain('scope-x');
    expect(msg.toLowerCase()).toMatch(/none|empty|no scopes|missing/);
  });

  it('is deterministic for the same inputs', () => {
    const input = {
      requiredScope: 'scope-x',
      actualScopes: ['scope-a', 'scope-b'],
    };
    expect(formatScopeMismatchError(input)).toBe(formatScopeMismatchError(input));
  });
});
