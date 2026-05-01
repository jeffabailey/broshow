// tests/acceptance/marketplace-publishing/milestone-2-amo-listed.test.mjs
//
// MILESTONE 2 — AMO listed-channel publish path.
// Driving port: runPublish(env, deps) with TARGETS containing "amo-listed".

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';

import { runPublish } from '../../../scripts/publish-orchestrator.effect.mjs';
import { loadEnv } from './fixtures/scenarios.mjs';
import { amoFakeHelpers } from './fixtures/amo-fake.mjs';

describe('[milestone-2][in-memory][real-io][env:clean] amo-listed publish', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await loadEnv('clean', { targets: 'amo-listed-only' });
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('M2-1: Maintainer publishes a fresh AMO listed submission @us-2', async () => {
    // GIVEN: AMO has no listed version 0.3.0 (default clean state).
    // WHEN.
    const result = await runPublish(ctx.env, ctx.deps);

    // THEN: outcome is success; web-ext sign was invoked.
    expect(result.exitCode).toBe(0);
    const amoOutcome = result.outcomes.find(o => o.target === 'amo-listed');
    expect(amoOutcome.status).toBe('success');
    expect(amoOutcome.version).toBe('0.3.0');

    // AND: web-ext sign was spawned with --channel listed.
    expect(ctx.amoState.signCalls.length).toBeGreaterThanOrEqual(1);
    const allArgs = ctx.amoState.signCalls.flatMap(c => c.args || []).join(' ');
    expect(allArgs).toMatch(/sign/);
    expect(allArgs).toMatch(/--channel\s+listed|--channel=listed|listed/);
  });

  it('M2-2: Maintainer\'s listed publish uses the source manifest version verbatim with no auto-bump probe @us-2 @property', async () => {
    // GIVEN: manifest version is 0.3.0; nothing else.
    // WHEN.
    const result = await runPublish(ctx.env, ctx.deps);

    // THEN: the outcome carries the manifest version verbatim.
    const amoOutcome = result.outcomes.find(o => o.target === 'amo-listed');
    expect(amoOutcome.version).toBe('0.3.0');

    // AND: the existing find-next-amo-version.mjs was NOT spawned.
    const spawnCmds = ctx.amoState.signCalls.map(c => String(c.cmd || ''));
    const findNext = spawnCmds.filter(c => c.includes('find-next-amo-version'));
    expect(findNext).toHaveLength(0);
  });

  it('M2-3: Maintainer\'s listed publish never modifies source manifest or package.json @us-2 @property', async () => {
    // GIVEN: read manifest content before.
    const before = await fs.readFile(ctx.manifestPath, 'utf-8');

    // WHEN.
    await runPublish(ctx.env, ctx.deps);

    // THEN: manifest content is bit-identical.
    const after = await fs.readFile(ctx.manifestPath, 'utf-8');
    expect(after).toBe(before);
  });

  it('M2-4: Maintainer\'s listed publish fails when AMO credentials are missing @error-path @us-2', async () => {
    // GIVEN: AMO secrets are absent.
    delete ctx.env.AMO_JWT_ISSUER;
    delete ctx.env.AMO_JWT_SECRET;

    // WHEN.
    const result = await runPublish(ctx.env, ctx.deps);

    // THEN: outcome is failure with a credential-pointer message.
    expect(result.exitCode).toBe(1);
    const amoOutcome = result.outcomes.find(o => o.target === 'amo-listed');
    expect(amoOutcome.status).toBe('failure');
    expect(amoOutcome.message.toLowerCase()).toMatch(/credentials|jwt|amo/);
  });

  it('M2-5: Maintainer\'s listed publish reports already-published when version exists @error-path @us-2', async () => {
    // GIVEN: AMO already has listed 0.3.0.
    amoFakeHelpers.setVersionAlreadyListed(ctx.amoState, '0.3.0');

    // WHEN.
    const result = await runPublish(ctx.env, ctx.deps);

    // THEN: outcome is already-published; no sign was invoked.
    const amoOutcome = result.outcomes.find(o => o.target === 'amo-listed');
    expect(amoOutcome.status).toBe('already-published');
    expect(ctx.amoState.signCalls).toHaveLength(0);
  });
});
