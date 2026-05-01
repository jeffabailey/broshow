// tests/acceptance/marketplace-publishing/milestone-1-cws-publish.test.mjs
//
// MILESTONE 1 — Chrome Web Store publish path.
// Driving port: runPublish(env, deps) with TARGETS containing "cws".

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { runPublish } from '../../../scripts/publish-orchestrator.effect.mjs';
import { loadEnv } from './fixtures/scenarios.mjs';
import { cwsFakeHelpers } from './fixtures/cws-fake.mjs';

describe('[milestone-1][in-memory][real-io] cws-publish', () => {
  let ctx;

  afterEach(async () => {
    if (ctx) await ctx.cleanup();
  });

  describe('@env:clean', () => {
    beforeEach(async () => {
      ctx = await loadEnv('clean', { targets: 'cws-only' });
    });

    it('M1-1: Maintainer publishes a fresh CWS version with publishTarget=default @us-3', async () => {
      // GIVEN: targets="cws-only", mode="publish", cws_publish="default"; clean store.
      // WHEN: Jeff runs the publish orchestrator.
      const result = await runPublish(ctx.env, ctx.deps);

      // THEN: the CWS outcome is success.
      expect(result.exitCode).toBe(0);
      expect(result.outcomes).toContainEqual(expect.objectContaining({
        target: 'cws',
        status: 'success',
        version: '0.3.0'
      }));

      // AND: exactly one upload and one publish call were made.
      expect(ctx.cwsState.uploadCalls).toHaveLength(1);
      expect(ctx.cwsState.publishCalls).toHaveLength(1);
      expect(ctx.cwsState.publishCalls[0].target).toBe('default');
    });

    it('M1-2: Maintainer uploads to CWS without submitting (upload-only mode) @us-3', async () => {
      // GIVEN: cws_publish="upload-only".
      ctx.env.CWS_PUBLISH = 'upload-only';
      ctx.env.MODE = 'upload-only';

      // WHEN: Jeff runs the orchestrator.
      const result = await runPublish(ctx.env, ctx.deps);

      // THEN: the outcome is success, an upload happened, but no publish call was made.
      expect(result.exitCode).toBe(0);
      expect(ctx.cwsState.uploadCalls).toHaveLength(1);
      expect(ctx.cwsState.publishCalls).toHaveLength(0);
    });

    it('M1-3: Maintainer publishes to CWS with publishTarget=trustedTesters @us-3', async () => {
      // GIVEN: cws_publish="trustedTesters".
      ctx.env.CWS_PUBLISH = 'trustedTesters';

      // WHEN.
      const result = await runPublish(ctx.env, ctx.deps);

      // THEN: success, and the publish call carries trustedTesters target.
      expect(result.exitCode).toBe(0);
      expect(ctx.cwsState.publishCalls[0].target).toBe('trustedTesters');
    });

    it('M1-5: Maintainer\'s request reports already-published when version exists @error-path @us-3', async () => {
      // GIVEN: CWS already has 0.3.0 published.
      cwsFakeHelpers.setVersionAlreadyPublished(ctx.cwsState, '0.3.0');

      // WHEN.
      const result = await runPublish(ctx.env, ctx.deps);

      // THEN: outcome is already-published, not failure; no upload/publish made.
      const cwsOutcome = result.outcomes.find(o => o.target === 'cws');
      expect(cwsOutcome.status).toBe('already-published');
      expect(ctx.cwsState.uploadCalls).toHaveLength(0);
      expect(ctx.cwsState.publishCalls).toHaveLength(0);
    });
  });

  describe('@env:with-stale-cws-token-near-expiry', () => {
    beforeEach(async () => {
      ctx = await loadEnv('with-stale-cws-token-near-expiry', { targets: 'cws-only' });
    });

    it('M1-4: Maintainer\'s request fails when refresh token is rejected @error-path @us-3', async () => {
      // GIVEN: env tells the fake CWS OAuth to return invalid_grant.
      // WHEN.
      const result = await runPublish(ctx.env, ctx.deps);

      // THEN: the outcome is failure, classified auth_expired; exit 1; no upload made.
      expect(result.exitCode).toBe(1);
      const cwsOutcome = result.outcomes.find(o => o.target === 'cws');
      expect(cwsOutcome.status).toBe('failure');
      expect(cwsOutcome.errorCode).toBe('auth_expired');
      expect(ctx.cwsState.uploadCalls).toHaveLength(0);

      // AND: the recovery hint mentions cws-bootstrap.mjs.
      expect(result.recoveryHint).toMatch(/cws-bootstrap/);
    });
  });
});
