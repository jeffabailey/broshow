// tests/acceptance/marketplace-publishing/milestone-4-failure-recovery.test.mjs
//
// MILESTONE 4 — Per-target failures and recovery via `targets` input.
// Every scenario in this file is @error-path. Together they supply
// 5/12 of the feature's error-path scenarios (>40% target).

import { describe, it, expect, afterEach } from 'vitest';

import { runPublish } from '../../../scripts/publish-orchestrator.effect.mjs';
import { loadEnv } from './fixtures/scenarios.mjs';
import { cwsFakeHelpers } from './fixtures/cws-fake.mjs';
import { amoFakeHelpers } from './fixtures/amo-fake.mjs';

describe('[milestone-4][in-memory][real-io][error-path] failure recovery', () => {
  let ctx;

  afterEach(async () => {
    if (ctx) await ctx.cleanup();
  });

  it('M4-1: Maintainer\'s CWS submission fails with auth_expired but AMO listed succeeds @error-path @us-4 @env:with-stale-cws-token-near-expiry', async () => {
    // GIVEN: CWS refresh token is revoked; AMO is healthy.
    ctx = await loadEnv('with-stale-cws-token-near-expiry');

    // WHEN.
    const result = await runPublish(ctx.env, ctx.deps);

    // THEN: AMO succeeds, CWS fails, orchestrator exits 1, recovery hint targets cws only.
    expect(result.exitCode).toBe(1);
    expect(result.outcomes).toContainEqual(expect.objectContaining({
      target: 'cws', status: 'failure', errorCode: 'auth_expired'
    }));
    expect(result.outcomes).toContainEqual(expect.objectContaining({
      target: 'amo-listed', status: 'success'
    }));
    expect(result.recoveryHint).toMatch(/targets[:=]\s*cws/i);
  });

  it('M4-2: Maintainer\'s AMO listed submission fails with rate_limited but CWS succeeds @error-path @us-4 @env:with-amo-throttle-active', async () => {
    // GIVEN: AMO probe returns 429.
    ctx = await loadEnv('with-amo-throttle-active');

    // WHEN.
    const result = await runPublish(ctx.env, ctx.deps);

    // THEN.
    expect(result.exitCode).toBe(1);
    expect(result.outcomes).toContainEqual(expect.objectContaining({
      target: 'amo-listed', status: 'failure', errorCode: 'rate_limited'
    }));
    expect(result.outcomes).toContainEqual(expect.objectContaining({
      target: 'cws', status: 'success'
    }));
    expect(result.recoveryHint).toMatch(/targets[:=]\s*amo-listed/i);
  });

  it('M4-3: Maintainer\'s CWS upload fails with rate_limited and recovery hint targets cws only @error-path @us-4 @env:with-cws-rate-limit-active', async () => {
    // GIVEN: CWS upload returns 429.
    ctx = await loadEnv('with-cws-rate-limit-active');

    // WHEN.
    const result = await runPublish(ctx.env, ctx.deps);

    // THEN.
    expect(result.exitCode).toBe(1);
    const cwsOutcome = result.outcomes.find(o => o.target === 'cws');
    expect(cwsOutcome.status).toBe('failure');
    expect(cwsOutcome.errorCode).toBe('rate_limited');
    expect(result.recoveryHint).toMatch(/targets[:=]\s*cws/i);
  });

  it('M4-4: Maintainer recovers by re-dispatching with targets="cws" only @error-path @us-4', async () => {
    // GIVEN: clean env; targets restricted to cws-only (simulating recovery dispatch).
    ctx = await loadEnv('clean', { targets: 'cws-only' });

    // WHEN.
    const result = await runPublish(ctx.env, ctx.deps);

    // THEN: only CWS was acted upon; AMO was not probed.
    expect(result.exitCode).toBe(0);
    expect(ctx.amoState.probeCalls).toHaveLength(0);
    expect(ctx.amoState.signCalls).toHaveLength(0);
    const cwsOutcome = result.outcomes.find(o => o.target === 'cws');
    expect(cwsOutcome.status).toBe('success');
  });

  it('M4-5: Maintainer re-dispatch on a fully published version reports already-published for both targets @error-path @us-3 @us-4', async () => {
    // GIVEN: both stores already have 0.3.0.
    ctx = await loadEnv('clean');
    cwsFakeHelpers.setVersionAlreadyPublished(ctx.cwsState, '0.3.0');
    amoFakeHelpers.setVersionAlreadyListed(ctx.amoState, '0.3.0');

    // WHEN.
    const result = await runPublish(ctx.env, ctx.deps);

    // THEN: both outcomes are already-published; exit non-zero (per design section 9 aggregation rule);
    //       no upload, publish, or sign call was made.
    expect(result.exitCode).toBe(1);
    for (const outcome of result.outcomes) {
      expect(outcome.status).toBe('already-published');
    }
    expect(ctx.cwsState.uploadCalls).toHaveLength(0);
    expect(ctx.cwsState.publishCalls).toHaveLength(0);
    expect(ctx.amoState.signCalls).toHaveLength(0);
  });
});
