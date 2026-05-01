# CI/CD Pipeline: Marketplace Publishing (DEVOPS)

Feature ID: `marketplace-publishing`
Wave: DEVOPS
Date: 2026-04-30
Status: Code-not-yet-committed extension plan for `.github/workflows/release.yml`. DELIVER wave makes the file edits.

This document is the concrete extension plan for `release.yml`. It is the working contract between DEVOPS (this doc) and DELIVER (software-crafter who edits the file). DEVOPS does NOT modify the workflow file directly per the brief.

Companion: `platform-architecture.md` (runtime topology), `environments.yaml` (test envs).

## 1. Pipeline stages and quality gates

Mapping the existing `release.yml` to the canonical CD pipeline stages (per `nw-cicd-and-deployment` skill):

| Stage | Runs | Existing? | Quality gates |
|---|---|---|---|
| Pre-commit (local) | `lefthook`/`pre-commit` (NOT in scope here; DELIVER may add) | No | Lint, format, secrets scan |
| Commit stage | `build` job | YES (existing) | npm ci, build success, manifest version match, web-ext lint, AMO unlisted sign success |
| Acceptance stage | NEW: contract tests + acceptance tests | No (DELIVER adds) | Pact-JS contract verification, vitest unit + acceptance suite, coverage >= 80%, mutation kill rate >= 80% on `*.pure.mjs` |
| Capacity stage | N/A | -- | Single low-frequency human-triggered workflow; no load test needed |
| Production stage | `publish` matrix + `aggregate-summary` | NEW | Environment approval (gate), per-target probe-before-submit, post-publish step summary |

This document focuses on the production stage extensions (the publish/aggregate jobs). The acceptance stage (Pact + Stryker) is also planned here because both are gated entry conditions for the publish stage.

## 2. Workflow inputs (definition)

These are added to the `workflow_dispatch` block of `release.yml`. The existing `tag` input is retained.

```yaml
on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:
    inputs:
      tag:
        description: 'Tag to release (e.g., v0.3.0). Must already exist or will be created on the current commit.'
        required: true
        type: string

      targets:
        description: 'Which marketplaces to publish to.'
        required: false
        default: 'cws,amo-listed'
        type: choice
        options:
          - 'cws,amo-listed'   # both
          - 'cws-only'
          - 'amo-listed-only'
          - 'none'             # build-only via dispatch (rare; equivalent to push-tag flow)

      mode:
        description: 'Publish mode.'
        required: false
        default: 'publish'
        type: choice
        options:
          - 'publish'         # full submit
          - 'upload-only'     # CWS upload + AMO submit but no CWS publish step (Q2 Option A inspect-before-submit)
          - 'dry-run'         # read-only probes; no writes; skips environment gate
```

Mapping back to design's named modes:
- `mode=publish` -> `PublishMode.Publish` (default flow; CWS uses `publishTarget=default`; AMO listed full submit)
- `mode=upload-only` -> `PublishMode.UploadOnly` (CWS upload yes, CWS publish step skipped; AMO listed: still full submit since AMO has no equivalent "uploaded but not submitted" state distinct from version-record-creation; documented behavior)
- `mode=dry-run` -> `PublishMode.DryRun` (probe only; AC-5-1 through AC-5-5)

