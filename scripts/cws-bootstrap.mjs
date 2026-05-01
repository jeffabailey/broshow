#!/usr/bin/env node
// scripts/cws-bootstrap.mjs
//
// One-time local CLI: spins a localhost HTTP server, opens the user's
// browser to Google's OAuth consent page, captures the auth code,
// exchanges it for a refresh token, and prints the secrets to stdout
// with paste-into-secrets instructions.
//
// NEVER writes secrets to disk (AC-1-2). NEVER invoked from CI.
//
// Pure helpers (`buildAuthUrl`, `formatScopeMismatchError`) are
// independently unit-tested. The OAuth dance itself is manual UAT.

import * as http from 'node:http';
import { spawn as nodeSpawn } from 'node:child_process';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const CWS_SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
const DEFAULT_REDIRECT_PORT = 8765;
const DEFAULT_REDIRECT_URI = `http://127.0.0.1:${DEFAULT_REDIRECT_PORT}/callback`;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Builds the Google OAuth authorization URL for the auth-code flow.
 * Pure: no I/O, deterministic.
 *
 * @param {{ clientId: string, redirectUri: string, scope: string }} input
 * @returns {string}
 */
export function buildAuthUrl(input) {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: input.scope,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * Formats the scope-mismatch error message users see when their OAuth
 * client granted a different scope set than required (AC-1-5).
 * Pure: no I/O, deterministic.
 *
 * @param {{ requiredScope: string, actualScopes?: string[] }} input
 * @returns {string}
 */
export function formatScopeMismatchError(input) {
  const required = input.requiredScope;
  const actual = Array.isArray(input.actualScopes) ? input.actualScopes : [];
  const granted = actual.length === 0 ? '(none granted)' : actual.join(', ');
  return [
    `OAuth scope mismatch.`,
    `  Required: ${required}`,
    `  Granted:  ${granted}`,
    ``,
    `Re-run the bootstrap and approve the chromewebstore scope on the consent screen.`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// CLI plumbing (effects -- not unit tested; manual UAT)
// ---------------------------------------------------------------------------

const openInBrowser = async (url) => {
  // Best-effort: try `open` (macOS), `xdg-open` (Linux), `start` (Windows).
  const candidates =
    process.platform === 'darwin'
      ? ['open']
      : process.platform === 'win32'
        ? ['cmd.exe', '/c', 'start']
        : ['xdg-open'];
  try {
    nodeSpawn(candidates[0], [...candidates.slice(1), url], { stdio: 'ignore', detached: true }).unref();
  } catch {
    // Manual fallback: just print and let the user click/paste.
  }
};

const promptInput = (label) =>
  new Promise((resolve) => {
    process.stdout.write(`${label}: `);
    let buffer = '';
    const onData = (chunk) => {
      buffer += chunk.toString('utf-8');
      if (buffer.includes('\n')) {
        process.stdin.removeListener('data', onData);
        process.stdin.pause();
        resolve(buffer.split('\n')[0].trim());
      }
    };
    process.stdin.resume();
    process.stdin.on('data', onData);
  });

const captureAuthCode = (port) =>
  new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      const grantedScope = url.searchParams.get('scope') || '';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<html><body><h2>BroShow CWS bootstrap</h2>' +
          (code
            ? '<p>Authorization captured. You can close this tab and return to the terminal.</p>'
            : `<p>Authorization failed: ${error || 'no code'}</p>`) +
          '</body></html>'
      );
      server.close();
      if (code) {
        resolve({ code, grantedScope });
      } else {
        reject(new Error(`OAuth failed: ${error || 'no code in callback'}`));
      }
    });
    server.on('error', reject);
    server.listen(port, '127.0.0.1');
  });

const exchangeAuthCode = async (input, fetchFn) => {
  const body = new URLSearchParams({
    code: input.code,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    grant_type: 'authorization_code',
  });
  const response = await fetchFn(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = await response.json().catch(() => ({}));
  if (response.status !== 200 || !json.refresh_token) {
    throw new Error(
      `Token exchange failed (HTTP ${response.status}): ${json.error_description || json.error || 'unknown'}`
    );
  }
  return json;
};

/**
 * Programmatic entry for tests (and the CLI's main).
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {{ now?: () => number, openBrowser?: (url: string) => Promise<void>, fetch?: typeof fetch, promptInput?: (label: string) => Promise<string> }} [providers]
 * @returns {Promise<{ exitCode: number, stdout: string }>}
 */
export async function runBootstrap(env, providers = {}) {
  const fetchFn = providers.fetch || globalThis.fetch;
  const open = providers.openBrowser || openInBrowser;
  const prompt = providers.promptInput || promptInput;

  const clientId = env.CWS_CLIENT_ID || (await prompt('Enter CWS_CLIENT_ID'));
  const clientSecret = env.CWS_CLIENT_SECRET || (await prompt('Enter CWS_CLIENT_SECRET'));
  const redirectUri = env.CWS_REDIRECT_URI || DEFAULT_REDIRECT_URI;
  const port = Number(env.CWS_REDIRECT_PORT || DEFAULT_REDIRECT_PORT);

  const authUrl = buildAuthUrl({ clientId, redirectUri, scope: CWS_SCOPE });

  process.stdout.write(`\nOpening browser for OAuth consent...\n  ${authUrl}\n\n`);
  await open(authUrl);

  const { code, grantedScope } = await captureAuthCode(port);
  if (grantedScope && !grantedScope.includes(CWS_SCOPE)) {
    const message = formatScopeMismatchError({
      requiredScope: CWS_SCOPE,
      actualScopes: grantedScope.split(/\s+/).filter(Boolean),
    });
    process.stderr.write(`${message}\n`);
    return { exitCode: 1, stdout: '' };
  }

  const tokenResponse = await exchangeAuthCode(
    { code, clientId, clientSecret, redirectUri },
    fetchFn
  );

  const stdout = [
    '',
    '== CWS bootstrap complete ==',
    'Paste the following four values into your repository secrets',
    '(Settings -> Secrets and variables -> Actions -> New repository secret):',
    '',
    `CWS_CLIENT_ID=${clientId}`,
    `CWS_CLIENT_SECRET=${clientSecret}`,
    `CWS_REFRESH_TOKEN=${tokenResponse.refresh_token}`,
    '',
    'Also configure CWS_EXTENSION_ID with the extension ID shown in the',
    'Chrome Web Store developer dashboard.',
    '',
    '[NEVER commit these values to the repository.]',
  ].join('\n');
  process.stdout.write(`${stdout}\n`);

  return { exitCode: 0, stdout };
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

// Only run when invoked directly (not when imported by tests).
import { fileURLToPath } from 'node:url';
const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  runBootstrap(process.env)
    .then(({ exitCode }) => process.exit(exitCode))
    .catch((err) => {
      process.stderr.write(`cws-bootstrap: ${err.message}\n`);
      process.exit(1);
    });
}
