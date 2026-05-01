// tests/acceptance/marketplace-publishing/milestone-3-environment-gate.test.mjs
//
// MILESTONE 3 — Environment gate + memory-rule preservation.
// Three of these scenarios are static-inspection on .github/workflows/release.yml
// (driving port DP4: the workflow file's structure IS the trigger boundary).
// One scenario is behavioral on the orchestrator (M3-4 invalid targets).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runPublish } from '../../../scripts/publish-orchestrator.effect.mjs';
import { loadEnv } from './fixtures/scenarios.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const WORKFLOW_PATH = path.join(REPO_ROOT, '.github', 'workflows', 'release.yml');

describe('[milestone-3][memory-rule][real-io][env:clean] environment gate', () => {
  it('M3-1: Tag push alone does NOT trigger any marketplace publish @us-3 @memory-rule', async () => {
    // GIVEN: Jeff has just pushed a tag (we observe this by inspecting the workflow file).
    // WHEN: we read the workflow's publish job condition.
    const yaml = await fs.readFile(WORKFLOW_PATH, 'utf-8');

    // THEN: the workflow file gates the publish job behind workflow_dispatch only.
    expect(yaml).toMatch(/workflow_dispatch/);
    // Publish job (when DELIVER adds it) must check event_name == 'workflow_dispatch'.
    expect(yaml).toMatch(/event_name\s*==\s*'workflow_dispatch'/);
  });

  it('M3-2: Workflow file gates the publish job behind the marketplace-prod environment @us-3', async () => {
    // GIVEN: workflow file content.
    const yaml = await fs.readFile(WORKFLOW_PATH, 'utf-8');

    // THEN: the publish job declares `environment: marketplace-prod`.
    expect(yaml).toMatch(/environment:\s*marketplace-prod/);
  });

  it('M3-3: Workflow file routes only workflow_dispatch events to the publish job @us-3 @memory-rule', async () => {
    // GIVEN: workflow file content.
    const yaml = await fs.readFile(WORKFLOW_PATH, 'utf-8');

    // THEN: the publish job's `if:` must include `event_name == 'workflow_dispatch'`.
    const lines = yaml.split('\n');
    const publishLineIdx = lines.findIndex(l => /^\s*publish:\s*$/.test(l));
    if (publishLineIdx >= 0) {
      const publishBlock = lines.slice(publishLineIdx, Math.min(publishLineIdx + 30, lines.length)).join('\n');
      expect(publishBlock).toMatch(/event_name\s*==\s*'workflow_dispatch'/);
    } else {
      // If publish job is not yet present (pre-DELIVER), the test fails in RED, which is correct.
      expect.fail('publish job not yet present in release.yml -- expected post-DELIVER');
    }
  });

  describe('targets input validation', () => {
    let ctx;

    beforeEach(async () => {
      ctx = await loadEnv('clean');
    });

    afterEach(async () => {
      await ctx.cleanup();
    });

    it('M3-4: Targets input rejects values outside the allowed set @error-path @us-3', async () => {
      // GIVEN: an invalid TARGETS string.
      ctx.env.TARGETS = 'edge-store';

      // WHEN: orchestrator runs.
      const result = await runPublish(ctx.env, ctx.deps);

      // THEN: orchestrator exits non-zero with a parse error and no fake server is hit.
      expect(result.exitCode).toBe(1);
      expect(ctx.cwsState.uploadCalls).toHaveLength(0);
      expect(ctx.amoState.signCalls).toHaveLength(0);
    });
  });
});
