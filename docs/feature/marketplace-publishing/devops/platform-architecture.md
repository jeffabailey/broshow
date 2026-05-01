# Platform Architecture: Marketplace Publishing (DEVOPS)

Feature ID: `marketplace-publishing`
Wave: DEVOPS
Date: 2026-04-30
Mode: Auto

This document describes the runtime topology, environment matrix, and local dev workflow for delivering the `marketplace-publishing` feature. It complements `design/architecture-design.md` (which describes the application architecture) by focusing on the **delivery infrastructure**: which jobs run where, what depends on what, where the gates are, and how the test environments are constructed.

Companion docs:
- `ci-cd-pipeline.md` — concrete pipeline extension plan
- `environments.yaml` — DISTILL acceptance-test environment matrix
- `secret-inventory.md` — secret manifest
- `environment-setup-instructions.md` — maintainer step-by-step
- `observability-plan.md` — what gets logged where
- `wave-decisions.md` — decision summary

## 1. Trigger model resolution (one-time)

Per ADR-007, two paths were designed: primary (environment-gated job) and fallback (separate workflow). The orchestrator brief confirms:

- **Repository visibility**: PUBLIC (`jeffabailey/broshow`)
- **GitHub Environments with required reviewers**: AVAILABLE on free tier for public repos
- **Decision**: Q3 Option C (environment-gated publish job in `release.yml`) is FULLY VIABLE. The fallback path (separate `publish-stores.yml`) is NOT needed and is left in ADR-007 as historical context only.

This locks the runtime topology described below.

## 2. Runtime topology — workflow run shape

```
┌──────────────────────────────────────────────────────────────────┐
│  GitHub Actions Workflow Run (release.yml, single run)           │
│                                                                  │
│  Trigger:                                                        │
│   - push tag v*                  -> build only                   │
│   - workflow_dispatch            -> build + publish              │
│                                                                  │
│  ┌────────────────────┐                                          │
│  │  job: build        │  runs-on: ubuntu-latest                  │
│  │                    │  steps: checkout, setup-node, npm ci,    │
│  │                    │   build, package zip, stage firefox,     │
│  │                    │   web-ext lint, find-next-amo-version,   │
│  │                    │   web-ext sign --channel unlisted,       │
│  │                    │   gh release create,                     │
│  │                    │   upload-artifact (chrome-zip + xpi)     │
│  └─────────┬──────────┘                                          │
│            │ needs: build                                        │
│            │ if: github.event_name == 'workflow_dispatch'        │
│            │ environment: marketplace-prod (REQUIRED REVIEWER)   │
│            v                                                     │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  job: publish (matrix: target = [cws, amo-listed])         │  │
│  │  runs-on: ubuntu-latest                                    │  │
│  │  filtered by `targets` workflow input                      │  │
│  │                                                            │  │
│  │  steps:                                                    │  │
│  │   - download-artifact (chrome zip OR firefox xpi)          │  │
│  │   - run publish-orchestrator.effect.mjs scoped to target   │  │
│  │   - emit per-target row to $GITHUB_STEP_SUMMARY            │  │
│  │   - continue-on-error: true (failure isolation, NFR-3)     │  │
│  └─────────┬──────────────────────────────────────────────────┘  │
│            │ needs: [build, publish]                             │
│            │ if: always() (runs even if publish has failures)    │
│            v                                                     │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  job: aggregate-summary                                    │  │
│  │  runs-on: ubuntu-latest                                    │  │
│  │  steps:                                                    │  │
│  │   - download all per-target outcome JSON artifacts         │  │
│  │   - run aggregateOutcomes + renderSummary (pure)           │  │
│  │   - append to $GITHUB_STEP_SUMMARY (Markdown table)        │  │
│  │   - emit Recovery section if any target failed             │  │
│  │   - emit time-to-publish KPI metric (workflow output)      │  │
│  │   - exit non-zero if aggregate has any failure             │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Concurrency group:                                              │
│   group: release-${{ inputs.tag || github.ref_name }}            │
│   cancel-in-progress: false                                      │
└──────────────────────────────────────────────────────────────────┘
```

### Key topology properties

