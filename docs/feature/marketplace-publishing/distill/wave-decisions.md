# Wave Decisions: Marketplace Publishing (DISTILL)

Feature ID: `marketplace-publishing`
Wave: DISTILL
Date: 2026-04-30
Mode: Auto (decisions pre-made by orchestrator brief)

## Pre-decided inputs honored

The orchestrator's brief pre-decided several DISTILL choices to skip interactive prompts. All are recorded here as binding for DELIVER.

| # | Decision Point | Decision | Rationale |
|---|---|---|---|
| D1 | Walking skeleton strategy | **Strategy B (Real local + fake costly)** | Filesystem and JWT signing run real (cheap, deterministic). CWS API, AMO API, and `web-ext sign` subprocess are faked because real invocations consume paid quota or burn irreversible AMO/CWS version slots (see v0.2.17 incident; `feedback_no_auto_release.md`). |
| D2 | Test runner | **vitest with Option B (BDD-shaped describe/it)** | Project already uses vitest. Introducing `@cucumber/cucumber` adds a runner, devDep, and config surface for negligible benefit at this feature size. Scenarios are tagged via structured `describe`/`it` titles such as `[walking-skeleton][real-io] WS-1: ...`. |
| D3 | Container preference | **None** | Tests run in-process with fetch interception (`vi.stubGlobal('fetch', ...)`) and `child_process.spawn` mocking. No Docker/testcontainers/wiremock processes. |
| D4 | RED-ready scaffolds | **`__SCAFFOLD__ = true` marker + `throw new Error('Not yet implemented -- RED scaffold')`** body for every production module the acceptance tests import | Mandate 7. Ensures test failures classify as RED (function executed, threw deliberately) rather than BROKEN (import failed). |
| D5 | Test directory layout | `tests/acceptance/marketplace-publishing/` for the seven `.test.mjs` files; `tests/acceptance/marketplace-publishing/fixtures/` for fake servers and env-state setups | Mirrors existing `tests/acceptance/firefox-recording-support/` layout; keeps acceptance suites scoped per feature. |

## Walking-skeleton strategy detail (D1)

**Strategy B = Real local resources + fake costly externals.**

| Concern | Real or Fake? | Justification |
|---|---|---|
| Filesystem: manifest reads, xpi/zip writes, staging dirs | **Real** (vitest `tmp_path`-equivalent via `os.tmpdir()`) | Cheap, deterministic, fast. Also catches path-resolution and FS-permission bugs that an InMemory FS would silently let pass. |
| JWT signing (HMAC-SHA256 in `node:crypto`) | **Real** | Pure compute, no I/O; mocking would only test the test itself. |
| AMO API (probe + submission) | **Fake server** (in-process fetch interceptor) | Real AMO has a 60-req/min listed-API quota; throttling caused a real incident (v0.2.17). Burning version slots during test runs is irreversible. |
| CWS API (OAuth, probe, upload, publish) | **Fake server** (in-process fetch interceptor) | OAuth refresh exchange is free but real publishes are irreversible (you cannot delete a CWS upload). |
| `web-ext sign` subprocess | **Fake** (mocked `child_process.spawn`) | Invoking it for real consumes an AMO submission slot (same cost as a real listed publish). |

**Fixture-tier litmus test (Dim 9d)**: "If the real adapter were deleted, would WS-1 still pass?"
- For filesystem and JWT crypto: **NO** — WS exercises real `fs.writeFile`, `crypto.createHmac`. Deleting `fs-adapter.effect.mjs` or `amo-jwt.pure.mjs` would break the WS. Pass.
- For CWS/AMO: WS deliberately hits the fake. The dedicated `@adapter-integration` scenario for `fs-adapter.effect.mjs` covers the "real I/O" axis. CWS/AMO real-API coverage is deferred to a future contract-test stage (Pact-JS) per design ADR-005/006 and DEVOPS observability section 10.

## Reconciliation gate

| Check | Result |
|---|---|
| Q3 environment-gated publish job (DISCUSS lock) vs DEVOPS ci-cd-pipeline.md section 4.2 | Both use `environment: marketplace-prod` on `publish` job with `if: github.event_name == 'workflow_dispatch'`. **No contradiction.** |
| ADR-005 direct fetch (no `chrome-webstore-upload` library) | `cws-adapter.effect.mjs` port signatures pass `creds` explicitly; tests exercise via orchestrator. **No contradiction.** |
| ADR-006 `web-ext sign --channel listed` for AMO | `amo-listed-adapter.effect.mjs::submitAmoListed` wraps `web-ext sign`. Tests mock `child_process.spawn`. **No contradiction.** |
| DEVOPS publish-dry-run job (mode=dry-run) is read-only | All `@dry-run` scenarios assert zero state mutation on fake servers. **No contradiction.** |

**Reconciliation passed -- 0 contradictions.**

## Driving ports tagged per AC

The driving ports for this feature are:

1. **DP1 — `runPublishWorkflow`**: GitHub Actions workflow trigger (`workflow_dispatch`) -> orchestrator's `main()`. Step definitions invoke `scripts/publish-orchestrator.effect.mjs` programmatically with a `ProcessEnv`-shaped object.
2. **DP2 — `runDryRun`**: Same orchestrator, `MODE=dry-run` in env.
3. **DP3 — `runBootstrap`**: `scripts/cws-bootstrap.mjs` CLI entrypoint.
4. **DP4 — `release.yml` build job (existing)**: Negative-path scenarios that observe the tag-push behavior is unchanged. Verified via inspection of the workflow file content (memory-rule guardrail), not by executing GitHub Actions in-process.
5. **DP5 — existing `sign-firefox-xpi.mjs`**: Coexistence guardrail for AC-2-3 / AC-2-7. Verified by file presence + signature; deep behavioral test is owned by the existing test suite.

DP-to-AC mapping is unchanged from `design/data-models.md` section 4.

## Adapter coverage (Mandate 6)

See `adapter-coverage.md` for the full table. Summary: every driven adapter from DESIGN has at least one `@real-io` (for filesystem) or `@in-memory` fake-server scenario.

## Decisions delegated downstream

| To | Decision |
|---|---|
| DELIVER | Filling in scaffold function bodies; no further test-design choices left. |
| Future Pact-JS work (post-merge gate) | Real CWS/AMO contract tests for production-API drift detection. DEVOPS observability section 10 describes the contract-testing hook. |

## Handoff status

| Artifact | Path | Status |
|---|---|---|
| Walking skeleton declaration | `walking-skeleton.md` | Complete |
| Test scenario list | `test-scenarios.md` | Complete |
| Acceptance review (Dim 9 + Mandate 7 + adapter audit) | `acceptance-review.md` | Complete |
| Adapter coverage table | `adapter-coverage.md` | Complete |
| Wave decisions | This document | Complete |
| WS test file | `tests/acceptance/marketplace-publishing/walking-skeleton.test.mjs` | Complete (RED) |
| Milestone test files | `tests/acceptance/marketplace-publishing/milestone-{1..5}-*.test.mjs` | Complete (RED) |
| Cross-cutting test file | `tests/acceptance/marketplace-publishing/integration-checkpoints.test.mjs` | Complete (RED) |
| Fake-server fixtures | `tests/acceptance/marketplace-publishing/fixtures/{cws-fake,amo-fake,scenarios}.mjs` | Complete |
| Production scaffolds | `scripts/{publish-orchestrator,cws-adapter,amo-listed-adapter,decisions,cws-bootstrap,fs-adapter,amo-jwt}.{effect,pure}.mjs` (7 files) | Complete (RED-ready) |

**Ready for DELIVER.**
