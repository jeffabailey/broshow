# Test Scenarios: Marketplace Publishing

Feature ID: `marketplace-publishing`
Wave: DISTILL
Date: 2026-04-30

## Overview

Total scenarios: **27** across 7 vitest files. Error-path ratio: **12 / 27 = 44.4%** (>= 40% target met).

| File | Scenarios | Error-path |
|---|---|---|
| `walking-skeleton.test.mjs` | 2 (WS-1, WS-2) | 0 |
| `milestone-1-cws-publish.test.mjs` | 5 | 2 |
| `milestone-2-amo-listed.test.mjs` | 5 | 2 |
| `milestone-3-environment-gate.test.mjs` | 4 | 1 |
| `milestone-4-failure-recovery.test.mjs` | 5 | 5 |
| `milestone-5-dry-run.test.mjs` | 3 | 2 |
| `integration-checkpoints.test.mjs` | 3 | 0 |
| **Total** | **27** | **12** |

## Tag legend

| Tag | Meaning |
|---|---|
| `@walking_skeleton` | Walking skeleton (E2E user-value through real orchestrator wiring) |
| `@real-io` | Exercises real filesystem and/or real crypto (no in-memory FS) |
| `@in-memory` | Uses fake CWS/AMO servers (fetch stub) and/or fake `web-ext sign` (spawn mock) |
| `@adapter-integration` | Adapter-level test exercising real I/O (filesystem or crypto) |
| `@error-path` | Negative scenario (error / edge case) — counts toward 40% target |
| `@dry-run` | Read-only verification path (no writes performed) |
| `@memory-rule` | Verifies the no-auto-publish-without-go-ahead invariant |
| `@property` | Universal invariant suitable for property-based testing in DELIVER |
| `@env:NAME` | Binds the scenario to one of the named environments in `devops/environments.yaml` |

## Driving-port column

Every scenario lists the driving port it exercises (DP1-DP5 per `design/data-models.md` section 4). Step definitions invoke that port directly; internal modules are exercised indirectly. Mandate 1 compliance.

---

## Walking skeleton (`walking-skeleton.test.mjs`)

| ID | Title | Driving port | Tags | AC traceability |
|---|---|---|---|---|
| WS-1 | Maintainer publishes v0.3.0 to Chrome Web Store and Firefox AMO listed | DP1 (`runPublish`) | `@walking_skeleton @real-io @in-memory @env:clean` | AC-3-3, AC-3-4, AC-3-5, AC-3-10, AC-X-4 |
| WS-2 | Maintainer dry-runs v0.3.0 against both marketplaces | DP2 (`runDryRun`) | `@walking_skeleton @real-io @in-memory @dry-run @env:clean` | AC-5-2, AC-5-3, AC-5-4, AC-5-5 |

---

## Milestone 1 — Chrome Web Store publish (`milestone-1-cws-publish.test.mjs`)

| ID | Title | Driving port | Tags | AC traceability |
|---|---|---|---|---|
| M1-1 | Maintainer publishes a fresh CWS version with publishTarget=default | DP1 | `@in-memory @real-io @env:clean` | AC-3-6, AC-3-7, AC-2-1 (analog: tag verbatim) |
| M1-2 | Maintainer uploads to CWS without submitting (upload-only mode) | DP1 | `@in-memory @real-io @env:clean` | AC-3-7 |
| M1-3 | Maintainer publishes to CWS with publishTarget=trustedTesters | DP1 | `@in-memory @real-io @env:clean` | AC-3-7 |
| M1-4 | Maintainer's request fails when refresh token is rejected | DP1 | `@in-memory @real-io @error-path @env:with-stale-cws-token-near-expiry` | AC-3-4, AC-3-5, AC-4-2, AC-4-3 |
| M1-5 | Maintainer's request reports already-published when version exists | DP1 | `@in-memory @real-io @error-path @env:clean` | AC-3-8, AC-4-2, AC-4-3 |

---

## Milestone 2 — AMO listed publish (`milestone-2-amo-listed.test.mjs`)

| ID | Title | Driving port | Tags | AC traceability |
|---|---|---|---|---|
| M2-1 | Maintainer publishes a fresh AMO listed submission | DP1 | `@in-memory @real-io @env:clean` | AC-2-1, AC-2-2, AC-2-7 |
| M2-2 | Maintainer's listed publish uses the source manifest version verbatim with no auto-bump probe | DP1 | `@in-memory @real-io @property @env:clean` | AC-2-1 |
| M2-3 | Maintainer's listed publish never modifies source manifest or package.json | DP1 | `@in-memory @real-io @property @env:clean` | AC-2-5 |
| M2-4 | Maintainer's listed publish fails when AMO credentials are missing | DP1 | `@in-memory @real-io @error-path @env:clean` | AC-2-6 |
| M2-5 | Maintainer's listed publish reports already-published when version exists | DP1 | `@in-memory @real-io @error-path @env:clean` | AC-2-4, AC-3-8 |

---

## Milestone 3 — Environment gate + memory-rule preservation (`milestone-3-environment-gate.test.mjs`)