| Property | Value | Why |
|---|---|---|
| Runners | `ubuntu-latest` for all jobs | No native binary needs; consistent with current `release.yml`; cheapest GitHub-hosted SKU |
| Job dependency graph | `build` -> `publish` (matrix) -> `aggregate-summary` | Failure isolation per target; aggregate exit code reflects whole-run health |
| Environment gate location | `publish` job only | Build remains tag-push-triggered (memory rule preserved); publish requires explicit reviewer click |
| Matrix dimension | `target ∈ {cws, amo-listed}` | Q5 Option A locked — parallel per-target jobs |
| Matrix filter | `targets` workflow input | One workflow run can publish to a subset (recovery semantics, AC-4-2) |
| `continue-on-error` per matrix leg | `true` on the orchestrator step | One target failing must not abort the other (Q5, NFR-3) |
| Artifact passing | `actions/upload-artifact@v4` build -> `actions/download-artifact@v4` publish | No rebuild in publish job; identical bytes published as released |
| Concurrency | `group: release-{tag}`, `cancel-in-progress: false` | Prevent two concurrent runs of same tag from racing on AMO/CWS upload endpoints |
| Dry-run path | Same matrix, but orchestrator's `mode=dry-run` short-circuits all writes | Skips environment gate too (read-only verification, AC-5-5) |

### Dry-run special case

When `mode=dry-run`:
- Publish job runs WITHOUT `environment: marketplace-prod` (read-only — no submission risk; AC-5-5).
- Orchestrator probes both store APIs but never POSTs uploads or publishes.
- Aggregate summary reports "would publish" for each target, version conflict pre-flighted.

This is implemented as a separate `publish-dry-run` job sibling to `publish`, with mutually exclusive `if:` guards. See `ci-cd-pipeline.md` section 4.

## 3. Test environment matrix (DISTILL handoff)

DISTILL's acceptance tests need controlled environments to exercise each AC. Per the `nw-distill` skill default the matrix is `[clean, with-pre-commit, with-stale-config]`. Adapted to this feature, the variants exercise the failure modes the design's `Result<T, E>` classification cares about.

| Env name | Purpose | Preconditions | Simulation |
|---|---|---|---|
| `clean` | Happy path | Valid creds; no prior version on either store | Fixture: empty existing-versions set; mock CWS returns `{state: "OK"}`; mock AMO returns `{count: 0}` |
| `with-amo-throttle-active` | AMO 429 retry path | AMO returns 429 with `Retry-After` header on probe | `vi.stubGlobal('fetch', mockFetchReturning429)` for AMO endpoints |
| `with-cws-rate-limit-active` | CWS 429 quota exceeded | CWS returns 429 on upload | `vi.stubGlobal('fetch', mockFetchReturning429)` for `/upload/chromewebstore/...` |
| `with-stale-cws-token-near-expiry` | OAuth refresh path | Refresh token returns `invalid_grant` from oauth2.googleapis.com | Mock `https://oauth2.googleapis.com/token` to return `{error: "invalid_grant"}` |

Full matrix definition is in `environments.yaml`. Each env entry includes:
- Description
- Preconditions (which mocks/fixtures are active)
- How to simulate (which adapter is stubbed and to what)
- Which ACs run against it
- Expected outcome classification

The matrix is consumed by DISTILL's acceptance test harness (which builds tests that pin one env per scenario).

## 4. Local dev workflow — `cws-bootstrap.mjs`

The CWS refresh token must be minted **once, locally**, by the maintainer. It cannot be minted in CI because the OAuth flow requires browser interaction. Once minted, the refresh token lives in the `marketplace-prod` GitHub environment secret store and rotates only if revoked.

### Local bootstrap flow

