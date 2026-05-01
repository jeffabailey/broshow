# Acceptance Review: Marketplace Publishing

Feature ID: `marketplace-publishing`
Wave: DISTILL
Date: 2026-04-30
Reviewer: acceptance-designer (self-review per critique-dimensions skill, Dimensions 1-9 + Mandate 7)

## Self-review summary

```yaml
review_id: "accept_rev_2026-04-30T00:00Z_marketplace-publishing"
reviewer: "acceptance-designer (self-review)"
approval_status: approved
```

## Strengths

- Driving-port-anchored throughout: every behavioral scenario invokes the orchestrator's `runPublish` (DP1) or `runDryRun` (DP2) entrypoint; static-inspection scenarios (M3-1..M3-3) explicitly test the workflow YAML structure as the `release.yml` driving boundary (DP4).
- Strategy B walking-skeleton choice surfaces the real cost trade-off: filesystem and JWT crypto are real (cheap, deterministic, catches wiring bugs); CWS/AMO are faked because real submissions are irreversible.
- Error-path ratio 12/27 = 44.4%, exceeding the 40% target.
- Property-shaped invariants explicitly tagged `@property` (M2-2, M2-3, IC-1, IC-2) so DELIVER's crafter can implement them as property-based tests.
- All driven adapters from DESIGN have at least one scenario at the appropriate fixture tier (real for filesystem, fake-server for CWS/AMO).

## Dimension-by-dimension review

### Dim 1: Happy Path Bias

| Check | Result |
|---|---|
| Error-path scenarios >= 40% of total | **PASS** — 12 / 27 = 44.4% |
| Coverage of failure modes: invalid creds | M1-4, M5-2 |
| Coverage of failure modes: rate limit | M4-2, M4-3 |
| Coverage of failure modes: version conflict | M1-5, M2-5, M4-5, M5-3 |
| Coverage of failure modes: missing creds | M2-4 |
| Coverage of partial-failure recovery | M4-1, M4-2, M4-3, M4-4 |

No blocker.

### Dim 2: GWT Format Compliance

Every scenario in the test files is structured as `// GIVEN: ...`, `// WHEN: ...`, `// THEN: ...` comment blocks within a single `it`. Each scenario has exactly one `WHEN` step (single user action). No conjunction violations.

Spot-check WS-1:
- GIVEN: tag, manifest version, artifacts on disk, credentials, no prior versions (preconditions only — no actions)
- WHEN: orchestrator runs with TARGETS="cws,amo-listed", MODE="publish" (single action)
- THEN: two success outcomes, summary file lists both targets, exit 0 (multiple observable outcomes — allowed)

No high-severity findings.

### Dim 3: Business Language Purity

Searched for technical leakage in scenario titles and assertions:

| Term | Found in test titles? | Resolution |
|---|---|---|
| "API" | No | — |
| "HTTP" | No (status codes referenced only inside fake-server fixtures, never in scenario assertions) | — |
| "JSON" | No | — |
| "controller", "service" | No | — |
| "database" | No | — |
| "200", "404", "500" | No (specific status codes are an implementation detail of the fakes; scenarios assert on outcome classification: `success`, `failure`, `already-published`, etc.) | — |

The only borderline term is "OAuth" which appears in scenario titles (M1-4: "refresh token"). This is acceptable because OAuth and refresh tokens ARE the domain's ubiquitous language per `discuss/requirements.md` section 3 and US-1. Promoting these to "credentials" would obscure the specific failure mode.

No high-severity findings.

### Dim 4: Coverage Completeness

See `test-scenarios.md` "Scenario-to-AC matrix" — every AC either has a scenario, is delegated to a structural check, or is documented as a manual UAT step (only AC-1-6, the 15-minute timing target, falls into the manual category).

| Story | Coverage |
|---|---|
| US-1 | Partial: M5-2 covers AC-1-4; AC-1-1, AC-1-2, AC-1-5 deferred to DELIVER unit tests on `cws-bootstrap.mjs`; AC-1-6 manual UAT |
| US-2 | Full |
| US-3 | Full |
| US-4 | Full |
| US-5 | Full |

US-1 partial coverage is a known pattern: bootstrap CLI runs OAuth in a real browser; acceptance-test coverage at the orchestrator level is limited to "the credentials downstream of the bootstrap work" (M5-2 does this). This is documented in `adapter-coverage.md`.

No blocker.

### Dim 5: Walking Skeleton User-Centricity

Litmus test on each WS:

**WS-1**:
- Title: "Maintainer publishes v0.3.0 to Chrome Web Store and Firefox AMO listed". User goal? **Yes.**
- GIVEN clauses: "Jeff has tagged v0.3.0", "build artifacts exist", "credentials are valid", "no prior version". User actions/context? **Yes.**
- THEN clauses: "two success outcomes", "step summary lists both marketplaces", "exit 0". User observations? **Yes** (the maintainer sees the workflow run output and the summary).
- Non-technical stakeholder confirmation: "yes, that is what users (Jeff the maintainer) need." **PASS.**

**WS-2**:
- Title: "Maintainer dry-runs v0.3.0 against both marketplaces". User goal? **Yes.**
- THEN clauses: "two would-succeed outcomes", "no upload/publish/sign call hits any fake server", "step summary prefixed [DRY RUN]". User observations? **Yes** — the dry-run output is exactly what Jeff sees in the workflow log.
- **PASS.**

No high-severity findings.

### Dim 6: Priority Validation

Two tests: KPI-relevance and gap-relevance.

KPI #1 north star: maintainer time-to-publish under 60 seconds. Covered by WS-1 timing assertion (AC-X-4 traceability) and IC-2 idempotency (re-dispatch is fast because probe-before-submit short-circuits).

Gap relevance: the largest pre-feature pain point per DISCUSS is manual dashboard toil (KPI #2). Coverage: WS-1 + M1-1..M1-3 + M2-1 collectively prove "no manual dashboard interaction is required for the happy path." This is the right priority.

Test design decisions (Strategy B, vitest BDD) are data-justified by the v0.2.17 incident (real AMO publishes are irreversible) and the existing project test stack (already vitest).

No blocker.

### Dim 7: Observable Behavior Assertions

Mechanical checklist run on every Then assertion in the seven test files. The patterns used:

- `expect(result.exitCode).toBe(0)` — return value from driving port. **PASS.**
- `expect(result.outcomes).toContainEqual(expect.objectContaining({ target: 'cws', status: 'success' }))` — return value from driving port. **PASS.**
- `expect(summary).toContain('| cws | 0.3.0 | success |')` — observable file content (the step summary the maintainer sees). **PASS.**
- `expect(fakeCws.uploadCalls).toHaveLength(0)` — observable side effect on a fake server (proves dry-run did not write); this is technically "internal state of the fake" but the alternative is a private-state assertion that no upload occurred, which is exactly the user-meaningful invariant. Borderline, accepted under Mandate 1 because the fake server's state IS the externally observable system state from the orchestrator's perspective.
- `expect(fs.existsSync(...))` for the step summary file — observable file existence is a documented user-facing artifact (`$GITHUB_STEP_SUMMARY` is the maintainer's dashboard per DEVOPS observability section 3). **PASS** for this specific case; rejected pattern in general (per Dim 7 "asserts file existence (implementation detail)") but here the file IS the user-facing surface.

No internal-state assertions (`mock.called`, `_internal_field`, db query) are used. **PASS.**

### Dim 8: Traceability Coverage

**Check A — Story-to-Scenario mapping:**

| Story ID | Has at least one scenario? | Tag |
|---|---|---|
| US-1 | Partial (M5-2 covers AC-1-4); other ACs deferred per documented plan | `@us-1` (in scenario tags inside the test files) |
| US-2 | Yes (M2-1..M2-5, IC-3) | `@us-2` |
| US-3 | Yes (WS-1, M1-*, M3-*, M4-*, IC-*) | `@us-3` |
| US-4 | Yes (M4-*) | `@us-4` |
| US-5 | Yes (WS-2, M5-*) | `@us-5` |

All five stories have at least one scenario. **PASS** (US-1 partial is documented and not silently uncovered).

**Check B — Environment-to-Scenario mapping** (per `devops/environments.yaml`):

| Environment | Scenario(s) | Status |
|---|---|---|
| `clean` | WS-1, WS-2, M1-1, M1-2, M1-3, M1-5, M2-1..M2-5, M3-*, M4-4, M4-5, M5-1, M5-3, IC-1, IC-2, IC-3 | Pass |
| `with-amo-throttle-active` | M4-2 | Pass |
| `with-cws-rate-limit-active` | M4-3 | Pass |
| `with-stale-cws-token-near-expiry` | M1-4, M4-1, M5-2 | Pass |

All four environments have at least one scenario AND at least one walking skeleton (`clean` is exercised by both WS-1 and WS-2). **PASS.**

### Dim 9: Walking Skeleton Boundary Proof

**9a (strategy declaration)**: Strategy B declared in `wave-decisions.md` "Pre-decided inputs honored" table and `walking-skeleton.md` "Strategy declaration". **PASS.**

**9b (strategy-implementation match)**: Strategy B requires real for cheap local resources, fake for costly externals. WS-1 and WS-2 use real `node:fs` and real `node:crypto` (verified by reading the test files: they import `node:fs/promises`, `os.tmpdir()`, no `vi.mock` for filesystem). They mock `fetch` and `child_process.spawn` only. **PASS.**

**9c (adapter integration coverage)**: Per `adapter-coverage.md`, every NEW driven adapter has at least one acceptance scenario at the appropriate tier. `fs-adapter.effect.mjs` has `@real-io` coverage (multiple scenarios). `cws-adapter.effect.mjs` and `amo-listed-adapter.effect.mjs` have fake-server coverage (multiple scenarios). **PASS.**

**9d (walking-skeleton fixture tier)**: For local resource adapters (filesystem), if the real adapter were deleted, would WS-1 still pass? **No** — WS-1 reads real manifest and writes real summary. **PASS.**

**9e (strategy drift detection)**: Searching the WS test file for `@in-memory` on local-resource adapters: `@in-memory` tags appear only on the CWS/AMO fake-server scope (correct under Strategy B). Filesystem operations remain real. **PASS.**

## Mandate 7: RED-ready scaffolding

| Requirement | Status |
|---|---|
| Every production module imported by step definitions has a scaffold file | **PASS** — 7 production modules (`publish-orchestrator.effect.mjs`, `cws-adapter.effect.mjs`, `amo-listed-adapter.effect.mjs`, `decisions.pure.mjs`, `cws-bootstrap.mjs`, `fs-adapter.effect.mjs`, `amo-jwt.pure.mjs`) all created with `__SCAFFOLD__ = true` marker. |
| Each scaffold's function bodies throw `Error` (not TypeError) | **PASS** — all bodies throw `new Error('Not yet implemented -- RED scaffold')`. |
| Tests classify as RED (function called, threw deliberately) not BROKEN (import failed) | **PASS** — imports succeed (the scaffold modules export the documented function names); calls throw with the documented marker text. |

## Mandate compliance evidence

### CM-A: Driving port imports

Every test file imports ONLY:
- `scripts/publish-orchestrator.effect.mjs` (DP1, DP2 — the single entry point)
- `scripts/cws-bootstrap.mjs` (DP3 — only in scenarios that test the bootstrap CLI; currently none at acceptance level, deferred to DELIVER unit tests)
- Reads of `.github/workflows/release.yml` for DP4 static-inspection scenarios (M3-*)
- Reads of `package.json` `scripts.sign` for DP5 coexistence (IC-3)

Zero internal-component imports. Adapters (`cws-adapter`, `amo-listed-adapter`, `fs-adapter`) are imported by tests ONLY for the purpose of injecting test doubles via `vi.spyOn` namespace patching — never to call adapter functions directly.

### CM-B: Business language

Grep result: zero technical jargon in scenario titles. Domain language ("publish", "submit", "approve", "credentials", "version slot", "marketplace") matches DISCUSS section 3.

### CM-C: Walking skeleton + focused scenario count

- 2 walking skeletons (WS-1, WS-2)
- 25 focused scenarios (M1-1..M5-3 + IC-1..IC-3)

Within recommended ratio (2-5 WS, 15-20 focused for a typical feature; 25 focused is on the high side because this feature has 38 ACs across 5 stories — the elevated count is justified by AC density).

### CM-D: Pure function extraction

Pure functions identified for extraction (per design's `decisions.pure.mjs` and `amo-jwt.pure.mjs`):
- `parseTargets`, `parseMode`, `classifyVersionState`, `planRun`, `aggregateOutcomes`, `renderSummary`, `sanitizeForLog` — all in `decisions.pure.mjs`
- `generateJwt` — in `amo-jwt.pure.mjs`

These are tested DIRECTLY in unit tests (DELIVER). Acceptance tests exercise them through the orchestrator (driving port) so they appear in the scenario coverage indirectly. No fixture parametrization at the acceptance level except per environment per `environments.yaml`. **PASS.**

## Self-review checklist (orchestrator brief items)

- [x] WS strategy declared (`wave-decisions.md`, `walking-skeleton.md`)
- [x] WS scenarios tagged correctly (`@walking_skeleton @real-io @in-memory @env:clean`)
- [x] Every driven adapter has at least one `@real-io` or `@in-memory` fake-server scenario (see `adapter-coverage.md`)
- [x] Container preference documented (none; `wave-decisions.md` D3)
- [x] All production modules have scaffolds with `__SCAFFOLD__` marker (7 files)
- [x] All scaffolds raise `Error` (not throw new TypeError-style)
- [x] Tests are RED (function bodies throw), not BROKEN (imports succeed)
- [x] >= 40% of scenarios are `@error-path` (12/27 = 44.4%)

## Approval

**Status**: approved.

No blockers, no high-severity findings, no medium-severity findings worth blocking on. DELIVER may proceed.
