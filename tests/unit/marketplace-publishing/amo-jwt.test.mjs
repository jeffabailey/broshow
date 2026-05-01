// tests/unit/marketplace-publishing/amo-jwt.test.mjs
//
// PURE module unit tests for HMAC-SHA256 JWT generation.
// Properties tested: structure (3 segments), base64url-no-padding, signature determinism,
// signature/payload coupling, deterministic providers.

import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { generateJwt } from '../../../scripts/amo-jwt.pure.mjs';

const FIXED_NOW_MS = 1700000000000; // 2023-11-14T22:13:20Z (deterministic)
const FIXED_JTI = 'deadbeefcafebabe1234567890abcdef';

const fixedProviders = (now = FIXED_NOW_MS, jti = FIXED_JTI) => ({
  now: () => now,
  jti: () => jti
});

const decodeBase64Url = (segment) => {
  const padded = segment + '='.repeat((4 - (segment.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
};

describe('amo-jwt.pure :: generateJwt', () => {
  describe('structure', () => {
    it('returns three dot-separated base64url segments', () => {
      const jwt = generateJwt({ issuer: 'user:1:1', secret: 'secret-key' }, fixedProviders());
      const parts = jwt.split('.');
      expect(parts).toHaveLength(3);
      // base64url has only alphanumerics, `-`, `_`. No `=`, `+`, `/`.
      for (const p of parts) {
        expect(p).toMatch(/^[A-Za-z0-9_-]+$/);
      }
    });

    it('header decodes to {alg: HS256, typ: JWT}', () => {
      const jwt = generateJwt({ issuer: 'user:1:1', secret: 'k' }, fixedProviders());
      const [headerSeg] = jwt.split('.');
      const header = JSON.parse(decodeBase64Url(headerSeg).toString('utf8'));
      expect(header.alg).toBe('HS256');
      expect(header.typ).toBe('JWT');
    });

    it('payload includes iss, jti, iat, exp with iat injected from now provider', () => {
      const jwt = generateJwt(
        { issuer: 'user:42:7', secret: 'k' },
        fixedProviders(FIXED_NOW_MS, 'fixed-jti')
      );
      const [, payloadSeg] = jwt.split('.');
      const payload = JSON.parse(decodeBase64Url(payloadSeg).toString('utf8'));
      expect(payload.iss).toBe('user:42:7');
      expect(payload.jti).toBe('fixed-jti');
      expect(payload.iat).toBe(Math.floor(FIXED_NOW_MS / 1000));
      expect(payload.exp).toBeGreaterThan(payload.iat);
      expect(payload.exp - payload.iat).toBeLessThanOrEqual(60);
    });
  });

  describe('signature properties', () => {
    it('signature is deterministic for same key/payload/providers', () => {
      const a = generateJwt({ issuer: 'user:1:1', secret: 'k' }, fixedProviders());
      const b = generateJwt({ issuer: 'user:1:1', secret: 'k' }, fixedProviders());
      expect(a).toBe(b);
    });

    it('signature changes when secret changes', () => {
      const a = generateJwt({ issuer: 'u', secret: 'secret-A' }, fixedProviders());
      const b = generateJwt({ issuer: 'u', secret: 'secret-B' }, fixedProviders());
      const [, , sigA] = a.split('.');
      const [, , sigB] = b.split('.');
      expect(sigA).not.toBe(sigB);
    });

    it('signature changes when issuer changes', () => {
      const a = generateJwt({ issuer: 'user:1:1', secret: 'k' }, fixedProviders());
      const b = generateJwt({ issuer: 'user:2:1', secret: 'k' }, fixedProviders());
      const [, , sigA] = a.split('.');
      const [, , sigB] = b.split('.');
      expect(sigA).not.toBe(sigB);
    });

    it('signature changes when jti changes', () => {
      const a = generateJwt({ issuer: 'u', secret: 'k' }, fixedProviders(FIXED_NOW_MS, 'jti-1'));
      const b = generateJwt({ issuer: 'u', secret: 'k' }, fixedProviders(FIXED_NOW_MS, 'jti-2'));
      const [, , sigA] = a.split('.');
      const [, , sigB] = b.split('.');
      expect(sigA).not.toBe(sigB);
    });

    it('signature verifies with the same HMAC-SHA256 key (independent recompute)', () => {
      const creds = { issuer: 'user:1:1', secret: 'verify-me' };
      const jwt = generateJwt(creds, fixedProviders());
      const [headerSeg, payloadSeg, sigSeg] = jwt.split('.');
      const signingInput = `${headerSeg}.${payloadSeg}`;
      const expectedSig = createHmac('sha256', creds.secret)
        .update(signingInput)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      expect(sigSeg).toBe(expectedSig);
    });
  });

  describe('property: across many random inputs, structure invariants hold', () => {
    it('100 random combinations all produce well-formed 3-part JWTs with no padding', () => {
      const samples = Array.from({ length: 100 }, (_, i) => ({
        issuer: `user:${i}:${i % 10}`,
        secret: `secret-${i}-${(i * 7919).toString(16)}`,
        nowMs: 1_600_000_000_000 + i * 1000,
        jti: `jti-${i.toString(16).padStart(32, '0')}`
      }));
      for (const s of samples) {
        const jwt = generateJwt(
          { issuer: s.issuer, secret: s.secret },
          { now: () => s.nowMs, jti: () => s.jti }
        );
        const parts = jwt.split('.');
        expect(parts).toHaveLength(3);
        for (const p of parts) {
          expect(p).not.toMatch(/=/);
          expect(p).not.toMatch(/\+/);
          expect(p).not.toMatch(/\//);
          expect(p).toMatch(/^[A-Za-z0-9_-]+$/);
        }
      }
    });
  });

  describe('default providers (when omitted)', () => {
    it('uses Date.now and a random jti when no providers passed', () => {
      const jwt = generateJwt({ issuer: 'u', secret: 'k' });
      const parts = jwt.split('.');
      expect(parts).toHaveLength(3);
      const payload = JSON.parse(decodeBase64Url(parts[1]).toString('utf8'));
      expect(typeof payload.iat).toBe('number');
      expect(typeof payload.jti).toBe('string');
      expect(payload.jti.length).toBeGreaterThan(0);
    });

    it('two calls with default providers produce different jtis (random)', () => {
      const a = generateJwt({ issuer: 'u', secret: 'k' });
      const b = generateJwt({ issuer: 'u', secret: 'k' });
      // Even at the same millisecond, jti must differ.
      const [, payloadSegA] = a.split('.');
      const [, payloadSegB] = b.split('.');
      const payloadA = JSON.parse(decodeBase64Url(payloadSegA).toString('utf8'));
      const payloadB = JSON.parse(decodeBase64Url(payloadSegB).toString('utf8'));
      expect(payloadA.jti).not.toBe(payloadB.jti);
    });
  });
});
