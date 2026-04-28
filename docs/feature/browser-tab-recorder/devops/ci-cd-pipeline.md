# CI/CD Pipeline: BroShow

## Pipeline Goals (mapped to KPIs)

| KPI | How CI enforces it |
|-----|---------------------|
| Network requests made: 0 | Playwright assertion (`page.on('request')`), see `kpi-instrumentation.md` |
| Permissions <= 4 | Manifest-permission-count CI step that reads `src/manifest.json` and fails if `permissions.length > 4` |
| Extension size < 500KB excl. mp4 muxer | Size-budget CI step that measures `artifacts/broshow-*.zip` minus the muxer chunk |
| Recording / mp4 / playback success rates | Acceptance tests cover the happy paths; mutation testing on touched files keeps the test suite honest |
| Time to first recording, click count | Acceptance tests assert UX shape (button count, message round-trip) |

## Pipeline Stages

### Local quality gates (mirror the remote commit stage)

Recommended (not yet wired): `lefthook` (small, fast, polyglot, easy for solo dev).

**pre-commit (target < 30s)**:
- `tsc --noEmit` (typecheck)
- `vitest run --changed` (unit tests for changed files)
- `gitleaks protect --staged` (secrets scan, lightweight)

**pre-push (target < 5 min)**:
- `vitest run` (full unit suite)
- `npm run build` (catch build breaks)
- `npm run test:acceptance -- --project=chromium-extension` (smoke acceptance subset, optional — Playwright is heavy locally)

`--no-verify` is allowed but discouraged; CI is the authoritative gate.

### Commit stage (CI)

| Step | Tool | Gate | Target time |
|------|------|------|-------------|
| Checkout + setup-node | actions/setup-node@v4 | n/a | < 30s |
| `npm ci` | npm | install ok | < 60s |
| Typecheck | `tsc --noEmit` | 0 errors | < 30s |
| Unit tests | `vitest run` | 100% pass, coverage tracked | < 60s |
| Build | `npm run build` | dist/ produced | < 30s |
| Permission-count check | shell + jq | `permissions.length <= 4` | < 5s |
| Size-budget check | shell | unpacked dist excl. mp4-muxer chunk < 500KB | < 5s |
| Package | `web-ext build` | `.zip` produced | < 30s |
| Upload artifact | actions/upload-artifact@v4 | artifact retained 90 days | < 10s |

Total target: < 5 minutes per matrix leg.

### Acceptance stage (CI)

| Step | Tool | Gate |
|------|------|------|
| Install Playwright browsers | `npx playwright install --with-deps chromium` | install ok |
| Run acceptance suite | `npm run test:acceptance` | 100% pass |
| Assert zero network requests | Playwright `page.on('request')` (in test fixture) | 0 requests outside extension origin |

Edge: same shape as Chromium leg; Playwright supports Edge via `channel: 'msedge'`. Fallback if Edge in CI is awkward (Linux runners need MS package repo): drop Edge to **build + unit tests only** in CI and document why in `wave-decisions.md`. Recommendation is to attempt Edge full-pipeline first.

Firefox: **build + typecheck + unit tests only.** No Playwright leg. Documented limitation: `chrome.offscreen` does not exist in Firefox; full Firefox runtime support is a deferred architectural change.

### Mutation testing (per-feature, on-demand)

Triggered by:
- `workflow_dispatch` (manual)
- Label `mutation` on a PR
- (Optional) per-feature delivery checkpoint invoked by the orchestrator

Tool: **Stryker for TypeScript** (`@stryker-mutator/core` + `@stryker-mutator/vitest-runner`).

Configuration intent (high-level):
- Scope: modified files only (`stryker run --mutate $(git diff --name-only origin/main...HEAD | grep '^src/.*\.ts$')`)
- Kill-rate gate: **>= 80%**
- Timeout multiplier: 2x to accommodate vitest startup
- Coverage analysis: `perTest`

Gate: fails the workflow if mutation kill rate < 80% on modified files. Since mutation is per-feature, the gate scopes to changed files, not the whole codebase.

### Package + (future) Release stage

Today (manual release):
- On `push: main`: build, test, package, upload `.zip` as workflow artifact. Developer downloads and uploads to CWS manually.

Future (single-job extension — see "Hybrid release extension point" below):
- On `push: tags: ['v*']`: build, test, package, **publish a GitHub Release** with the `.zip` attached. Developer still uploads to CWS manually (CWS API publish credentials deferred).

## Workflow YAML excerpts