| ID | Title | Driving port | Tags | AC traceability |
|---|---|---|---|---|
| M3-1 | Tag push alone does NOT trigger any marketplace publish | DP4 | `@memory-rule @real-io @env:clean` | AC-3-1, AC-3-9, AC-X-5 |
| M3-2 | Workflow file gates the publish job behind the marketplace-prod environment | DP4 | `@memory-rule @real-io @env:clean` | AC-3-2 |
| M3-3 | Workflow file routes only workflow_dispatch events to the publish job | DP4 | `@memory-rule @real-io @env:clean` | AC-3-1, AC-X-5 |
| M3-4 | Targets input rejects values outside the allowed set | DP1 | `@real-io @error-path @env:clean` | AC-3-6 |

The first three M3 scenarios are static inspection of `.github/workflows/release.yml` plus orchestrator behavior; they verify the *structural* memory-rule guardrail without executing GitHub Actions. M3-4 is a behavioral driving-port test.

---

## Milestone 4 — Per-target failures and recovery (`milestone-4-failure-recovery.test.mjs`)

| ID | Title | Driving port | Tags | AC traceability |
|---|---|---|---|---|
| M4-1 | Maintainer's CWS submission fails with auth_expired but AMO listed succeeds | DP1 | `@in-memory @real-io @error-path @env:with-stale-cws-token-near-expiry` | AC-3-4, AC-4-1, AC-4-4 |
| M4-2 | Maintainer's AMO listed submission fails with rate_limited but CWS succeeds | DP1 | `@in-memory @real-io @error-path @env:with-amo-throttle-active` | AC-3-4, AC-4-1, AC-4-4 |
| M4-3 | Maintainer's CWS upload fails with rate_limited and recovery hint targets cws only | DP1 | `@in-memory @real-io @error-path @env:with-cws-rate-limit-active` | AC-3-4, AC-4-1, AC-4-4 |
| M4-4 | Maintainer recovers by re-dispatching with targets="cws" only | DP1 | `@in-memory @real-io @error-path @env:clean` | AC-4-1 |
| M4-5 | Maintainer re-dispatch on a fully published version reports already-published for both targets | DP1 | `@in-memory @real-io @error-path @env:clean` | AC-3-8, AC-4-2, AC-4-3 |

All five M4 scenarios are error-path. This milestone alone supplies 5/12 (42%) of the feature's error-path scenarios.

---

## Milestone 5 — Dry-run (`milestone-5-dry-run.test.mjs`)

| ID | Title | Driving port | Tags | AC traceability |
|---|---|---|---|---|
| M5-1 | Maintainer's dry-run validates without submitting | DP2 | `@in-memory @real-io @dry-run @env:clean` | AC-5-1, AC-5-2, AC-5-3, AC-5-4 |
| M5-2 | Maintainer's dry-run detects an expired refresh token | DP2 | `@in-memory @real-io @dry-run @error-path @env:with-stale-cws-token-near-expiry` | AC-5-6 |
| M5-3 | Maintainer's dry-run detects a version conflict | DP2 | `@in-memory @real-io @dry-run @error-path @env:clean` | AC-5-7 |

---

## Integration checkpoints (`integration-checkpoints.test.mjs`)

Cross-cutting acceptance criteria that span multiple milestones. Each is its own scenario.

| ID | Title | Driving port | Tags | AC traceability |
|---|---|---|---|---|
| IC-1 | Maintainer's logs never contain a verbatim secret value | DP1 | `@in-memory @real-io @property @env:clean` | AC-X-1 |
| IC-2 | Maintainer's re-dispatch on the same version is observably idempotent | DP1 | `@in-memory @real-io @property @env:clean` | AC-3-8 (idempotency invariant) |
| IC-3 | Maintainer's existing local sideload xpi flow is preserved | DP5 | `@real-io @adapter-integration @env:clean` | AC-2-3, AC-2-7 |

IC-3 is the dedicated `@adapter-integration` scenario for the `fs-adapter` driven adapter (Mandate 6 audit).

---

## User-story-to-scenario coverage matrix (Dimension 8 Check A)

| Story | Scenarios | Coverage |
|---|---|---|
| US-1 (CWS bootstrap) | (covered by orchestrator-side dry-run validating credentials; bootstrap CLI itself has scaffold + future direct test) | Partial — dry-run scenarios M5-2 cover the AC-1-4 acceptance path. AC-1-1, AC-1-2, AC-1-5, AC-1-6 are scaffolded for direct test in DELIVER (manual UAT acceptable for AC-1-6 single-session timing). |
| US-2 (AMO listed) | M2-1, M2-2, M2-3, M2-4, M2-5, IC-3 | Full |
| US-3 (Trigger publish) | WS-1, M1-1..M1-5, M3-1..M3-4, M4-1..M4-5, IC-1, IC-2 | Full |
| US-4 (Recovery) | M4-1, M4-2, M4-3, M4-4, M4-5 | Full |
| US-5 (Dry-run) | WS-2, M5-1, M5-2, M5-3 | Full |

