// tests/acceptance/marketplace-publishing/milestone-5-dry-run.test.mjs
//
// MILESTONE 5 — Dry-run mode (read-only verification).
// Driving port: runDryRun via runPublish(env, deps) with MODE="dry-run".

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';

import { runPublish } from '../../../scripts/publish-orchestrator.effect.mjs';
import { loadEnv } from './fixtures/scenarios.mjs';
import { cwsFakeHelpers } from './fixtures/cws-fake.mjs';

describe('[milestone-5][in-memory][real-io][dry-run] dry-run mode', () => {
  let ctx;

  afterEach(async () => {
    if (ctx) await ctx.cleanup();
  });

  it('M5-1: Maintainer\'s dry-run validates without submitting @us-5 @dry-run', async () => {
    // GIVEN: clean env with valid creds.
    ctx = await loadEnv('clean', { mode: 'dry-run' });

    // WHEN.
    const result = await runPublish(ctx.env, ctx.deps);

    // THEN: both outcomes are would-succeed; exit 0; no upload/publish/sign calls.
    expect(result.exitCode).toBe(0);
    for (const outcome of result.outcomes) {
      expect(outcome.status).toBe('would-succeed');
    }
    expect(ctx.cwsState.uploadCalls).toHaveLength(0);
    expect(ctx.cwsState.publishCalls).toHaveLength(0);
    expect(ctx.amoState.signCalls).toHaveLength(0);

    // AND: every outcome message is prefixed [DRY RUN] and the summary file is too.
    for (const outcome of result.outcomes) {
      expect(outcome.message).toMatch(/^\[DRY RUN\]/i);
    }
    const summary = await fs.readFile(ctx.summaryPath, 'utf-8');
    expect(summary).toMatch(/\[DRY RUN\]/i);
  });

  it('M5-2: Maintainer\'s dry-run detects an expired refresh token @error-path @us-5 @dry-run @env:with-stale-cws-token-near-expiry', async () => {
    // GIVEN: CWS refresh token is revoked; mode is dry-run.
    ctx = await loadEnv('with-stale-cws-token-near-expiry', { mode: 'dry-run' });

    // WHEN.
    const result = await runPublish(ctx.env, ctx.deps);

    // THEN: the cws outcome is would-fail with auth_expired; exit non-zero;
    //       no upload/publish/sign call ever fired.
    expect(result.exitCode).toBe(1);
    const cwsOutcome = result.outcomes.find(o => o.target === 'cws');
    expect(cwsOutcome.status).toBe('would-fail');
    expect(cwsOutcome.errorCode).toBe('auth_expired');
    expect(cwsOutcome.message).toMatch(/^\[DRY RUN\]/i);
    expect(ctx.cwsState.uploadCalls).toHaveLength(0);
  });

  it('M5-3: Maintainer\'s dry-run detects a version conflict @error-path @us-5 @dry-run', async () => {
    // GIVEN: CWS already has 0.3.0; mode is dry-run.
    ctx = await loadEnv('clean', { mode: 'dry-run' });
    cwsFakeHelpers.setVersionAlreadyPublished(ctx.cwsState, '0.3.0');

    // WHEN.
    const result = await runPublish(ctx.env, ctx.deps);

    // THEN: the cws outcome is would-fail; the AMO outcome is would-succeed;
    //       exit non-zero; no real submission occurred.
    expect(result.exitCode).toBe(1);
    const cwsOutcome = result.outcomes.find(o => o.target === 'cws');
    expect(cwsOutcome.status).toBe('would-fail');
    expect(cwsOutcome.message).toMatch(/^\[DRY RUN\]/i);
    expect(ctx.cwsState.uploadCalls).toHaveLength(0);
    expect(ctx.amoState.signCalls).toHaveLength(0);
  });
});