> Place at `.github/workflows/ci.yml`. The orchestrator (or developer) creates the actual file; this is the design.

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  build-test:
    name: build-test (${{ matrix.browser }})
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        include:
          - browser: chrome
            run_acceptance: true
            playwright_channel: chromium
          - browser: edge
            run_acceptance: true
            playwright_channel: msedge
          - browser: firefox
            run_acceptance: false   # Firefox build-only; chrome.offscreen unsupported
            playwright_channel: ''
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Typecheck
        run: npx tsc --noEmit

      - name: Unit tests
        run: npm test

      - name: Build
        run: npm run build

      - name: Permission-count gate (KPI: permissions <= 4)
        run: |
          COUNT=$(jq '.permissions | length' src/manifest.json)
          echo "Manifest permissions: $COUNT"
          if [ "$COUNT" -gt 4 ]; then
            echo "FAIL: manifest declares $COUNT permissions, KPI cap is 4"
            exit 1
          fi

      - name: Size-budget gate (KPI: < 500KB excl. mp4 muxer)
        run: |
          # Sum dist/ size, subtract any mp4-muxer chunk(s).
          TOTAL=$(du -sb dist | awk '{print $1}')
          MUXER=$(find dist -name '*mp4-muxer*' -o -name '*mp4mux*' 2>/dev/null | xargs -r du -cb | tail -n1 | awk '{print $1}')
          MUXER=${MUXER:-0}
          NET=$((TOTAL - MUXER))
          echo "Total dist: $TOTAL bytes; mp4-muxer: $MUXER bytes; net: $NET bytes"
          if [ "$NET" -gt 512000 ]; then
            echo "FAIL: dist (excl. mp4 muxer) is $NET bytes, KPI cap is 512000"
            exit 1
          fi

      - name: Package extension (.zip)
        run: npx web-ext build --source-dir dist/ --artifacts-dir artifacts/ --overwrite-dest

      - name: Install Playwright (browser only)
        if: matrix.run_acceptance
        run: npx playwright install --with-deps ${{ matrix.playwright_channel }}

      - name: Acceptance tests
        if: matrix.run_acceptance
        env:
          BROSHOW_PLAYWRIGHT_CHANNEL: ${{ matrix.playwright_channel }}
        run: npm run test:acceptance

      - name: Upload packaged artifact
        if: matrix.browser == 'chrome'
        uses: actions/upload-artifact@v4
        with:
          name: broshow-${{ github.sha }}.zip
          path: artifacts/*.zip
          # 90 days (vs default 30): widens the post-publish rollback window for
          # privacy-regression bugs that may not be reported quickly. The Hybrid
          # Release extension point below is the long-term fix; until it's wired,
          # 90-day artifacts are the post-publish rollback source of truth.
          retention-days: 90

  mutation:
    name: mutation testing (per-feature)
    runs-on: ubuntu-latest
    if: github.event_name == 'workflow_dispatch' || contains(github.event.pull_request.labels.*.name, 'mutation')
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0    # need history for diff
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - name: Compute changed source files
        id: changed
        run: |
          BASE="${{ github.event.pull_request.base.sha || 'origin/main' }}"
          FILES=$(git diff --name-only "$BASE"...HEAD | grep -E '^src/.*\.ts$' | tr '\n' ',' | sed 's/,$//')
          echo "files=$FILES" >> "$GITHUB_OUTPUT"
      - name: Run Stryker on changed files
        if: steps.changed.outputs.files != ''
        run: npx stryker run --mutate "${{ steps.changed.outputs.files }}"
      - name: Skip mutation (no source changes)
        if: steps.changed.outputs.files == ''
        run: echo "No src/*.ts changes; mutation testing skipped."
```

## Hybrid release extension point (future, single job — do NOT add yet)

When ready to flip to "GitHub Release on tag + manual CWS publish", add this single job to the same workflow:

```yaml
  release:
    name: GitHub Release on tag
    needs: [build-test]
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run build
      - run: npx web-ext build --source-dir dist/ --artifacts-dir artifacts/ --overwrite-dest
      - name: Create GitHub Release with .zip
        uses: softprops/action-gh-release@v2
        with:
          files: artifacts/*.zip
          generate_release_notes: true
```

This is **additive**. No refactor required. CWS API publish credentials remain unwired.

## Quality gate classification

| Category | Stage | Type | Examples |
|----------|-------|------|----------|
| Local | pre-commit | Blocking (developer) | typecheck, unit-changed, gitleaks |
| Local | pre-push | Blocking (developer) | full unit, build |
| PR | pull_request | Blocking (merge) | All commit + acceptance jobs green |
| CI | commit | Blocking (pipeline) | typecheck, unit, build, permission count, size budget |
| CI | acceptance | Blocking (pipeline) | playwright (Chrome + Edge), 0 network requests |
| CI | mutation (per-feature) | Blocking when invoked | kill rate >= 80% on changed files |
| Deploy | n/a | n/a | Manual CWS upload by developer; no CI deploy gate |
| Production | post-publish | Advisory | CWS reviewer feedback (email), in-extension health surface |

## Caching

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'npm'        # caches ~/.npm based on package-lock.json
```

Playwright browser cache (saves ~30-60s per run after first):

```yaml
- uses: actions/cache@v4
  with:
    path: ~/.cache/ms-playwright
    key: ${{ runner.os }}-playwright-${{ hashFiles('package-lock.json') }}
```

## CI/CD change checklist (when modifying this pipeline)

**Before**: identify which KPI gates are touched | document current size-budget headroom | snapshot the network-request assertion baseline.
**During**: keep the size-budget step before the package step (so you measure what you ship) | keep the permission-count step early so it fails fast.
**After**: re-run a sample PR to validate green path | update `wave-decisions.md` with any threshold change.
