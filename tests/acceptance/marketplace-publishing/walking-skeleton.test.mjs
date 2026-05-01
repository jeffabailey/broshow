// tests/acceptance/marketplace-publishing/walking-skeleton.test.mjs
//
// WALKING SKELETON — Strategy B (real local + fake costly).
// Two scenarios that demo the full feature value to the maintainer:
//   WS-1: publish to both stores (happy path, real FS, fake CWS/AMO).
//   WS-2: dry-run validates without writing anything to fakes.
//
// Driving port: runPublish(env, deps) from publish-orchestrator.effect.mjs.
// The `deps` arg is the dependency-injection seam (component-boundaries.md
// section 4). Tests pass fake `fetch` and fake `spawn` here; the orchestrator's
// production code defaults them to globalThis.fetch and node:child_process.spawn.
//
// Tags: @walking_skeleton @real-io @in-memory @env:clean

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';

import { runPublish } from '../../../scripts/publish-orchestrator.effect.mjs';
import { loadEnv } from './fixtures/scenarios.mjs';

describe('[walking-skeleton][real-io][env:clean] marketplace-publishing', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await loadEnv('clean');
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('WS-1: Maintainer publishes v0.3.0 to Chrome Web Store and Firefox AMO listed @us-3', async () => {
    // GIVEN: Jeff has tagged v0.3.0; manifest version is "0.3.0"; build artifacts
    //        exist on disk; CWS and AMO credentials are valid; neither store
    //        has version 0.3.0 yet.
    // (preconditions established by loadEnv('clean'))

    // WHEN: Jeff runs the publish orchestrator with both targets in publish mode.
    const start = Date.now();
    const result = await runPublish(ctx.env, ctx.deps);
    const wallSeconds = (Date.now() - start) / 1000;

    // THEN: Jeff sees two success outcomes (one per marketplace).
    expect(result.exitCode).toBe(0);
    expect(result.outcomes).toHaveLength(2);
    expect(result.outcomes).toContainEqual(expect.objectContaining({
      target: 'cws',
      status: 'success',
      version: '0.3.0'
    }));
    expect(result.outcomes).toContainEqual(expect.objectContaining({
      target: 'amo-listed',
      status: 'success',
      version: '0.3.0'
    }));

    // AND: a step summary file on disk lists both marketplaces and the version.
    const summary = await fs.readFile(ctx.summaryPath, 'utf-8');
    expect(summary).toContain('cws');
    expect(summary).toContain('amo-listed');
    expect(summary).toContain('0.3.0');
    expect(summary).toContain('success');

    // AND: each outcome carries a dashboard URL the maintainer can click.
    for (const outcome of result.outcomes) {
      expect(outcome.dashboardUrl).toBeTruthy();
    }

    // AND: the wall-clock is under 5 minutes (NFR-5 / AC-X-4).
    expect(wallSeconds).toBeLessThan(300);
  });

  it('WS-2: Maintainer dry-runs v0.3.0 against both marketplaces @us-5 @dry-run', async () => {
    // GIVEN: Jeff has tagged v0.3.0; build artifacts exist; credentials valid.
    ctx.env.MODE = 'dry-run';

    // WHEN: Jeff runs the publish orchestrator with MODE=dry-run.
    const result = await runPublish(ctx.env, ctx.deps);

    // THEN: Jeff sees two would-succeed outcomes.
    expect(result.exitCode).toBe(0);
    expect(result.outcomes).toHaveLength(2);
    for (const outcome of result.outcomes) {
      expect(outcome.status).toBe('would-succeed');
    }

    // AND: no upload, publish, or sign call ever hit the fake servers.
    expect(ctx.cwsState.uploadCalls).toHaveLength(0);
    expect(ctx.cwsState.publishCalls).toHaveLength(0);
    expect(ctx.amoState.signCalls).toHaveLength(0);

    // AND: the step summary on disk is prefixed [DRY RUN] and lists the would-be actions.
    const summary = await fs.readFile(ctx.summaryPath, 'utf-8');
    expect(summary).toMatch(/\[DRY RUN\]/i);
    expect(summary).toContain('cws');
    expect(summary).toContain('amo-listed');
  });
});
