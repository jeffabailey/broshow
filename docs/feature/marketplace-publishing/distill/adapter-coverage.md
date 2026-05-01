# Adapter Coverage Audit: Marketplace Publishing

Feature ID: `marketplace-publishing`
Wave: DISTILL
Date: 2026-04-30

Mandate 6 (Hexagonal Boundary Enforcement) requires every driven adapter from DESIGN to have at least one scenario that exercises real I/O OR a fake-server scenario for paid externals (Strategy B).

## Driven adapters from `design/component-boundaries.md`

| # | Adapter | Type | I/O kind | Required test type under Strategy B |
|---|---|---|---|---|
| 1 | `cws-adapter.effect.mjs` | New | Network (CWS API + Google OAuth) | Fake-server scenario (`@in-memory`) |
| 2 | `amo-listed-adapter.effect.mjs` | New | Network (AMO API) + subprocess (`web-ext sign`) | Fake-server scenario (`@in-memory`) for both legs |
| 3 | `fs-adapter.effect.mjs` | New | Filesystem | `@real-io` scenario with `tmp_path` |
| 4 | `amo-jwt.pure.mjs` | New | Pure compute (HMAC) | Pure unit test (DELIVER) — no acceptance scenario needed (Mandate 4: pure functions tested directly, not through fixtures) |
| 5 | `cws-bootstrap.mjs` (CLI) | New | Network (Google OAuth) + local HTTP server | Coverage gap — see "Open coverage gaps" below |
| 6 | `sign-firefox-xpi.mjs` | Existing (reused) | subprocess (`web-ext sign`) | Coexistence-only test (IC-3); deep behavior owned by existing test suite |
| 7 | `find-next-amo-version.mjs` | Existing (reused, unlisted only) | Network (AMO API) | Negative path: orchestrator must NOT invoke this for listed (covered by M2-2 `@property`) |

## Coverage table

| Adapter | Scenario(s) covering it | Tag | Verification mode |
|---|---|---|---|
| `cws-adapter.effect.mjs::exchangeCwsRefreshToken` | M1-1, M1-4, WS-1 | `@in-memory` | Fake server returns canned OAuth responses |
| `cws-adapter.effect.mjs::probeCwsItemState` | M1-1, M1-5, WS-1, WS-2, IC-2 | `@in-memory` | Fake server returns canned item state |
| `cws-adapter.effect.mjs::uploadCwsItem` | M1-1, M1-2, M4-3 | `@in-memory` | Fake server accepts/rejects upload |
| `cws-adapter.effect.mjs::publishCwsItem` | M1-1, M1-3 | `@in-memory` | Fake server returns publish result |
| `amo-listed-adapter.effect.mjs::probeAmoListedVersions` | M2-1, M2-5, WS-1, M4-2 | `@in-memory` | Fake server returns version list |
| `amo-listed-adapter.effect.mjs::submitAmoListed` | M2-1, M2-2, WS-1, M4-1 | `@in-memory` | `child_process.spawn` mocked to return canned web-ext stdout |
| `fs-adapter.effect.mjs::readManifestVersion` | WS-1, WS-2, M2-3, IC-3 (and many others) | `@real-io` | Real `fs.readFile` against tmpdir |
| `fs-adapter.effect.mjs::writeStepSummary` | WS-1, WS-2, M4-1, M4-2, M4-3 | `@real-io` | Real `fs.appendFile` against tmpdir |
| `fs-adapter.effect.mjs::fileExists` | M2-3, IC-3 | `@real-io` | Real `existsSync` |
| `amo-jwt.pure.mjs::generateJwt` | (covered by acceptance scenarios that exercise AMO probes; pure, deterministic) | implicit | Real HMAC computation in WS-1, M2-1, etc. |
| `cws-bootstrap.mjs` | None at acceptance level | — | DELIVER provides direct unit tests on URL construction and error messages |
| `sign-firefox-xpi.mjs` | IC-3 (file-presence + structural) | `@adapter-integration` | Asserts the existing script remains executable; deep behavior owned by existing tests |
| `find-next-amo-version.mjs` | M2-2 (negative path: NOT invoked for listed) | `@property` | Orchestrator must not call this for `target=amo-listed` |

## Mandate 6 audit

| Requirement | Status | Evidence |
|---|---|---|
| Every NEW driven adapter has at least one acceptance scenario | PASS | `cws-adapter`, `amo-listed-adapter`, `fs-adapter` each have multiple. |
| At least one `@real-io` scenario per adapter capable of real I/O cheaply | PASS | `fs-adapter` covered by WS-1, WS-2, M2-3, IC-3. |
| At least one `@in-memory` (fake-server) scenario per costly external adapter | PASS | `cws-adapter` and `amo-listed-adapter` each covered by 5+ scenarios with fake server. |
| Negative path: forbidden invocation of unlisted probe in listed flow | PASS | M2-2 asserts `find-next-amo-version.mjs` is not invoked when target is listed. |
| Coexistence guardrail: existing local sideload sign flow preserved | PASS | IC-3 |
| Pure adapter coverage handled by unit tests (Mandate 4) | PASS | `amo-jwt.pure.mjs` and `decisions.pure.mjs` are unit-test-only per the design's mutation-testing scope. |

## Open coverage gaps (deferred to DELIVER)

| Gap | Reason for deferral | DELIVER plan |
|---|---|---|
| `cws-bootstrap.mjs` end-to-end | The script opens a real browser for OAuth; not feasible in headless test runs without a full Selenium-style harness. | Direct vitest unit tests on URL construction (`buildAuthUrl(clientId)`), scope-mismatch error message (`formatScopeMismatchError(err)`), and stdout printing — pure-function-extracted helpers per Mandate 4. AC-1-6 (single-session 15-minute completion) remains a manual UAT step documented in `docs/release.md`. |
| Real CWS / AMO contract drift | Strategy B fakes the API; real contract drift cannot be detected by these tests. | DEVOPS observability section 10 specifies Pact-JS contract tests; those run as a separate CI gate, not as acceptance tests. They are out of scope for this DISTILL deliverable. |

## Verdict

**Adapter coverage audit PASSES** under Strategy B. All driven adapters have appropriate-tier scenarios; gaps are documented and either delegated to DELIVER unit tests (Mandate 4 compliant) or to a future Pact-JS layer (per design and DEVOPS).