```
┌────────────────────────────────────────────────────────────────┐
│ Maintainer terminal (local laptop)                             │
│                                                                │
│ Prereqs:                                                       │
│  - CWS_CLIENT_ID and CWS_CLIENT_SECRET from Google Cloud       │
│    Console (OAuth 2.0 Client ID, type "Desktop app").          │
│  - Default browser available.                                  │
│                                                                │
│ Run: node scripts/cws-bootstrap.mjs                            │
│                                                                │
│  1. Reads CWS_CLIENT_ID, CWS_CLIENT_SECRET from env or prompt. │
│  2. Spins http.createServer on http://localhost:3000.          │
│  3. Prints: "Open this URL: https://accounts.google.com/o/    │
│     oauth2/v2/auth?...&redirect_uri=http://localhost:3000      │
│     &scope=https://www.googleapis.com/auth/chromewebstore..."  │
│  4. Maintainer copies URL to browser, signs in, grants scope.  │
│  5. Browser redirects to localhost:3000 with auth code.        │
│  6. Bootstrap script captures code, POSTs to                   │
│     https://oauth2.googleapis.com/token with grant_type=       │
│     authorization_code.                                        │
│  7. Server returns refresh_token + access_token.               │
│  8. Bootstrap prints to STDOUT (never to disk):                │
│         CWS_CLIENT_ID=...                                      │
│         CWS_CLIENT_SECRET=...                                  │
│         CWS_REFRESH_TOKEN=...                                  │
│         CWS_EXTENSION_ID=<paste from CWS dashboard>            │
│  9. Maintainer copies values into GitHub UI: Settings ->       │
│     Environments -> marketplace-prod -> Add secret.            │
│ 10. Maintainer clears terminal scrollback (security hygiene).  │
└────────────────────────────────────────────────────────────────┘
```

Key invariants:
- Bootstrap NEVER writes secrets to disk. AC-1-2.
- Bootstrap is local-only. No CI invocation. No network listener exposed beyond loopback.
- Bootstrap is idempotent: re-running mints a new refresh token; the old token is implicitly invalidated when the user revokes the OAuth grant in Google Account settings (manual cleanup required if rotation desired).

Step-by-step setup instructions for the maintainer are in `environment-setup-instructions.md`.

## 5. Component-to-runner mapping

| Component | Runs in | Trigger | Effect boundary |
|---|---|---|---|
| `build` job (existing) | `ubuntu-latest` | tag push OR workflow_dispatch | Reads repo, writes GitHub release + artifacts |
| `publish` matrix leg `cws` | `ubuntu-latest` (in `marketplace-prod` env) | workflow_dispatch + reviewer approved | Reads CWS_* env secrets; calls Google OAuth + CWS API |
| `publish` matrix leg `amo-listed` | `ubuntu-latest` (in `marketplace-prod` env) | workflow_dispatch + reviewer approved | Reads AMO_JWT_* env secrets; spawns `web-ext sign --channel listed` |
| `publish-dry-run` job | `ubuntu-latest` (NO env gate) | workflow_dispatch with `mode=dry-run` | Read-only probes; never writes to stores |
| `aggregate-summary` job | `ubuntu-latest` | always() after publish | Reads per-target outcome artifacts; writes `$GITHUB_STEP_SUMMARY` |
| `cws-bootstrap.mjs` | Maintainer's local laptop | manual `node scripts/cws-bootstrap.mjs` | Local HTTP server; outputs to stdout only |

## 6. Topology constraints (carry-forward)

- **Functional paradigm**: orchestrator is the only "shell" component that imports both pure decisions and effectful adapters. All matrix-leg work invokes the orchestrator, not adapters directly.
- **No source-manifest mutation in CI**: `git diff --exit-code -- src/manifest.json package.json` runs at end of `publish` job to enforce.
- **Memory rule**: build job runs on tag push; publish job is gated. Tag push CANNOT cause a marketplace submission.
- **Existing scripts unchanged**: `find-next-amo-version.mjs`, `sign-firefox-xpi.mjs`, `patch-firefox-manifest.mjs` invoked from build job only, exact same flags as today.

## 7. Open items deferred to DELIVER

These are implementation details for software-crafter, not platform decisions:
- Exact JSON shape of per-target outcome artifact (must round-trip through `aggregateOutcomes`).
- Stryker config file location (`stryker.config.json` at repo root recommended; DEVOPS does not mandate).
- Pact-JS broker decision: file-based committed fixtures recommended (zero infra). DEVOPS deferred to DELIVER per `design/wave-decisions.md` open question 2.
