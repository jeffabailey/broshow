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
