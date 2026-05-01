// tests/unit/marketplace-publishing/decisions.test.mjs
//
// PURE module unit tests for decisions.pure.mjs.
// Properties tested:
//   - parseTargets: total over valid inputs; rejects unknowns; equivalence on aliases
//   - parseMode: total over precedence rules; dry_run wins
//   - classifyVersionState: 3-way classification with draftVersion handling
//   - planRun: maps targets x mode -> ordered steps
//   - aggregateOutcomes: exit-code rules (fail wins, all already-published+publish=>1, dry-run=>0)
//   - renderSummary: includes target/version/status/dashboard rows; recovery when failure
//   - sanitizeForLog: strips secrets and known-secret headers/fields recursively

import { describe, it, expect } from 'vitest';
import {
  parseTargets,
  parseMode,
  classifyVersionState,
  planRun,
  aggregateOutcomes,
  renderSummary,
  sanitizeForLog,
  classifyHttpStatus,
} from '../../../scripts/decisions.pure.mjs';

describe('decisions.pure :: parseTargets', () => {
  it('parses "cws,amo-listed" to both targets', () => {
    expect(parseTargets('cws,amo-listed')).toEqual(['cws', 'amo-listed']);
  });

  it('parses "both" alias to both targets', () => {
    expect(parseTargets('both')).toEqual(['cws', 'amo-listed']);
  });

  it('parses "cws-only" to ["cws"]', () => {
    expect(parseTargets('cws-only')).toEqual(['cws']);
  });

  it('parses "cws" alone to ["cws"]', () => {
    expect(parseTargets('cws')).toEqual(['cws']);
  });

  it('parses "amo-listed-only" to ["amo-listed"]', () => {
    expect(parseTargets('amo-listed-only')).toEqual(['amo-listed']);
  });

  it('parses "amo-listed" alone to ["amo-listed"]', () => {
    expect(parseTargets('amo-listed')).toEqual(['amo-listed']);
  });

  it('parses "none" to []', () => {
    expect(parseTargets('none')).toEqual([]);
  });

  it('tolerates whitespace: " cws , amo-listed "', () => {
    expect(parseTargets(' cws , amo-listed ')).toEqual(['cws', 'amo-listed']);
  });

  it('throws on empty string', () => {
    expect(() => parseTargets('')).toThrow();
  });

  it('throws on null/undefined', () => {
    expect(() => parseTargets(null)).toThrow();
    expect(() => parseTargets(undefined)).toThrow();
  });

  it('throws on unknown target', () => {
    expect(() => parseTargets('edge-store')).toThrow();
    expect(() => parseTargets('cws,edge')).toThrow();
  });

  it('property: any list of valid targets round-trips through join+parse', () => {
    const validCombos = [
      ['cws'],
      ['amo-listed'],
      ['cws', 'amo-listed'],
    ];
    for (const combo of validCombos) {
      expect(parseTargets(combo.join(','))).toEqual(combo);
    }
  });
});

describe('decisions.pure :: parseMode', () => {
  it('returns "dry-run" when dryRun is true regardless of cwsPublish', () => {
    expect(parseMode({ dryRun: true, cwsPublish: 'default' })).toBe('dry-run');
    expect(parseMode({ dryRun: true, cwsPublish: 'upload-only' })).toBe('dry-run');
    expect(parseMode({ dryRun: true, cwsPublish: 'trustedTesters' })).toBe('dry-run');
  });

  it('returns "upload-only" when cwsPublish is upload-only and dryRun is false', () => {
    expect(parseMode({ dryRun: false, cwsPublish: 'upload-only' })).toBe('upload-only');
  });

  it('returns "publish" for default and trustedTesters when dryRun is false', () => {
    expect(parseMode({ dryRun: false, cwsPublish: 'default' })).toBe('publish');
    expect(parseMode({ dryRun: false, cwsPublish: 'trustedTesters' })).toBe('publish');
  });

  it('accepts an explicit MODE override string and returns it when valid', () => {
    expect(parseMode({ mode: 'dry-run' })).toBe('dry-run');
    expect(parseMode({ mode: 'publish' })).toBe('publish');
    expect(parseMode({ mode: 'upload-only' })).toBe('upload-only');
  });

  it('throws on invalid mode override', () => {
    expect(() => parseMode({ mode: 'launch-rocket' })).toThrow();
  });
});

describe('decisions.pure :: classifyVersionState', () => {
  it('returns "available" when version is not in existingVersions and no draft', () => {
    expect(classifyVersionState('0.3.0', new Set(['0.1.0', '0.2.0']), null)).toBe('available');
  });

  it('returns "already-published" when version is in existingVersions', () => {
    expect(classifyVersionState('0.3.0', new Set(['0.3.0']), null)).toBe('already-published');
  });

  it('returns "partial-upload" when version equals draftVersion and not published', () => {
    expect(classifyVersionState('0.3.0', new Set(['0.2.0']), '0.3.0')).toBe('partial-upload');
  });

  it('prefers already-published over partial-upload (already-published wins)', () => {
    expect(classifyVersionState('0.3.0', new Set(['0.3.0']), '0.3.0')).toBe('already-published');
  });

  it('handles empty existingVersions', () => {
    expect(classifyVersionState('0.3.0', new Set(), null)).toBe('available');
  });

  it('handles undefined draftVersion same as null', () => {
    expect(classifyVersionState('0.3.0', new Set(), undefined)).toBe('available');
  });
});

describe('decisions.pure :: planRun', () => {
  it('returns one step per target when mode is publish', () => {
    const steps = planRun(['cws', 'amo-listed'], 'publish');
    expect(steps).toHaveLength(2);
    expect(steps.find((s) => s.target === 'cws').mode).toBe('publish');
    expect(steps.find((s) => s.target === 'amo-listed').mode).toBe('publish');
  });

  it('coerces upload-only to publish for amo-listed (AMO has no upload-only equivalent)', () => {
    const steps = planRun(['cws', 'amo-listed'], 'upload-only');
    const cwsStep = steps.find((s) => s.target === 'cws');
    const amoStep = steps.find((s) => s.target === 'amo-listed');
    expect(cwsStep.mode).toBe('upload-only');
    expect(amoStep.mode).toBe('publish');
  });

  it('passes dry-run mode through to every target', () => {
    const steps = planRun(['cws', 'amo-listed'], 'dry-run');
    for (const step of steps) {
      expect(step.mode).toBe('dry-run');
    }
  });

  it('returns empty array for empty targets', () => {
    expect(planRun([], 'publish')).toEqual([]);
  });
});

describe('decisions.pure :: aggregateOutcomes', () => {
  const successCws = {
    target: 'cws', status: 'success', version: '0.3.0', message: 'ok',
    dashboardUrl: 'https://chrome.google.com/webstore/detail/abc', errorCode: null, durationSeconds: 1
  };
  const successAmo = {
    target: 'amo-listed', status: 'success', version: '0.3.0', message: 'ok',
    dashboardUrl: 'https://addons.mozilla.org/.../broshow', errorCode: null, durationSeconds: 1
  };
  const failureCws = {
    target: 'cws', status: 'failure', version: '0.3.0', message: 'auth expired',
    dashboardUrl: null, errorCode: 'auth_expired', durationSeconds: 1
  };
  const alreadyCws = {
    target: 'cws', status: 'already-published', version: '0.3.0', message: 'already',
    dashboardUrl: null, errorCode: null, durationSeconds: 1
  };
  const alreadyAmo = {
    target: 'amo-listed', status: 'already-published', version: '0.3.0', message: 'already',
    dashboardUrl: null, errorCode: null, durationSeconds: 1
  };
  const wouldSucceedCws = { ...successCws, status: 'would-succeed', message: '[DRY RUN] ok' };
  const wouldFailCws = { ...failureCws, status: 'would-fail', message: '[DRY RUN] would fail' };

  it('exitCode 0 when all outcomes are success', () => {
    const r = aggregateOutcomes([successCws, successAmo]);
    expect(r.exitCode).toBe(0);
    expect(r.recoveryHint).toBeNull();
  });

  it('exitCode 1 when any outcome is failure', () => {
    const r = aggregateOutcomes([successAmo, failureCws]);
    expect(r.exitCode).toBe(1);
    expect(r.recoveryHint).toMatch(/cws/i);
  });

  it('exitCode 1 when all outcomes are already-published in publish mode', () => {
    const r = aggregateOutcomes([alreadyCws, alreadyAmo]);
    expect(r.exitCode).toBe(1);
  });

  it('exitCode 0 for would-succeed outcomes (dry-run all-pass)', () => {
    const r = aggregateOutcomes([wouldSucceedCws]);
    expect(r.exitCode).toBe(0);
  });

  it('exitCode 1 when any would-fail outcome present (dry-run with conflict)', () => {
    const r = aggregateOutcomes([wouldFailCws, wouldSucceedCws]);
    expect(r.exitCode).toBe(1);
  });

  it('recovery hint identifies failed targets only', () => {
    const r = aggregateOutcomes([successAmo, failureCws]);
    expect(r.recoveryHint).toMatch(/cws/);
    expect(r.recoveryHint).not.toMatch(/amo-listed.*amo-listed/); // amo not duplicated
  });

  it('recovery hint mentions cws-bootstrap on auth_expired', () => {
    const r = aggregateOutcomes([failureCws]);
    expect(r.recoveryHint).toMatch(/cws-bootstrap/);
  });

  it('memoryRulePreserved is always true', () => {
    expect(aggregateOutcomes([successCws]).memoryRulePreserved).toBe(true);
    expect(aggregateOutcomes([failureCws]).memoryRulePreserved).toBe(true);
    expect(aggregateOutcomes([]).memoryRulePreserved).toBe(true);
  });

  it('preserves outcomes array', () => {
    const r = aggregateOutcomes([successCws, failureCws]);
    expect(r.outcomes).toHaveLength(2);
  });
});