Mapping `targets` to `parseTargets` per `design/component-boundaries.md`:
- `cws,amo-listed` -> `["cws", "amo-listed"]`
- `cws-only` -> `["cws"]`
- `amo-listed-only` -> `["amo-listed"]`
- `none` -> `[]` (publish job's matrix becomes empty; aggregate-summary reports "no publish targets selected")

## 3. Concurrency group

Added at workflow level:

```yaml
concurrency:
  group: release-${{ inputs.tag || github.ref_name }}
  cancel-in-progress: false
```

Effect:
- Two simultaneous runs targeting the same tag (e.g., maintainer accidentally re-dispatches before previous finishes) queue rather than race. Prevents AMO/CWS from receiving conflicting uploads from concurrent runs of the same version.
- Different tags are not affected (`v0.3.0` and `v0.4.0` runs proceed in parallel).
- `cancel-in-progress: false`: never cancel a half-finished publish run; finish it.

## 4. Job graph (extension to existing `release.yml`)

### 4.1 Existing `release` job — KEEP AS-IS plus artifact upload

The existing job is renamed conceptually to `build` (rename optional; DELIVER may keep the `release` name to minimize diff). It runs on both triggers (tag push and workflow_dispatch). Behavior unchanged: build, package, stage Firefox, AMO unlisted sign, GitHub release. New addition at end:

```yaml
      - name: Upload build artifacts for publish job
        if: github.event_name == 'workflow_dispatch'
        uses: actions/upload-artifact@v4
        with:
          name: build-artifacts-${{ steps.version.outputs.tag }}
          path: |
            broshow-chrome-${{ steps.version.outputs.version }}.zip
            broshow-firefox-${{ steps.amo-version.outputs.amo_version }}.xpi
          retention-days: 7
          if-no-files-found: error
```

This step runs ONLY on workflow_dispatch (so tag-push behavior is unchanged: zero impact, zero new artifacts retained for tag pushes -- they already produce a GitHub release with the files attached).

Outputs added to the `build` job for downstream jobs:
```yaml
    outputs:
      tag: ${{ steps.version.outputs.tag }}
      version: ${{ steps.version.outputs.version }}
      amo_version: ${{ steps.amo-version.outputs.amo_version }}
```

### 4.2 NEW `publish` job (matrix)

Runs only when:
- `github.event_name == 'workflow_dispatch'`
- `inputs.mode != 'dry-run'`
- The matrix target is in the `targets` input

```yaml
  publish:
    needs: build
    if: >-
      github.event_name == 'workflow_dispatch'
      && inputs.mode != 'dry-run'
      && inputs.targets != 'none'
    runs-on: ubuntu-latest
    environment: marketplace-prod
    strategy:
      fail-fast: false
      matrix:
        target: [cws, amo-listed]
        exclude:
          # Filter matrix legs based on `targets` input.
          # GitHub Actions doesn't support direct conditional matrix entries,
          # so we use `if:` on the orchestrator step (see step-level guard below).
    steps:
      - name: Skip leg if not in targets
        id: should-run
        run: |
          TARGETS="${{ inputs.targets }}"
          TARGET="${{ matrix.target }}"
          case "$TARGETS" in
            cws,amo-listed) echo "run=true" >> "$GITHUB_OUTPUT" ;;
            cws-only)
              if [ "$TARGET" = "cws" ]; then echo "run=true" >> "$GITHUB_OUTPUT"; else echo "run=false" >> "$GITHUB_OUTPUT"; fi ;;
            amo-listed-only)
              if [ "$TARGET" = "amo-listed" ]; then echo "run=true" >> "$GITHUB_OUTPUT"; else echo "run=false" >> "$GITHUB_OUTPUT"; fi ;;
            *) echo "run=false" >> "$GITHUB_OUTPUT" ;;
          esac

      - name: Checkout
        if: steps.should-run.outputs.run == 'true'
        uses: actions/checkout@v4

      - name: Setup Node.js
        if: steps.should-run.outputs.run == 'true'
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        if: steps.should-run.outputs.run == 'true'
        run: npm ci

      - name: Download build artifacts
        if: steps.should-run.outputs.run == 'true'
        uses: actions/download-artifact@v4
        with:
          name: build-artifacts-${{ needs.build.outputs.tag }}
          path: ./artifacts

      - name: Run publish orchestrator (target=${{ matrix.target }})
        if: steps.should-run.outputs.run == 'true'
        id: publish
        continue-on-error: true
        env:
          TARGET: ${{ matrix.target }}
          TAG: ${{ needs.build.outputs.tag }}
          VERSION: ${{ needs.build.outputs.version }}
          MODE: ${{ inputs.mode }}
          ARTIFACT_DIR: ./artifacts
          # CWS secrets (only used when TARGET=cws)
          CWS_CLIENT_ID: ${{ secrets.CWS_CLIENT_ID }}
          CWS_CLIENT_SECRET: ${{ secrets.CWS_CLIENT_SECRET }}
          CWS_REFRESH_TOKEN: ${{ secrets.CWS_REFRESH_TOKEN }}
          CWS_EXTENSION_ID: ${{ secrets.CWS_EXTENSION_ID }}
          # AMO secrets (only used when TARGET=amo-listed)
          AMO_JWT_ISSUER: ${{ secrets.AMO_JWT_ISSUER }}
          AMO_JWT_SECRET: ${{ secrets.AMO_JWT_SECRET }}
          OUTCOME_OUT: ./outcome-${{ matrix.target }}.json
        run: node scripts/publish-orchestrator.effect.mjs

      - name: Upload per-target outcome artifact
        if: steps.should-run.outputs.run == 'true'
        uses: actions/upload-artifact@v4
        with:
          name: outcome-${{ matrix.target }}
          path: ./outcome-${{ matrix.target }}.json
          if-no-files-found: warn

      - name: Verify no source-manifest mutation
        if: steps.should-run.outputs.run == 'true'
        run: git diff --exit-code -- src/manifest.json package.json
```

Key properties:
- `environment: marketplace-prod` triggers the required-reviewer gate. The first leg of the matrix triggers approval; subsequent legs reuse the approval (GitHub behavior — single approval per workflow run per environment).
- `continue-on-error: true` on the orchestrator step prevents one target's failure from cancelling the other (NFR-3, Q5 Option A).
- The orchestrator writes a `PublishOutcome` JSON to `OUTCOME_OUT` for the aggregate job to consume.
- `git diff --exit-code` enforces the no-source-mutation invariant (component-boundaries.md section 6.4).
- Skip-leg pattern uses step-level `if:` because GitHub Actions matrix doesn't support input-based conditional matrix entries directly. Skipped legs still appear in the run UI as "completed" with all steps skipped — acceptable trade-off vs adding a separate non-matrix job per target.

### 4.3 NEW `publish-dry-run` job (sibling, no environment gate)

Runs only when `inputs.mode == 'dry-run'`. NOT environment-gated (read-only operation).

```yaml
  publish-dry-run:
    needs: build
    if: >-
      github.event_name == 'workflow_dispatch'
      && inputs.mode == 'dry-run'
      && inputs.targets != 'none'
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        target: [cws, amo-listed]
    steps:
      # ... identical structure to publish job above, but:
      # - No `environment: marketplace-prod`
      # - MODE=dry-run env var is set, orchestrator short-circuits all writes
      # - Non-secret CWS_EXTENSION_ID is the only CWS env needed for the probe
      #   (AMO probe needs JWT, but no upload happens)
```

Rationale: AC-5-5 specifies dry-run is safe to run without approval ("read-only verification"). Splitting into a separate job rather than conditionally toggling `environment:` because GitHub Actions does not support dynamic environment selection in YAML.

### 4.4 NEW `aggregate-summary` job

Runs always after publish (or publish-dry-run). Aggregates per-target outcome JSON files, writes the Markdown step summary, computes overall exit code.

```yaml
  aggregate-summary:
    needs: [build, publish, publish-dry-run]
    if: always() && github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Download all outcome artifacts
        uses: actions/download-artifact@v4
        with:
          pattern: outcome-*
          merge-multiple: true
          path: ./outcomes

      - name: Aggregate and render summary
        env:
          OUTCOME_DIR: ./outcomes
          MODE: ${{ inputs.mode }}
          TARGETS: ${{ inputs.targets }}
          TAG: ${{ needs.build.outputs.tag }}
          # Captured at workflow start by GitHub:
          RUN_STARTED_AT: ${{ github.event.workflow_run.created_at || github.event.repository.pushed_at }}
        run: node scripts/aggregate-and-summarize.effect.mjs

      - name: Emit time-to-publish KPI
        run: |
          echo "kpi_time_to_publish_seconds=$(cat ./kpi-time-to-publish.txt 2>/dev/null || echo 'n/a')" >> "$GITHUB_OUTPUT"
        id: kpi
```

The `aggregate-and-summarize.effect.mjs` script (DELIVER creates):
1. Reads every `*.json` in `./outcomes`.
2. Calls `aggregateOutcomes` (pure) -> `AggregateResult`.
3. Calls `renderSummary` (pure) -> Markdown.
4. Appends Markdown to `$GITHUB_STEP_SUMMARY`.
5. Computes time-to-publish: `(now - RUN_STARTED_AT)` in seconds, writes to `./kpi-time-to-publish.txt`.
6. `process.exit(result.exitCode)` (non-zero if any target failed).

### 4.5 Job graph summary

```
build (existing, lightly extended with upload-artifact)
  |
  +-- on push tag v*: terminates here (existing behavior unchanged)
  |
  +-- on workflow_dispatch:
        |
        +-- mode=publish or mode=upload-only:
        |     |
        |     v
        |   publish (matrix: cws, amo-listed)  [environment: marketplace-prod]
        |     |
        |     v
        |   aggregate-summary
        |
        +-- mode=dry-run:
              |
              v
            publish-dry-run (matrix: cws, amo-listed)  [no environment gate]
              |
              v
            aggregate-summary
```

## 5. Quality gates per stage

### Commit stage gates (existing build job; DELIVER may augment)
- npm ci success (exit 0)
- npm run build success (dist/ produced)
- manifest version matches tag (existing check, line 47-53 of `release.yml`)
- web-ext lint passes with `--warnings-as-errors=false` (existing)
- AMO unlisted sign success (existing; warn-only if creds absent)

### Acceptance stage gates (DELIVER adds)
- vitest unit suite: 100% pass
- coverage >= 80% on `scripts/*.pure.mjs`
- Stryker mutation kill rate >= 80% on `scripts/*.pure.mjs` (CLAUDE.md rule)
- Pact-JS consumer-driven contract tests pass for CWS endpoints (probe, upload, publish) and AMO listed probe endpoint
- Architecture rule grep check (ADR-009): `*.pure.mjs` files contain no I/O imports

These run on PR (status checks) before merge. They are the entry condition for the publish stage being trusted. NOT gated inline in `release.yml` (which runs on tag push, post-merge); enforced via branch protection on `main`.

### Production stage gates (publish job)
- Environment approval (required reviewer = repo owner)
- Per-target probe-before-submit: orchestrator classifies `VersionState` before calling submit endpoint
- Per-target outcome must be one of: `success`, `already-published`, `dry-run-ok`, `failure` (typed)
- `git diff --exit-code` for source manifests (mutation guard)

### Aggregate gate
- `aggregate-summary` exits non-zero if any target outcome is `failure`
- Workflow run UI shows red X; reviewer sees the Recovery section in step summary

## 6. Failure modes and pipeline behavior

| Scenario | Expected pipeline behavior |
|---|---|
| Tag push `v0.3.0` (no dispatch) | `build` runs, GitHub release created, publish jobs do NOT run. Memory rule preserved. |
| Dispatch `mode=publish, targets=cws,amo-listed`, both succeed | `build` -> `publish` (both legs green) -> `aggregate-summary` (green). Step summary shows two success rows. |
| Dispatch, CWS succeeds, AMO fails with auth error | `build` -> `publish` (cws=green, amo-listed=red, but step `continue-on-error` keeps job green) -> `aggregate-summary` exits 1, run is red, summary shows recovery hint with `targets: amo-listed-only`. |
| Dispatch, both fail | Same as above; aggregate-summary exits 1, recovery hint targets both. |
| Dispatch with `mode=dry-run` | `publish-dry-run` runs without environment gate; aggregate-summary reports "would publish" rows. |
| Dispatch with `targets=none` | `publish` and `publish-dry-run` skipped; `aggregate-summary` reports "no publish targets selected" and exits 0. (Useful for pure-build dispatch.) |
| Reviewer rejects environment approval | `publish` job reports "deployment rejected"; `aggregate-summary` runs with `if: always()` and reports rejection in summary. |
| Two concurrent dispatches with same tag | Second is queued by concurrency group; runs after first completes. |

## 7. Diff size estimate (for DELIVER)

Approximate change to `.github/workflows/release.yml`:
- Existing `release` job: ~5 lines added (upload-artifact step), ~3 lines added (job outputs)
- New `publish` job: ~70 lines
- New `publish-dry-run` job: ~50 lines (mostly duplicate of `publish` minus environment gate; DELIVER may use a reusable workflow or composite action to deduplicate)
- New `aggregate-summary` job: ~30 lines
- Workflow inputs additions: ~30 lines
- Concurrency block: ~3 lines

Total: ~190 lines added. Existing ~130 lines retained unchanged. Final file ~320 lines. Within "single workflow file is fine" threshold; no need to split.

## 8. Reusable workflow / composite action consideration

The `publish` and `publish-dry-run` jobs are 80% identical. DELIVER may extract:
- Option A: Composite action at `.github/actions/run-publish/action.yml` taking `target`, `mode`, `tag` as inputs. Both jobs invoke it. Saves ~40 lines.
- Option B: Reusable workflow at `.github/workflows/_publish-target.yml` with `workflow_call` trigger. Heavier but reuses environment binding cleanly.
- Option C: Keep duplication. Two ~50-line jobs is readable; DRY discipline applied to script code (where mutation testing rewards it), not to YAML.

DEVOPS recommends **Option C** for v1 (readability over DRY in YAML; mutation-testable code is in `.mjs` files where it matters). DELIVER may revisit if the duplication grows.

## 9. Pipeline observability hooks

Captured live during run; details in `observability-plan.md`:
- Each adapter writes structured key=value lines to stdout (no secrets).
- `$GITHUB_STEP_SUMMARY` aggregates the per-target outcomes into a Markdown table at end of run.
- Time-to-publish KPI computed in `aggregate-summary` job from `$GITHUB_RUN_STARTED_AT` to summary write.
- Workflow output `kpi_time_to_publish_seconds` exposed for downstream consumers (e.g., a future maintainer dashboard reading via `gh run view`).

## 10. DELIVER handoff checklist

DELIVER (software-crafter) implements:
- [ ] Edit `.github/workflows/release.yml` per sections 4.1-4.4
- [ ] Add workflow inputs per section 2
- [ ] Add concurrency group per section 3
- [ ] Implement `scripts/publish-orchestrator.effect.mjs` per `design/component-boundaries.md` section 2.9
- [ ] Implement `scripts/aggregate-and-summarize.effect.mjs` (consumes outcome JSON files)
- [ ] Implement adapters per design (`cws-adapter.effect.mjs`, `amo-listed-adapter.effect.mjs`, `fs-adapter.effect.mjs`, `decisions.pure.mjs`, `amo-jwt.pure.mjs`)
- [ ] Implement `scripts/cws-bootstrap.mjs` per design section 2.10
- [ ] Add Stryker config (`stryker.config.json`) targeting `*.pure.mjs`
- [ ] Add Pact-JS contract tests for CWS and AMO probe endpoints
- [ ] Add architecture rule grep CI step (ADR-009)
- [ ] Run mutation testing locally to confirm >= 80% kill rate before merge
