// scripts/amo-jwt.pure.mjs
//
// PURE module: HMAC-SHA256 JWT generation for AMO API auth.
// node:crypto is permitted here as it is pure compute (no I/O).
// crypto.randomBytes is the one impurity for `jti`; injected provider
// pattern allows tests to remove it (deterministic tests).

import { createHmac, randomBytes } from 'node:crypto';

const TOKEN_LIFETIME_SECONDS = 60;

const base64url = (input) =>
  Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const encodeJson = (value) => base64url(JSON.stringify(value));

const defaultJti = () => randomBytes(16).toString('hex');
const defaultNow = () => Date.now();

/**
 * @param {{ issuer: string, secret: string }} creds
 * @param {{ now?: () => number, jti?: () => string }} [providers]
 * @returns {string} signed JWT (HS256)
 */
export function generateJwt(creds, providers = {}) {
  const now = providers.now ?? defaultNow;
  const jti = providers.jti ?? defaultJti;

  const header = { typ: 'JWT', alg: 'HS256' };
  const issuedAt = Math.floor(now() / 1000);
  const payload = {
    iss: creds.issuer,
    jti: jti(),
    iat: issuedAt,
    exp: issuedAt + TOKEN_LIFETIME_SECONDS,
  };

  const signingInput = `${encodeJson(header)}.${encodeJson(payload)}`;
  const signature = base64url(createHmac('sha256', creds.secret).update(signingInput).digest());
  return `${signingInput}.${signature}`;
}
