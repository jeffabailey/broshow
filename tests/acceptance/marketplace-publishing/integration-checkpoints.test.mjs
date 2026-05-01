// tests/acceptance/marketplace-publishing/integration-checkpoints.test.mjs
//
// CROSS-CUTTING — observability, idempotency, coexistence guardrails.
// IC-3 is the dedicated @adapter-integration scenario for the
// fs-adapter driven adapter (Mandate 6 audit).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runPublish } from '../../../scripts/publish-orchestrator.effect.mjs';
import { loadEnv, knownSecretValues } from './fixtures/scenarios.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

describe('[integration-checkpoints][in-memory][real-io] cross-cutting', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await loadEnv('clean');
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('IC-1: Maintainer\'s logs never contain a verbatim secret value @property @us-3', async () => {
    // GIVEN: clean env with valid creds and known secret values.
    // WHEN.
    await runPublish(ctx.env, ctx.deps);

    // THEN: no log line emitted via deps.log/logError contains any of the known secret values.
    const fullLog = ctx.logBuffer.join('\n');
    for (const secret of knownSecretValues) {
      expect(fullLog).not.toContain(secret);
    }

    // AND: the step summary on disk does not contain them either.
    const summary = await fs.readFile(ctx.summaryPath, 'utf-8');
    for (const secret of knownSecretValues) {
      expect(summary).not.toContain(secret);
    }
  });

  it('IC-2: Maintainer\'s re-dispatch on the same version is observably idempotent @property @us-3', async () => {
    // GIVEN: first dispatch succeeds.
    const first = await runPublish(ctx.env, ctx.deps);
    expect(first.exitCode).toBe(0);
    const cwsUploadsAfterFirst = ctx.cwsState.uploadCalls.length;
    const cwsPublishesAfterFirst = ctx.cwsState.publishCalls.length;

    // After a successful first run, mark the fakes' state as if the version is now live.
    // (The orchestrator's probe-before-submit must read this state on the second run.)
    ctx.cwsState.responses.probe = {
      ok: true,
      status: 200,
      body: { uploadState: 'SUCCESS', publishedVersion: '0.3.0', itemError: [] }
    };
    ctx.amoState.listedVersions.add('0.3.0');

    // WHEN: re-dispatch with identical inputs.
    const second = await runPublish(ctx.env, ctx.deps);

    // THEN: outcomes report already-published; no new uploads or publishes were attempted.
    for (const outcome of second.outcomes) {
      expect(outcome.status).toBe('already-published');
    }
    expect(ctx.cwsState.uploadCalls.length).toBe(cwsUploadsAfterFirst);
    expect(ctx.cwsState.publishCalls.length).toBe(cwsPublishesAfterFirst);
  });

  it('IC-3: Maintainer\'s existing local sideload xpi flow is preserved @adapter-integration @real-io @us-2', async () => {
    // GIVEN: the project's package.json declares an `npm run sign` script that points
    //        at the existing scripts/sign-firefox-xpi.mjs.
    // WHEN: we read the package.json and the script file from disk.
    const packageJson = JSON.parse(await fs.readFile(path.join(REPO_ROOT, 'package.json'), 'utf-8'));

    // THEN: the sign script entry is unchanged from the pre-feature baseline.
    expect(packageJson.scripts.sign).toBe('node scripts/sign-firefox-xpi.mjs');

    // AND: the script file itself still exists and is non-empty.
    const signScript = await fs.readFile(path.join(REPO_ROOT, 'scripts', 'sign-firefox-xpi.mjs'), 'utf-8');
    expect(signScript.length).toBeGreaterThan(0);

    // AND: the find-next-amo-version.mjs (used by sign-firefox-xpi for unlisted) is still present.
    const findNext = await fs.readFile(path.join(REPO_ROOT, 'scripts', 'find-next-amo-version.mjs'), 'utf-8');
    expect(findNext.length).toBeGreaterThan(0);
  });
});