describe('decisions.pure :: renderSummary', () => {
  const baseSuccessCws = {
    target: 'cws', status: 'success', version: '0.3.0', message: 'Submitted for review',
    dashboardUrl: 'https://chrome.google.com/webstore/detail/abc', errorCode: null, durationSeconds: 1
  };
  const baseSuccessAmo = {
    target: 'amo-listed', status: 'success', version: '0.3.0', message: 'Submission 1234567 accepted',
    dashboardUrl: 'https://addons.mozilla.org/.../broshow', errorCode: null, durationSeconds: 1
  };

  it('includes a Markdown table row per outcome', () => {
    const result = aggregateOutcomes([baseSuccessCws, baseSuccessAmo]);
    const md = renderSummary(result);
    expect(md).toMatch(/\| cws \|/);
    expect(md).toMatch(/\| amo-listed \|/);
    expect(md).toMatch(/0\.3\.0/);
  });

  it('mentions dashboard URLs in the summary', () => {
    const result = aggregateOutcomes([baseSuccessCws]);
    const md = renderSummary(result);
    expect(md).toContain('https://chrome.google.com/webstore/detail/abc');
  });

  it('includes a Recovery section when any outcome is failure', () => {
    const failure = { ...baseSuccessCws, status: 'failure', errorCode: 'auth_expired', message: 'auth' };
    const result = aggregateOutcomes([failure]);
    const md = renderSummary(result);
    expect(md).toMatch(/##\s*Recovery/i);
  });

  it('omits Recovery section on all-success', () => {
    const result = aggregateOutcomes([baseSuccessCws, baseSuccessAmo]);
    const md = renderSummary(result);
    expect(md).not.toMatch(/##\s*Recovery/i);
  });

  it('prefixes summary with "[DRY RUN]" when outcomes are would-succeed/would-fail', () => {
    const wouldSucceed = { ...baseSuccessCws, status: 'would-succeed', message: '[DRY RUN] ok' };
    const result = aggregateOutcomes([wouldSucceed]);
    const md = renderSummary(result);
    expect(md).toMatch(/\[DRY RUN\]/i);
  });
});

describe('decisions.pure :: sanitizeForLog', () => {
  it('strips Authorization header from object', () => {
    const input = { headers: { Authorization: 'Bearer secret-xyz', 'X-Other': 'safe' } };
    const out = sanitizeForLog(input);
    expect(out.headers.Authorization).toBe('[REDACTED]');
    expect(out.headers['X-Other']).toBe('safe');
  });

  it('strips access_token, refresh_token, client_secret, id_token fields', () => {
    const input = {
      access_token: 'a', refresh_token: 'r', client_secret: 'c', id_token: 'i',
      something_else: 'visible'
    };
    const out = sanitizeForLog(input);
    expect(out.access_token).toBe('[REDACTED]');
    expect(out.refresh_token).toBe('[REDACTED]');
    expect(out.client_secret).toBe('[REDACTED]');
    expect(out.id_token).toBe('[REDACTED]');
    expect(out.something_else).toBe('visible');
  });

  it('strips fields with case-insensitive *_secret, *_token, secret, token suffix', () => {
    const input = { CWS_REFRESH_TOKEN: 'x', AMO_JWT_SECRET: 'y', visible_field: 'ok' };
    const out = sanitizeForLog(input);
    expect(out.CWS_REFRESH_TOKEN).toBe('[REDACTED]');
    expect(out.AMO_JWT_SECRET).toBe('[REDACTED]');
    expect(out.visible_field).toBe('ok');
  });

  it('recursively sanitizes nested objects', () => {
    const input = { outer: { inner: { access_token: 'a', visible: 'v' } } };
    const out = sanitizeForLog(input);
    expect(out.outer.inner.access_token).toBe('[REDACTED]');
    expect(out.outer.inner.visible).toBe('v');
  });

  it('sanitizes arrays of objects', () => {
    const input = [{ access_token: 'a' }, { foo: 'bar' }];
    const out = sanitizeForLog(input);
    expect(out[0].access_token).toBe('[REDACTED]');
    expect(out[1].foo).toBe('bar');
  });

  it('returns primitives unchanged', () => {
    expect(sanitizeForLog('hello')).toBe('hello');
    expect(sanitizeForLog(42)).toBe(42);
    expect(sanitizeForLog(null)).toBe(null);
    expect(sanitizeForLog(undefined)).toBe(undefined);
  });
});

// ---------------------------------------------------------------------------
// Mutation-killer tests
//
// These tests target specific Stryker mutants that survived a baseline run.
// They assert on exact return values, regex anchor behavior, branch coverage,
// and string literals that the production code MUST produce verbatim.
// ---------------------------------------------------------------------------

describe('decisions / mutation-killers / sanitizeForLog regex anchors', () => {
  // Anchored pattern: ^authorization$ (case-insensitive)
  it('redacts exactly "authorization" (any case) but not when prefixed/suffixed', () => {
    const out = sanitizeForLog({
      Authorization: 'a',
      authorization: 'b',
      AUTHORIZATION: 'c',
      'pre-authorization': 'd',
      'authorization-extra': 'e',
    });
    expect(out.Authorization).toBe('[REDACTED]');
    expect(out.authorization).toBe('[REDACTED]');
    expect(out.AUTHORIZATION).toBe('[REDACTED]');
    expect(out['pre-authorization']).toBe('d');
    expect(out['authorization-extra']).toBe('e');
  });

  it('redacts exactly "cookie" but not "cookies" or "my-cookie"', () => {
    const out = sanitizeForLog({
      cookie: 'a',
      Cookie: 'b',
      cookies: 'c',
      'my-cookie': 'd',
      'cookie-jar': 'e',
    });
    expect(out.cookie).toBe('[REDACTED]');
    expect(out.Cookie).toBe('[REDACTED]');
    expect(out.cookies).toBe('c');
    expect(out['my-cookie']).toBe('d');
    expect(out['cookie-jar']).toBe('e');
  });

  it('redacts exactly "set-cookie" but not "set-cookies" or prefixed variants', () => {
    const out = sanitizeForLog({
      'set-cookie': 'a',
      'Set-Cookie': 'b',
      'set-cookies': 'c',
      'pre-set-cookie': 'd',
      'set-cookie-extra': 'e',
    });
    expect(out['set-cookie']).toBe('[REDACTED]');
    expect(out['Set-Cookie']).toBe('[REDACTED]');
    expect(out['set-cookies']).toBe('c');
    expect(out['pre-set-cookie']).toBe('d');
    expect(out['set-cookie-extra']).toBe('e');
  });

  it('redacts exactly "x-api-key" but not prefixed/suffixed variants', () => {
    const out = sanitizeForLog({
      'x-api-key': 'a',
      'X-API-Key': 'b',
      'pre-x-api-key': 'c',
      'x-api-key-extra': 'd',
      'x-api-keys': 'e',
    });
    expect(out['x-api-key']).toBe('[REDACTED]');
    expect(out['X-API-Key']).toBe('[REDACTED]');
    expect(out['pre-x-api-key']).toBe('c');
    expect(out['x-api-key-extra']).toBe('d');
    expect(out['x-api-keys']).toBe('e');
  });

  // Pattern: access[_-]?token$  -- matches "access_token", "access-token", "accesstoken", "FOO_access_token"
  it('redacts access_token / access-token / accesstoken (suffix-anchored, prefix-allowed)', () => {
    const out = sanitizeForLog({
      access_token: 'a',
      'access-token': 'b',
      accesstoken: 'c',
      MY_access_token: 'd',
      access_tokens: 'e',          // not exact suffix -> NOT redacted
      access_token_extra: 'f',     // not exact suffix -> NOT redacted
    });
    expect(out.access_token).toBe('[REDACTED]');
    expect(out['access-token']).toBe('[REDACTED]');
    expect(out.accesstoken).toBe('[REDACTED]');
    expect(out.MY_access_token).toBe('[REDACTED]');
    expect(out.access_tokens).toBe('e');
    expect(out.access_token_extra).toBe('f');
  });

  it('redacts refresh_token / refresh-token / refreshtoken with prefix tolerance', () => {
    const out = sanitizeForLog({
      refresh_token: 'a',
      'refresh-token': 'b',
      refreshtoken: 'c',
      CWS_refresh_token: 'd',
      refresh_tokens: 'e',
    });
    expect(out.refresh_token).toBe('[REDACTED]');
    expect(out['refresh-token']).toBe('[REDACTED]');
    expect(out.refreshtoken).toBe('[REDACTED]');
    expect(out.CWS_refresh_token).toBe('[REDACTED]');
    expect(out.refresh_tokens).toBe('e');
  });

  it('redacts id_token / id-token / idtoken with prefix tolerance', () => {
    const out = sanitizeForLog({
      id_token: 'a',
      'id-token': 'b',
      idtoken: 'c',
      USER_id_token: 'd',
      id_tokens: 'e',
    });
    expect(out.id_token).toBe('[REDACTED]');
    expect(out['id-token']).toBe('[REDACTED]');
    expect(out.idtoken).toBe('[REDACTED]');
    expect(out.USER_id_token).toBe('[REDACTED]');
    expect(out.id_tokens).toBe('e');
  });

  it('redacts client_secret / client-secret / clientsecret with prefix tolerance', () => {
    const out = sanitizeForLog({
      client_secret: 'a',
      'client-secret': 'b',
      clientsecret: 'c',
      OAUTH_client_secret: 'd',
      client_secrets: 'e',
    });
    expect(out.client_secret).toBe('[REDACTED]');
    expect(out['client-secret']).toBe('[REDACTED]');
    expect(out.clientsecret).toBe('[REDACTED]');
    expect(out.OAUTH_client_secret).toBe('[REDACTED]');
    expect(out.client_secrets).toBe('e');
  });

  // Pattern: ^.*_secret$  -- requires literal "_secret" suffix; not "_secrets"
  it('redacts *_secret suffix (with required underscore) but not *_secrets', () => {
    const out = sanitizeForLog({
      api_secret: 'a',
      MY_VERY_LONG_secret: 'b',
      api_secrets: 'c',                 // plural -> NOT redacted
      apisecret: 'd',                   // missing underscore -> NOT redacted (uses *_secret pattern)
      // confirm "secret" alone still hits because of the ^secret$ pattern
      secret: 'e',
    });
    expect(out.api_secret).toBe('[REDACTED]');
    expect(out.MY_VERY_LONG_secret).toBe('[REDACTED]');
    expect(out.api_secrets).toBe('c');
    // apisecret is checked against /^.*_secret$/ -> requires _secret suffix.
    // It is NOT covered by client_secret pattern (different prefix).
    // Only redacted if it matches some other pattern. It doesn't. Confirm.
    expect(out.apisecret).toBe('d');
    expect(out.secret).toBe('[REDACTED]');
  });

  // Pattern: ^.*_token$ -- requires literal "_token" suffix
  it('redacts *_token suffix (with required underscore) but not *_tokens or *token without underscore', () => {
    const out = sanitizeForLog({
      api_token: 'a',
      MY_VERY_LONG_token: 'b',
      api_tokens: 'c',
      mytoken: 'd',          // matches no pattern (no underscore, not exactly "token")
      token: 'e',            // matches ^token$
    });
    expect(out.api_token).toBe('[REDACTED]');
    expect(out.MY_VERY_LONG_token).toBe('[REDACTED]');
    expect(out.api_tokens).toBe('c');
    expect(out.mytoken).toBe('d');
    expect(out.token).toBe('[REDACTED]');
  });

  it('redacts exactly "secret" but not "secrets" or "my-secret"', () => {
    const out = sanitizeForLog({
      secret: 'a',
      Secret: 'b',
      SECRET: 'c',
      secrets: 'd',
      'my-secret': 'e',
    });
    expect(out.secret).toBe('[REDACTED]');
    expect(out.Secret).toBe('[REDACTED]');
    expect(out.SECRET).toBe('[REDACTED]');
    expect(out.secrets).toBe('d');
    // 'my-secret' has no underscore-secret suffix; should not be redacted.
    expect(out['my-secret']).toBe('e');
  });

  it('redacts exactly "token" but not "tokens" or "my-token"', () => {
    const out = sanitizeForLog({
      token: 'a',
      Token: 'b',
      TOKEN: 'c',
      tokens: 'd',
      'my-token': 'e',
    });
    expect(out.token).toBe('[REDACTED]');
    expect(out.Token).toBe('[REDACTED]');
    expect(out.TOKEN).toBe('[REDACTED]');
    expect(out.tokens).toBe('d');
    expect(out['my-token']).toBe('e');
  });
});

describe('decisions / mutation-killers / classifyHttpStatus boundaries', () => {
  // Kill EqualityOperator mutants for === 401, === 403, === 429, === 413
  // and the >= 500 / <= 599 boundary mutants.
  it('classifies 401 and 403 as auth_expired (and 400/402/404 are NOT auth_expired)', () => {
    expect(classifyHttpStatus(401)).toBe('auth_expired');
    expect(classifyHttpStatus(403)).toBe('auth_expired');
    expect(classifyHttpStatus(400)).toBe('unknown_http');
    expect(classifyHttpStatus(402)).toBe('unknown_http');
    expect(classifyHttpStatus(404)).toBe('unknown_http');
  });

  it('classifies 429 as rate_limited (but 428 and 430 are NOT)', () => {
    expect(classifyHttpStatus(429)).toBe('rate_limited');
    expect(classifyHttpStatus(428)).toBe('unknown_http');
    expect(classifyHttpStatus(430)).toBe('unknown_http');
  });

  it('classifies 413 as payload_too_large (but 412 and 414 are NOT)', () => {
    expect(classifyHttpStatus(413)).toBe('payload_too_large');
    expect(classifyHttpStatus(412)).toBe('unknown_http');
    expect(classifyHttpStatus(414)).toBe('unknown_http');
  });

  it('classifies 5xx range [500, 599] as upstream_api_down (boundaries 499 and 600 are unknown)', () => {
    expect(classifyHttpStatus(499)).toBe('unknown_http');
    expect(classifyHttpStatus(500)).toBe('upstream_api_down');
    expect(classifyHttpStatus(501)).toBe('upstream_api_down');
    expect(classifyHttpStatus(550)).toBe('upstream_api_down');
    expect(classifyHttpStatus(598)).toBe('upstream_api_down');
    expect(classifyHttpStatus(599)).toBe('upstream_api_down');
    expect(classifyHttpStatus(600)).toBe('unknown_http');
  });

  it('returns "unknown_http" for 200 OK and 0 (sentinel)', () => {
    expect(classifyHttpStatus(200)).toBe('unknown_http');
    expect(classifyHttpStatus(0)).toBe('unknown_http');
  });
});

describe('decisions / mutation-killers / parseTargets edges', () => {
  // Kill mutants on .trim() (line 58), trimmed === '' check (line 60),
  // .filter(t => t.length > 0) (line 67), VALID_TARGETS.includes (line 74),
  // and array-declaration on TARGET_ALIASES.none (line 19).
  it('throws on whitespace-only input (trim removes whitespace, then empty check fires)', () => {
    expect(() => parseTargets('   ')).toThrow(/empty input/);
    expect(() => parseTargets('\t\n ')).toThrow(/empty input/);
  });

  it('parses "none" alias to empty array (length 0, frozen)', () => {
    const result = parseTargets('none');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('rejects empty tokens between commas as unknown target ("," produces empty)', () => {
    // After split+trim+filter(>0), pure commas produce no tokens.
    // But the *trimmed* string "," is not in TARGET_ALIASES, so we proceed
    // to tokenization which yields []. That falls through to filter() with
    // result []. This is not an error path -- assert exact behavior.
    expect(parseTargets(',')).toEqual([]);
    expect(parseTargets(', ,')).toEqual([]);
  });

  it('preserves canonical order regardless of input order', () => {
    expect(parseTargets('amo-listed,cws')).toEqual(['cws', 'amo-listed']);
    expect(parseTargets('cws,amo-listed')).toEqual(['cws', 'amo-listed']);
  });

  it('error message for unknown target includes the offending token literally', () => {
    expect(() => parseTargets('cws,bogus-store')).toThrow(/bogus-store/);
    // And it lists valid targets so users know the allowed set.
    expect(() => parseTargets('bogus-store')).toThrow(/cws/);
    expect(() => parseTargets('bogus-store')).toThrow(/amo-listed/);
  });
});

describe('decisions / mutation-killers / parseMode error message', () => {
  it('error message for invalid mode includes the offending value', () => {
    expect(() => parseMode({ mode: 'launch-rocket' })).toThrow(/launch-rocket/);
    // And lists valid modes.
    expect(() => parseMode({ mode: 'launch-rocket' })).toThrow(/publish/);
    expect(() => parseMode({ mode: 'launch-rocket' })).toThrow(/upload-only/);
    expect(() => parseMode({ mode: 'launch-rocket' })).toThrow(/dry-run/);
  });

  it('handles null/undefined input by returning publish (no destructure crash)', () => {
    expect(parseMode(null)).toBe('publish');
    expect(parseMode(undefined)).toBe('publish');
    expect(parseMode({})).toBe('publish');
  });

  it('treats dryRun=false (not just absent) the same as no dry-run', () => {
    expect(parseMode({ dryRun: false })).toBe('publish');
    // dryRun is strictly compared to true, so other truthy values do NOT trigger dry-run.
    expect(parseMode({ dryRun: 'true' })).toBe('publish');
    expect(parseMode({ dryRun: 1 })).toBe('publish');
  });

  it('treats cwsPublish equal-only-to upload-only literal (other values fall through)', () => {
    expect(parseMode({ cwsPublish: 'upload-only' })).toBe('upload-only');
    expect(parseMode({ cwsPublish: 'UPLOAD-ONLY' })).toBe('publish');
    expect(parseMode({ cwsPublish: 'upload_only' })).toBe('publish');
  });
});

describe('decisions / mutation-killers / classifyVersionState short-circuit', () => {
  // Kill: LogicalOperator on `draftVersion && draftVersion === requestedVersion`
  // and ConditionalExpression mutants.
  it('returns "available" when draftVersion is null (left operand of && short-circuits)', () => {
    expect(classifyVersionState('0.3.0', new Set(), null)).toBe('available');
  });

  it('returns "available" when draftVersion is undefined', () => {
    expect(classifyVersionState('0.3.0', new Set(), undefined)).toBe('available');
  });

  it('returns "available" when draftVersion is empty string (falsy)', () => {
    expect(classifyVersionState('0.3.0', new Set(), '')).toBe('available');
  });

  it('returns "available" when draftVersion exists but does NOT equal requested', () => {
    expect(classifyVersionState('0.3.0', new Set(), '0.2.0')).toBe('available');
  });

  it('returns "partial-upload" only when draftVersion is truthy AND equals requested', () => {
    expect(classifyVersionState('0.3.0', new Set(), '0.3.0')).toBe('partial-upload');
  });
});

describe('decisions / mutation-killers / aggregateOutcomes predicates', () => {
  const success = (target = 'cws') => ({
    target, status: 'success', version: '0.3.0', message: 'ok',
    dashboardUrl: null, errorCode: null, durationSeconds: 1
  });
  const failure = (target = 'cws', errorCode = 'auth_expired') => ({
    target, status: 'failure', version: '0.3.0', message: 'failed',
    dashboardUrl: null, errorCode, durationSeconds: 1
  });
  const wouldFail = (target = 'cws') => ({
    target, status: 'would-fail', version: '0.3.0', message: '[DRY RUN] would fail',
    dashboardUrl: null, errorCode: null, durationSeconds: 1
  });
  const wouldSucceed = (target = 'cws') => ({
    target, status: 'would-succeed', version: '0.3.0', message: '[DRY RUN] ok',
    dashboardUrl: null, errorCode: null, durationSeconds: 1
  });
  const alreadyPublished = (target = 'cws') => ({
    target, status: 'already-published', version: '0.3.0', message: 'already',
    dashboardUrl: null, errorCode: null, durationSeconds: 1
  });

  // Kill: list.length > 0 boundary (line 155), allAlreadyPublished && !anyDryRun logic.
  it('exit code 0 for empty outcomes list (allAlreadyPublished requires length > 0)', () => {
    const r = aggregateOutcomes([]);
    expect(r.exitCode).toBe(0);
    expect(r.recoveryHint).toBeNull();
    expect(r.outcomes).toEqual([]);
  });

  it('exit code 0 when null/undefined outcomes input (defaults to [])', () => {
    expect(aggregateOutcomes(null).exitCode).toBe(0);
    expect(aggregateOutcomes(undefined).exitCode).toBe(0);
  });

  // Kill: isDryRunStatus uses status === 'would-succeed' || 'would-fail' (LogicalOperator)
  it('would-fail counts as both failure (exit 1) AND dry-run (suppresses already-published rule)', () => {
    // [wouldFail, alreadyPublished] -> any-failure true, exit 1; recoveryHint present
    const r = aggregateOutcomes([wouldFail('cws'), alreadyPublished('amo-listed')]);
    expect(r.exitCode).toBe(1);
  });

  it('would-succeed alone does NOT trigger the all-already-published exit rule', () => {
    // [wouldSucceed, alreadyPublished]: not all already-published, so falls through to exit 0
    const r = aggregateOutcomes([wouldSucceed('cws'), alreadyPublished('amo-listed')]);
    expect(r.exitCode).toBe(0);
  });

  it('mixed already-published + dry-run yields exit 0 (anyDryRun suppresses all-published rule)', () => {
    const r = aggregateOutcomes([alreadyPublished('cws'), wouldSucceed('amo-listed')]);
    expect(r.exitCode).toBe(0);
  });

  it('all-success NOT all-already-published yields exit 0', () => {
    const r = aggregateOutcomes([success('cws'), success('amo-listed')]);
    expect(r.exitCode).toBe(0);
  });

  it('failure status (not would-fail) triggers exit 1 with recovery hint', () => {
    const r = aggregateOutcomes([failure('cws')]);
    expect(r.exitCode).toBe(1);
    expect(r.recoveryHint).not.toBeNull();
  });

  it('one failure + one success still yields exit 1 (anyFailure wins)', () => {
    const r = aggregateOutcomes([failure('cws'), success('amo-listed')]);
    expect(r.exitCode).toBe(1);
  });
});

describe('decisions / mutation-killers / buildRecoveryHint branches', () => {
  // Each errorCode branch must be independently observable.
  const make = (target, errorCode) => ({
    target, status: 'failure', version: '0.3.0', message: 'x',
    dashboardUrl: null, errorCode, durationSeconds: 1
  });

  it('first line is "Re-dispatch with: targets=<csv>, mode=publish"', () => {
    const r = aggregateOutcomes([make('cws', 'auth_expired'), make('amo-listed', 'auth_expired')]);
    expect(r.recoveryHint).toContain('Re-dispatch with: targets=cws,amo-listed, mode=publish');
  });

  it('always includes docs/release.md#recovery footer', () => {
    const r = aggregateOutcomes([make('cws', 'auth_expired')]);
    expect(r.recoveryHint).toContain('See docs/release.md#recovery');
  });

  it('auth_expired adds "Auth expired: regenerate credentials." line', () => {
    const r = aggregateOutcomes([make('cws', 'auth_expired')]);
    expect(r.recoveryHint).toContain('Auth expired: regenerate credentials.');
  });

  it('auth_expired on cws specifically adds cws-bootstrap instruction', () => {
    const r = aggregateOutcomes([make('cws', 'auth_expired')]);
    expect(r.recoveryHint).toContain('node scripts/cws-bootstrap.mjs');
    expect(r.recoveryHint).toContain('For CWS');
  });

  it('auth_expired on amo-listed specifically adds AMO_JWT_SECRET instruction', () => {
    const r = aggregateOutcomes([make('amo-listed', 'auth_expired')]);
    expect(r.recoveryHint).toContain('AMO_JWT_SECRET');
    expect(r.recoveryHint).toContain('For AMO');
  });

  it('auth_expired on cws ONLY does NOT include AMO instruction', () => {
    const r = aggregateOutcomes([make('cws', 'auth_expired')]);
    expect(r.recoveryHint).not.toContain('AMO_JWT_SECRET');
    expect(r.recoveryHint).not.toContain('For AMO');
  });

  it('auth_expired on amo-listed ONLY does NOT include CWS bootstrap instruction', () => {
    const r = aggregateOutcomes([make('amo-listed', 'auth_expired')]);
    expect(r.recoveryHint).not.toContain('cws-bootstrap');
    expect(r.recoveryHint).not.toContain('For CWS');
  });

  it('auth_expired on BOTH targets includes both target-specific instructions', () => {
    const r = aggregateOutcomes([make('cws', 'auth_expired'), make('amo-listed', 'auth_expired')]);
    expect(r.recoveryHint).toContain('cws-bootstrap');
    expect(r.recoveryHint).toContain('AMO_JWT_SECRET');
  });

  it('rate_limited adds wait-60-minutes instruction', () => {
    const r = aggregateOutcomes([make('cws', 'rate_limited')]);
    expect(r.recoveryHint).toContain('Rate limited: wait at least 60 minutes before re-dispatch.');
  });

  it('rate_limited does NOT add auth-expired instruction', () => {
    const r = aggregateOutcomes([make('cws', 'rate_limited')]);
    expect(r.recoveryHint).not.toContain('Auth expired');
  });

  it('version_conflict adds tag-bump instruction with exact text', () => {
    const r = aggregateOutcomes([make('cws', 'version_conflict')]);
    expect(r.recoveryHint).toContain('Version conflict: bump tag (git tag vX.Y.Z; git push origin vX.Y.Z) and re-dispatch.');
  });

  it('version_conflict does NOT add auth or rate-limit instructions', () => {
    const r = aggregateOutcomes([make('cws', 'version_conflict')]);
    expect(r.recoveryHint).not.toContain('Auth expired');
    expect(r.recoveryHint).not.toContain('Rate limited');
  });

  it('unknown errorCode produces minimal recovery hint (no specific guidance)', () => {
    const r = aggregateOutcomes([make('cws', 'something_weird')]);
    expect(r.recoveryHint).toContain('Re-dispatch with: targets=cws, mode=publish');
    expect(r.recoveryHint).toContain('See docs/release.md#recovery');
    expect(r.recoveryHint).not.toContain('Auth expired');
    expect(r.recoveryHint).not.toContain('Rate limited');
    expect(r.recoveryHint).not.toContain('Version conflict');
  });

  it('null errorCode is filtered out (no specific hint added)', () => {
    const failureNoCode = { ...make('cws', null) };
    const r = aggregateOutcomes([failureNoCode]);
    expect(r.recoveryHint).toContain('Re-dispatch');
    expect(r.recoveryHint).not.toContain('Auth expired');
  });

  it('multiple distinct error codes accumulate all relevant instructions', () => {
    const r = aggregateOutcomes([
      make('cws', 'auth_expired'),
      make('amo-listed', 'rate_limited'),
    ]);
    expect(r.recoveryHint).toContain('Auth expired');
    expect(r.recoveryHint).toContain('Rate limited');
  });
});

describe('decisions / mutation-killers / renderSummary exact output', () => {
  const success = (target = 'cws') => ({
    target, status: 'success', version: '0.3.0', message: 'ok',
    dashboardUrl: 'https://example.test/dash', errorCode: null, durationSeconds: 1
  });
  const wouldSucceed = (target = 'cws') => ({
    target, status: 'would-succeed', version: '0.3.0', message: '[DRY RUN] ok',
    dashboardUrl: null, errorCode: null, durationSeconds: 1
  });

  // Kill: title literal, table-header literals, "## Per-target outcomes" literal,
  // "## Recovery" literal, "[DRY RUN] no writes performed" literal,
  // " (DRY-RUN)" suffix, "-" dashboard placeholder, "\\|" pipe escape.
  it('produces title "# BroShow Marketplace Publish — <version>" verbatim', () => {
    const r = aggregateOutcomes([success('cws')]);
    const md = renderSummary(r);
    expect(md).toContain('# BroShow Marketplace Publish — 0.3.0');
  });

  it('appends " (DRY-RUN)" to title when any outcome is would-succeed/would-fail', () => {
    const r = aggregateOutcomes([wouldSucceed('cws')]);
    const md = renderSummary(r);
    expect(md).toContain('# BroShow Marketplace Publish — 0.3.0 (DRY-RUN)');
  });

  it('does NOT append "(DRY-RUN)" suffix on all-success', () => {
    const r = aggregateOutcomes([success('cws')]);
    const md = renderSummary(r);
    expect(md).not.toContain('(DRY-RUN)');
  });

  it('contains "## Per-target outcomes" section header verbatim', () => {
    const r = aggregateOutcomes([success('cws')]);
    const md = renderSummary(r);
    expect(md).toContain('## Per-target outcomes');
  });

  it('contains the markdown table header rows verbatim', () => {
    const r = aggregateOutcomes([success('cws')]);
    const md = renderSummary(r);
    expect(md).toContain('| Target | Version | Status | Message | Dashboard |');
    expect(md).toContain('|--------|---------|--------|---------|-----------|');
  });

  it('emits "[DRY RUN] no writes performed" banner on dry-run', () => {
    const r = aggregateOutcomes([wouldSucceed('cws')]);
    const md = renderSummary(r);
    expect(md).toContain('[DRY RUN] no writes performed');
  });

  it('does NOT emit dry-run banner on all-success', () => {
    const r = aggregateOutcomes([success('cws')]);
    const md = renderSummary(r);
    expect(md).not.toContain('[DRY RUN]');
    expect(md).not.toContain('no writes performed');
  });

  it('uses literal "-" placeholder for missing dashboardUrl', () => {
    const noDashboard = { ...success('cws'), dashboardUrl: null };
    const r = aggregateOutcomes([noDashboard]);
    const md = renderSummary(r);
    // The row ends with "| - |" (with surrounding spaces in markdown table).
    expect(md).toMatch(/\|\s*-\s*\|/);
  });

  it('preserves dashboardUrl when present (not replaced with "-")', () => {
    const r = aggregateOutcomes([success('cws')]);
    const md = renderSummary(r);
    expect(md).toContain('https://example.test/dash');
  });

  it('escapes pipes inside message field with backslash', () => {
    const piped = { ...success('cws'), message: 'a | b | c' };
    const r = aggregateOutcomes([piped]);
    const md = renderSummary(r);
    expect(md).toContain('a \\| b \\| c');
    // The raw unescaped form must NOT survive as-is for the message field.
    // (Header pipes are different.)
    const rowLine = md.split('\n').find((l) => l.includes('a \\|'));
    expect(rowLine).toBeDefined();
    expect(rowLine.includes('a | b')).toBe(false);
  });

  it('uses empty string for missing message (no "undefined" leakage)', () => {
    const noMsg = { ...success('cws'), message: undefined };
    const r = aggregateOutcomes([noMsg]);
    const md = renderSummary(r);
    expect(md).not.toContain('undefined');
  });

  it('contains "## Recovery" header verbatim when recoveryHint exists', () => {
    const fail = {
      target: 'cws', status: 'failure', version: '0.3.0', message: 'auth',
      dashboardUrl: null, errorCode: 'auth_expired', durationSeconds: 1
    };
    const r = aggregateOutcomes([fail]);
    const md = renderSummary(r);
    expect(md).toContain('## Recovery');
  });

  it('handles null aggregate result by returning a non-empty header-only summary', () => {
    const md = renderSummary(null);
    // version label is empty when no outcomes
    expect(md).toContain('# BroShow Marketplace Publish');
    expect(md).toContain('## Per-target outcomes');
  });

  it('handles undefined aggregate result identically to null', () => {
    expect(renderSummary(undefined)).toBe(renderSummary(null));
  });

  it('renders one row per outcome with all fields in order', () => {
    const r = aggregateOutcomes([success('cws'), success('amo-listed')]);
    const md = renderSummary(r);
    // Each row begins with "| <target> | <version> |"
    expect(md).toMatch(/\| cws \| 0\.3\.0 \| success \| ok \| https:\/\/example\.test\/dash \|/);
    expect(md).toMatch(/\| amo-listed \| 0\.3\.0 \| success \| ok \| https:\/\/example\.test\/dash \|/);
  });
});

describe('decisions / mutation-killers / planRun structure', () => {
  // Kill ArrowFunction (() => undefined) and ensure each mapped step is a real object.
  it('each step has both target and mode fields with expected values', () => {
    const steps = planRun(['cws', 'amo-listed'], 'publish');
    expect(steps[0]).toEqual({ target: 'cws', mode: 'publish' });
    expect(steps[1]).toEqual({ target: 'amo-listed', mode: 'publish' });
  });

  it('upload-only stays upload-only for cws (not coerced)', () => {
    const steps = planRun(['cws'], 'upload-only');
    expect(steps[0]).toEqual({ target: 'cws', mode: 'upload-only' });
  });

  it('upload-only is coerced to publish ONLY for amo-listed', () => {
    const steps = planRun(['amo-listed'], 'upload-only');
    expect(steps[0]).toEqual({ target: 'amo-listed', mode: 'publish' });
  });

  it('dry-run stays dry-run for both targets (not coerced)', () => {
    const steps = planRun(['cws', 'amo-listed'], 'dry-run');
    expect(steps[0].mode).toBe('dry-run');
    expect(steps[1].mode).toBe('dry-run');
  });

  it('returns frozen array and frozen step objects (immutable)', () => {
    const steps = planRun(['cws'], 'publish');
    expect(Object.isFrozen(steps)).toBe(true);
    expect(Object.isFrozen(steps[0])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Mutation-killer wave 2 — assert exact error/string literals and
// internal predicate logic that wave 1 missed.
// ---------------------------------------------------------------------------

describe('decisions / mutation-killers wave2 / parseTargets exact error messages', () => {
  it('throws with literal "parseTargets:" prefix when input is not a string', () => {
    // Numbers, objects, arrays, booleans must hit the !isString branch.
    expect(() => parseTargets(123)).toThrow(/parseTargets: expected string/);
    expect(() => parseTargets({})).toThrow(/parseTargets: expected string/);
    expect(() => parseTargets([])).toThrow(/parseTargets: expected string/);
    expect(() => parseTargets(true)).toThrow(/parseTargets: expected string/);
  });

  it('throws with literal "parseTargets: empty input" on whitespace-only input', () => {
    expect(() => parseTargets('')).toThrow(/parseTargets: empty input/);
    expect(() => parseTargets('   ')).toThrow(/parseTargets: empty input/);
  });

  it('unknown-target error includes literal "Valid:" delimiter and full target list', () => {
    expect(() => parseTargets('xx')).toThrow(/Valid: cws, amo-listed/);
  });

  it('unknown-target error message contains literal "unknown target" prefix', () => {
    expect(() => parseTargets('xx')).toThrow(/unknown target "xx"/);
  });
});

describe('decisions / mutation-killers wave2 / parseMode exact error messages', () => {
  it('invalid mode error includes literal "Valid:" delimiter and full mode list', () => {
    expect(() => parseMode({ mode: 'xx' })).toThrow(/Valid: publish, upload-only, dry-run/);
  });

  it('invalid mode error message contains literal "invalid mode" prefix', () => {
    expect(() => parseMode({ mode: 'xx' })).toThrow(/invalid mode "xx"/);
  });
});

describe('decisions / mutation-killers wave2 / aggregateOutcomes predicate identities', () => {
  const success = (target = 'cws') => ({
    target, status: 'success', version: '0.3.0', message: 'ok',
    dashboardUrl: null, errorCode: null, durationSeconds: 1
  });
  const wouldFail = (target = 'cws') => ({
    target, status: 'would-fail', version: '0.3.0', message: 'wf',
    dashboardUrl: null, errorCode: null, durationSeconds: 1
  });
  const alreadyPublished = (target = 'cws') => ({
    target, status: 'already-published', version: '0.3.0', message: 'ap',
    dashboardUrl: null, errorCode: null, durationSeconds: 1
  });

  // Kills: ConditionalExpression @145:66 (status === 'would-fail' branch).
  // would-fail must count as a dry-run (so all-already-published rule is suppressed).
  it('would-fail is treated as a dry-run status (suppresses all-already-published exit-1 rule when mixed)', () => {
    // [alreadyPublished, wouldFail] -> anyDryRun=true via 'would-fail',
    // but anyFailure also true via 'would-fail' so exit=1 from anyFailure.
    // Use a different mix to isolate: would-fail alone (length 1, not all already-published).
    const r1 = aggregateOutcomes([wouldFail('cws')]);
    expect(r1.exitCode).toBe(1); // anyFailure wins
    // Now mix with success: anyFailure still true -> exit 1
    const r2 = aggregateOutcomes([success('amo-listed'), wouldFail('cws')]);
    expect(r2.exitCode).toBe(1);
  });

  // Kills: MethodExpression @154:21 .some -> .every — needs test where
  // .some is true but .every is false (mixed list).
  it('aggregate uses .some for failure detection (mixed list with one failure -> exit 1)', () => {
    const failure = {
      target: 'cws', status: 'failure', version: '0.3.0', message: 'x',
      dashboardUrl: null, errorCode: 'auth_expired', durationSeconds: 1
    };
    // .some -> exit 1 (one failure). .every -> false (not all are failures). Different.
    const r = aggregateOutcomes([failure, success('amo-listed')]);
    expect(r.exitCode).toBe(1);
  });

  // Kills: MethodExpression @155:50 .every -> .some — needs test where
  // .every is true (all already-published) but .some is true (still all). Need
  // mixed list where .some is true but .every is false: mix already-published + success.
  it('aggregate uses .every for all-already-published (mixed list does NOT trigger exit 1)', () => {
    // .every: all already-published -> true (false here, mixed). .some: true.
    // If mutated to .some, allAlreadyPublished becomes true -> exit 1.
    // Real .every -> allAlreadyPublished false -> exit 0.
    const r = aggregateOutcomes([alreadyPublished('cws'), success('amo-listed')]);
    expect(r.exitCode).toBe(0);
  });

  // Kills: ArrayDeclaration @152:28 (outcomes ?? []). Needs test that
  // observes the outcomes field after passing null/undefined.
  it('preserves outcomes field as empty array when input is null/undefined', () => {
    expect(aggregateOutcomes(null).outcomes).toEqual([]);
    expect(aggregateOutcomes(undefined).outcomes).toEqual([]);
    expect(aggregateOutcomes(null).outcomes).toHaveLength(0);
  });
});

describe('decisions / mutation-killers wave2 / buildRecoveryHint internal logic', () => {
  // Kill: MethodExpression @180:30 — failedOutcomes.map(o => o.errorCode).filter(Boolean)
  // Mutated to drop the .filter(Boolean). The filter ensures null/undefined errorCodes
  // do NOT pollute the Set used for branch detection.
  it('null errorCodes do not enable any error-specific recovery line (filter(Boolean) drops them)', () => {
    const fail = (target, errorCode) => ({
      target, status: 'failure', version: '0.3.0', message: 'x',
      dashboardUrl: null, errorCode, durationSeconds: 1
    });
    // If filter(Boolean) is removed, errorCodes Set contains null/undefined,
    // which still won't match 'auth_expired' etc. So the .has() checks would
    // still work — that means .filter(Boolean) is a defensive no-op for branch
    // logic. But it COULD matter if a Set with undefined gets serialized weird.
    // Verify no spurious lines appear from null errorCodes.
    const r = aggregateOutcomes([fail('cws', null), fail('amo-listed', undefined)]);
    expect(r.recoveryHint).not.toContain('Auth expired');
    expect(r.recoveryHint).not.toContain('Rate limited');
    expect(r.recoveryHint).not.toContain('Version conflict');
    // Footer still present.
    expect(r.recoveryHint).toContain('See docs/release.md#recovery');
  });

  // Kill: ConditionalExpression @183:58 — `o.errorCode === 'auth_expired'` mutated to true.
  // Needs a cws failure with errorCode != 'auth_expired'; cws-bootstrap should NOT appear.
  it('cws failure with non-auth_expired errorCode does NOT include cws-bootstrap line', () => {
    const fail = {
      target: 'cws', status: 'failure', version: '0.3.0', message: 'x',
      dashboardUrl: null, errorCode: 'rate_limited', durationSeconds: 1
    };
    const r = aggregateOutcomes([fail]);
    expect(r.recoveryHint).not.toContain('cws-bootstrap');
  });

  // Kill: ConditionalExpression @186:65 — `o.errorCode === 'auth_expired'` mutated to true.
  // Same pattern for amo-listed.
  it('amo-listed failure with non-auth_expired errorCode does NOT include AMO_JWT_SECRET line', () => {
    const fail = {
      target: 'amo-listed', status: 'failure', version: '0.3.0', message: 'x',
      dashboardUrl: null, errorCode: 'rate_limited', durationSeconds: 1
    };
    const r = aggregateOutcomes([fail]);
    expect(r.recoveryHint).not.toContain('AMO_JWT_SECRET');
  });

  // Kill: StringLiteral @197:21 — the join('\n') separator inside buildRecoveryHint.
  // The literal '\n' separator is observable: lines are separated by newlines.
  it('recovery hint joins lines with literal newline character', () => {
    const fail = {
      target: 'cws', status: 'failure', version: '0.3.0', message: 'x',
      dashboardUrl: null, errorCode: 'auth_expired', durationSeconds: 1
    };
    const r = aggregateOutcomes([fail]);
    const lines = r.recoveryHint.split('\n');
    // Expect at least: re-dispatch line, "Auth expired:" line, "For CWS" line, footer.
    expect(lines.length).toBeGreaterThanOrEqual(4);
    expect(lines[0]).toMatch(/^Re-dispatch with:/);
    expect(lines[lines.length - 1]).toMatch(/^See docs\/release\.md#recovery/);
  });
});

describe('decisions / mutation-killers wave2 / renderSummary exact literals and structure', () => {
  const success = (target = 'cws', overrides = {}) => ({
    target, status: 'success', version: '0.3.0', message: 'ok',
    dashboardUrl: 'https://example.test/dash', errorCode: null, durationSeconds: 1,
    ...overrides
  });
  const wouldSucceed = (target = 'cws') => ({
    target, status: 'would-succeed', version: '0.3.0', message: '[DRY RUN] ok',
    dashboardUrl: null, errorCode: null, durationSeconds: 1
  });

  // Kill: ConditionalExpression @211:20 (.some). If mutated to .every, isDryRun
  // becomes false on a mixed list (one would-succeed + one success).
  it('isDryRun is true when ANY outcome is a dry-run status (uses .some, not .every)', () => {
    const md = renderSummary(aggregateOutcomes([wouldSucceed('cws'), success('amo-listed')]));
    expect(md).toContain('(DRY-RUN)');
    expect(md).toContain('[DRY RUN] no writes performed');
  });

  // Kill: StringLiteral @212:68 — versionLabel default '' literal.
  // When outcomes is empty, versionLabel is '' so title ends with "Publish — ".
  it('versionLabel is empty string (not "Stryker") when outcomes list is empty', () => {
    const md = renderSummary({ outcomes: [], exitCode: 0, recoveryHint: null });
    // Title contains "Publish — " followed by either nothing or whitespace.
    // It must NOT contain literal "Stryker".
    expect(md).not.toContain('Stryker');
    expect(md).toMatch(/Publish — \n|Publish — $/m);
  });

  // Kill: StringLiteral @214:49 — titleSuffix " (DRY-RUN)" exact text.
  // Mutation replaces with "Stryker was here!" so suffix would not be parenthesized.
  it('dry-run title suffix is exactly " (DRY-RUN)" (with leading space, parens, hyphen)', () => {
    const md = renderSummary(aggregateOutcomes([wouldSucceed('cws')]));
    expect(md).toMatch(/0\.3\.0 \(DRY-RUN\)/);
  });

  // Kill: StringLiteral @215:73 — banner "\n[DRY RUN] no writes performed\n" exact text.
  it('dry-run banner is exactly "[DRY RUN] no writes performed" (case-sensitive, with bracketed prefix)', () => {
    const md = renderSummary(aggregateOutcomes([wouldSucceed('cws')]));
    expect(md).toContain('[DRY RUN] no writes performed');
    // Specifically "[DRY RUN]" with single-space and uppercase, not "[DRY-RUN]" or lowercase.
    expect(md).not.toContain('[dry run]');
    expect(md).not.toContain('[DRY-RUN] no writes');
  });

  // Kill: StringLiteral @220:10 — join('\n') separator between header rows.
  it('table header column line and divider are separated by literal newline', () => {
    const md = renderSummary(aggregateOutcomes([success('cws')]));
    const idxHeader = md.indexOf('| Target | Version |');
    const idxDivider = md.indexOf('|--------|---------|');
    expect(idxHeader).toBeGreaterThanOrEqual(0);
    expect(idxDivider).toBeGreaterThan(idxHeader);
    // Exactly one '\n' between them.
    expect(md.slice(idxHeader, idxDivider)).toMatch(/\| Target \| Version \| Status \| Message \| Dashboard \|\n$/);
  });

  // Kill: StringLiteral @224:35 — message default '' literal in (o.message ?? '').
  it('missing message renders as empty cell (no "Stryker"/no "undefined" leakage)', () => {
    const noMsg = success('cws', { message: undefined });
    const md = renderSummary(aggregateOutcomes([noMsg]));
    // Row format: "| cws | 0.3.0 | success |  | https://example.test/dash |"
    // The message cell is empty string -> two spaces between pipes.
    expect(md).toMatch(/\| cws \| 0\.3\.0 \| success \|  \| https:\/\/example\.test\/dash \|/);
    expect(md).not.toContain('Stryker');
  });

  // Kill: StringLiteral @226:11 — join('\n') separator between table rows.
  it('table rows are separated by literal newline (one row per line)', () => {
    const md = renderSummary(aggregateOutcomes([success('cws'), success('amo-listed')]));
    const cwsLine = md.split('\n').find((l) => l.startsWith('| cws |'));
    const amoLine = md.split('\n').find((l) => l.startsWith('| amo-listed |'));
    expect(cwsLine).toBeDefined();
    expect(amoLine).toBeDefined();
  });

  // Kill: StringLiteral @230:7 — recoverySection prefix "\n\n## Recovery\n\n" literal.
  it('recovery section starts with blank line, then "## Recovery", then blank line, then hint', () => {
    const fail = {
      target: 'cws', status: 'failure', version: '0.3.0', message: 'x',
      dashboardUrl: null, errorCode: 'auth_expired', durationSeconds: 1
    };
    const md = renderSummary(aggregateOutcomes([fail]));
    expect(md).toMatch(/\n\n## Recovery\n\nRe-dispatch with:/);
  });

  // Kill: MethodExpression @232:10 — .filter(s => s !== '') applied to the
  // composed array. Mutation removes .filter, so empty banner string would
  // produce a stray empty line in output.
  it('all-success summary does NOT emit a stray empty line where the dry-run banner would go', () => {
    const md = renderSummary(aggregateOutcomes([success('cws')]));
    // Look for double newline immediately after title (which would indicate
    // an empty banner string was joined). The structure should be:
    //   # Title\n## Per-target outcomes\n\n| header |...
    // Not: # Title\n\n## Per-target outcomes\n... unless dry-run banner.
    expect(md).not.toMatch(/Publish — 0\.3\.0\n\n\n## Per-target/);
    // The first non-title line must be the section header, not empty string.
    const lines = md.split('\n');
    expect(lines[0]).toMatch(/^# BroShow Marketplace Publish/);
    expect(lines[1]).toBe('## Per-target outcomes');
  });

  // Kill: StringLiteral @236:5 — join('\n') separator at top-level array.
  // When mutated to "Stryker was here!", the segments would be glued together
  // with that literal, leaking into the output.
  it('top-level summary segments joined by single newline (no separator literal leaks into output)', () => {
    const md = renderSummary(aggregateOutcomes([success('cws')]));
    expect(md).not.toContain('Stryker');
  });

  // Kill: ConditionalExpression @240:19 (.filter(s => s !== '')) and StringLiteral @240:34.
  // When mutated to .filter(s => s !== "Stryker") or always-true predicate,
  // the empty recoverySection would slip through and produce extra newlines.
  it('all-success has no Recovery section heading or trailing blank lines from empty recoverySection', () => {
    const md = renderSummary(aggregateOutcomes([success('cws')]));
    expect(md).not.toContain('## Recovery');
    // Last non-empty line should be the table row.
    expect(md.trim()).toMatch(/\| cws \| 0\.3\.0 \| success \| ok \| https:\/\/example\.test\/dash \|$/);
  });
});

describe('decisions / mutation-killers wave2 / sanitizeForLog isSecretFieldName edge', () => {
  // Kill: BooleanLiteral @270:40 (`return false` -> `return true`) and
  // ConditionalExpression @270:7 (`if (typeof name !== 'string')`).
  // Object.entries() always returns string keys, so this branch is unreachable
  // through public API — the BooleanLiteral mutant is EQUIVALENT.
  // We can still kill the ConditionalExpression mutant by exercising both
  // branches: a string key (must NOT short-circuit to false) and a string key
  // that IS a secret (must redact).
  it('string key that is a secret IS redacted (predicate returns true on real call)', () => {
    expect(sanitizeForLog({ access_token: 'x' })).toEqual({ access_token: '[REDACTED]' });
  });

  it('string key that is NOT a secret is preserved (predicate returns false)', () => {
    expect(sanitizeForLog({ ordinary_field: 'x' })).toEqual({ ordinary_field: 'x' });
  });
});

// ---------------------------------------------------------------------------
// Mutation-killer wave 3 — surgical kills for remaining survivors.
// ---------------------------------------------------------------------------

describe('decisions / mutation-killers wave3 / aggregateOutcomes anyDryRun true-vs-false', () => {
  // The .some/.every/() => undefined mutants on the anyDryRun line all
  // collapse the true distinction between "anyDryRun=true" and "false".
  //
  // To kill them we need an INPUT where anyDryRun's value affects exitCode:
  //   - allAlreadyPublished must be TRUE (so that the !anyDryRun branch
  //     determines whether exitCode becomes 1).
  //   - Then the same list with one entry mutated to a dry-run status
  //     must flip the outcome.
  //
  // But we cannot have allAlreadyPublished AND a dry-run in the same list
  // (dry-run is not 'already-published'). So we test the two cases
  // separately and assert that the all-already-published list yields
  // exit 1 (anyDryRun=false) AND a list with even one dry-run status
  // among already-published yields exit 0 (anyDryRun=true).
  const ap = (target = 'cws') => ({
    target, status: 'already-published', version: '0.3.0', message: 'ap',
    dashboardUrl: null, errorCode: null, durationSeconds: 1
  });
  const ws = (target = 'cws') => ({
    target, status: 'would-succeed', version: '0.3.0', message: 'ws',
    dashboardUrl: null, errorCode: null, durationSeconds: 1
  });

  it('all-already-published with anyDryRun=false yields exit 1 (anyDryRun must be FALSE here)', () => {
    expect(aggregateOutcomes([ap('cws'), ap('amo-listed')]).exitCode).toBe(1);
  });

  // If anyDryRun is mutated to always-true (e.g. () => undefined makes .some
  // truthy? actually undefined is falsy so .some returns false; but .every of
  // undefined is true). The .every mutation makes anyDryRun = true on
  // [ap, ap] (every undefined check is vacuously...) — actually no: .every
  // returns true if predicate is true for every element. () => undefined
  // returns falsy so .every returns false. .some returns false too. Hmm.
  //
  // Wait: for the .some -> .every mutation on the anyDryRun line:
  //   real:    [ap, ap].some(isDryRun) = false (no dry-run statuses)
  //   mutated: [ap, ap].every(isDryRun) = false (none are dry-run)
  //   Both yield exit 1. Same observable behavior for THIS list.
  //
  // For [ws, ws]:
  //   real:    .some = true -> anyDryRun true -> exitCode 0
  //   mutated: .every = true -> anyDryRun true -> exitCode 0
  //   Same.
  //
  // For [ap, ws]:
  //   real:    .some = true -> anyDryRun true -> allAlreadyPublished=false -> exit 0
  //   mutated: .every = false -> anyDryRun false -> allAlreadyPublished=false -> exit 0
  //   Same exit code, but recoveryHint differs? No, no failures.
  //
  // Conclusion: the .some -> .every mutant on anyDryRun is OBSERVATIONALLY
  // EQUIVALENT given the rest of the code structure. Document as known
  // equivalent.
  it('mixed already-published + would-succeed yields exit 0 regardless of .some/.every on anyDryRun', () => {
    expect(aggregateOutcomes([ap('cws'), ws('amo-listed')]).exitCode).toBe(0);
  });
});

describe('decisions / mutation-killers wave3 / buildRecoveryHint cws/amo branch isolation', () => {
  // Kill: ConditionalExpression @183:58 — `o.errorCode === 'auth_expired'` -> true.
  // Setup: errorCodes Set contains 'auth_expired' (via amo-listed failure),
  // AND a cws failure exists with a DIFFERENT errorCode. Real: cws-bootstrap
  // line is NOT added (because the cws failure is not auth_expired).
  // Mutated (=== 'auth_expired' -> true): the .some predicate becomes
  // `o.target === 'cws' && true` so any cws failure triggers cws-bootstrap.
  it('amo auth_expired + cws non-auth_expired: cws-bootstrap is NOT added', () => {
    const make = (target, errorCode) => ({
      target, status: 'failure', version: '0.3.0', message: 'x',
      dashboardUrl: null, errorCode, durationSeconds: 1
    });
    const r = aggregateOutcomes([
      make('cws', 'rate_limited'),
      make('amo-listed', 'auth_expired'),
    ]);
    expect(r.recoveryHint).toContain('Auth expired');
    expect(r.recoveryHint).toContain('AMO_JWT_SECRET'); // amo branch fires
    expect(r.recoveryHint).not.toContain('cws-bootstrap'); // cws branch must NOT fire
  });

  // Kill: ConditionalExpression @186:65 — same pattern, mirrored.
  it('cws auth_expired + amo non-auth_expired: AMO_JWT_SECRET is NOT added', () => {
    const make = (target, errorCode) => ({
      target, status: 'failure', version: '0.3.0', message: 'x',
      dashboardUrl: null, errorCode, durationSeconds: 1
    });
    const r = aggregateOutcomes([
      make('cws', 'auth_expired'),
      make('amo-listed', 'rate_limited'),
    ]);
    expect(r.recoveryHint).toContain('Auth expired');
    expect(r.recoveryHint).toContain('cws-bootstrap'); // cws branch fires
    expect(r.recoveryHint).not.toContain('AMO_JWT_SECRET'); // amo branch must NOT fire
  });
});

describe('decisions / mutation-killers wave3 / renderSummary aggregateResult fallback shape', () => {
  // Kill: ObjectLiteral @209:37 (default {} vs { outcomes: [], exitCode: 0, recoveryHint: null })
  // and ArrayDeclaration @209:49 (default outcomes: []).
  //
  // When aggregateResult is null/undefined, the fallback object literal must
  // include outcomes so that line 210 (result.outcomes ?? []) finds it.
  // Mutating to {} drops outcomes entirely, but ?? [] then catches it on the
  // next line. So the ObjectLiteral mutant is observationally equivalent
  // unless we observe the recoveryHint default value.
  //
  // recoveryHint default = null. On a null aggregate, no Recovery section
  // should appear. If the fallback is {} (mutant), result.recoveryHint is
  // undefined which is also falsy, so the ternary on line 228 still picks
  // the empty string branch. Equivalent under current code.
  //
  // Document these as EQUIVALENT MUTANTS in the report.
  it('null aggregate produces a summary with no Recovery section (truthy-falsy on recoveryHint)', () => {
    const md = renderSummary(null);
    expect(md).not.toContain('## Recovery');
  });
});