US-1 partial coverage is the only soft spot: the bootstrap CLI is local-only and runs an OAuth flow that opens a real browser. Acceptance-test coverage at the unit level (URL construction, scope-mismatch error message formatting) is delegated to DELIVER's unit tests on the bootstrap module. AC-1-6 ("15-minute completion") is observable only through manual UAT; this is documented and accepted.

## Property-based candidates (`@property`)

Three scenarios are tagged `@property` for DELIVER's crafter to consider implementing as property-based tests:

- **M2-2** "uses source manifest version verbatim with no auto-bump probe": for any tag matching the manifest version, the orchestrator must emit exactly that version verbatim and never call `find-next-amo-version.mjs`. Universal invariant.
- **M2-3** "never modifies source manifest or package.json": for any input combination, source files remain bit-identical after orchestrator execution. Universal invariant.
- **IC-1** "logs never contain a verbatim secret": for any value of `CWS_*` / `AMO_*` env vars, no log line emitted by the orchestrator contains that value. Universal invariant suitable for a property-based test with arbitrary secret values.
- **IC-2** "re-dispatch on same version is idempotent": for any number of repeated dispatches with the same inputs, the marketplace state and outcome classification are identical from the second dispatch onward.

## Environment matrix coverage (Dimension 8 Check B)

| environments.yaml entry | Walking-skeleton or scenario | Verification |
|---|---|---|
| `clean` | WS-1, WS-2 (and many others) | Pass |
| `with-amo-throttle-active` | M4-2 | Pass |
| `with-cws-rate-limit-active` | M4-3 | Pass |
| `with-stale-cws-token-near-expiry` | M1-4, M4-1, M5-2 | Pass |

All four environments have at least one scenario. The two walking skeletons both bind to `clean`; per Dim 8 Check B, only one WS per env is required so this passes.

## Scenario-to-AC matrix

| AC | Scenario(s) | AC Type |
|---|---|---|
| AC-1-1 | (deferred to DELIVER unit test) | DP3 internal |
| AC-1-2 | (deferred to DELIVER unit test) | DP3 internal |
| AC-1-3 | (compile-time check on `docs/release.md` content) | doc-only |
| AC-1-4 | M5-1, M5-2 | DP2 |
| AC-1-5 | (deferred to DELIVER unit test on bootstrap script) | DP3 internal |
| AC-1-6 | (manual UAT — single-session timing) | manual |
| AC-2-1 | M2-2, M2-5 | DP1 |
| AC-2-2 | M2-1 | DP1 |
| AC-2-3 | IC-3 | DP5 |
| AC-2-4 | M2-5 | DP1 |
| AC-2-5 | M2-3 | DP1 (negative) |
| AC-2-6 | M2-4 | DP1 |
| AC-2-7 | M2-1, IC-3 | DP1 + DP5 |
| AC-3-1 | M3-1, M3-3 | DP4 (negative) |
| AC-3-2 | M3-2 | DP4 |
| AC-3-3 | WS-1 | DP1 |
| AC-3-4 | WS-1, M1-4, M4-1, M4-2 | DP1 |
| AC-3-5 | WS-1, M1-4, M4-1, M4-2, M4-3 | DP1 |
| AC-3-6 | M1-1, M3-4 | DP1 |
| AC-3-7 | M1-1, M1-2, M1-3 | DP1 |
| AC-3-8 | M1-5, M2-5, M4-5, IC-2 | DP1 |
| AC-3-9 | M3-1 | DP4 |
| AC-3-10 | WS-1, M4-1, M4-2 | DP1 |
| AC-4-1 | M4-1, M4-2, M4-3, M4-4 | DP1 |
| AC-4-2 | M1-4, M1-5, M4-5 | DP1 |
| AC-4-3 | M1-5, M2-5, M4-5 | DP1 |
| AC-4-4 | M4-1, M4-2, M4-3 | DP1 |
| AC-4-5 | (compile-time: recovery hint references `docs/release.md`; verified in M4-* assertions) | DP1 |
| AC-5-1 | M5-1 | DP2 |
| AC-5-2 | WS-2, M5-1 | DP2 |
| AC-5-3 | WS-2, M5-1 | DP2 |
| AC-5-4 | WS-2, M5-1 | DP2 |
| AC-5-5 | (structural: dry-run job has no `environment:` directive in workflow YAML; covered by M3-2 inverse check) | DP4 |
| AC-5-6 | M5-2 | DP2 |
| AC-5-7 | M5-3 | DP2 |
| AC-X-1 | IC-1 | DP1 |
| AC-X-2 | (architecture rule grep CI step; not an acceptance scenario) | structural |
| AC-X-3 | (Stryker mutation gate; not an acceptance scenario) | structural |
| AC-X-4 | WS-1 (timing assertion) | DP1 |
| AC-X-5 | M3-1 | DP4 |

Every AC either has a scenario, is correctly delegated to a structural/compile-time check, or is documented as a manual UAT step (AC-1-6 only). No AC is silently uncovered.
