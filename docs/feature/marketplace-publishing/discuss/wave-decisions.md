# Wave Decisions: Marketplace Publishing (DISCUSS)

Feature ID: `marketplace-publishing`
Wave: DISCUSS
Date: 2026-04-30
Mode: Auto (decisions pre-made by orchestrator)

## Pre-made decisions (auto mode)

| # | Decision | Value | Rationale |
|---|---|---|---|
| 1 | Feature type | Infrastructure (CI/CD/DevOps) | No end-user UI; modifies GitHub Actions release pipeline. |
| 2 | Walking skeleton needed? | No | `release.yml` already publishes to GitHub Releases; this feature extends it. |
| 3 | UX research depth | Lightweight | "Users" are project maintainers running releases. |
| 4 | JTBD analysis | No | Straightforward DevOps automation; motivation (reduce manual store-upload toil) is clear. |
| 5 | Phase scope | Skip Phase 2 (journeys); run Phase 3 (requirements + stories) and produce wave-decisions summary | Per orchestrator brief. |

## Decisions made during DISCUSS

| # | Decision Point | Decision | Rationale |
|---|---|---|---|
| 6 | Number of user stories | 5 (US-1 through US-5) | Each addresses a distinct outcome: setup, listed-AMO support, publish trigger, recovery, dry-run. |
| 7 | Story sizing | All right-sized (0.75-2 days, 3-6 scenarios each) | Per LeanUX guidelines; avoids oversized-story anti-pattern. |
| 8 | Total feature effort | ~6 days | Within single delivery cycle; passes Phase 2.7 scope assessment. |
| 9 | Memory rule conflict surfacing | Explicit in `requirements.md` Section 8 + Q3 of critical questions | Per orchestrator brief: "do not silently override the rule." |
| 10 | Persona language | "Jeff" (single maintainer, real name) | Project is single-maintainer FOSS; abstract personas would be artificial. |
| 11 | Outcome KPI primary | Maintainer time-to-publish: ~10 min -> under 60 seconds | Captures core value of the feature in one number (north star). |
| 12 | Out-of-scope items | Multi-locale store copy, screenshot generation, Edge/Opera/Safari, beta channels, listing copy sync | Cuts feature down to just the publish-pipeline mechanics. |

## Locked product decisions (Q1-Q5) -- maintainer accepted 2026-04-30

The maintainer accepted Luna's recommendations verbatim. These are now binding for DESIGN.

| Q | Topic | LOCKED Decision | Rationale |
|---|---|---|---|
| Q1 | AMO listed vs unlisted | **Option B: both (additive)** | Preserves the local sideload-test workflow Jeff actively uses, while adding discoverable AMO listing. AMO consumes a version slot per channel (acceptable). |
| Q2 | CWS publish behavior | **Option B (`publishTarget=default`) with Option A (`upload-only`) exposed as workflow input** | Single-maintainer FOSS doesn't need a second manual gate beyond the environment approval; but expose `upload-only` for the rare inspect-before-submit case. |
| Q3 | Trigger model | **Option C: environment-gated publish job within `release.yml`** | Preserves memory rule (publish requires explicit approval click distinct from tag push); keeps build + publish provenance in one workflow run. |
| Q4 | Version conflict handling | **Option A: tag version verbatim, fail hard on conflict** for listed/CWS; **keep auto-bump** for AMO unlisted | Listed/CWS must equal source-of-truth tag (no silent divergence). Unlisted is sideload-test territory where drift is acceptable. |
| Q5 | Failure isolation / recovery | **Option A: per-store `targets` input + parallel jobs with end-of-run aggregation** | Aligns with NFR-3 (fail-safe). Cleanest recovery semantics. |

## Confirmed prerequisites (maintainer answers 2026-04-30)

- **Chrome Web Store developer account**: ACTIVE. Maintainer confirmed account is set up; OAuth credentials and `CWS_EXTENSION_ID` will be generated per DESIGN guidance.
- **AMO listing metadata**: Out of scope for v1 (sync of description/screenshots/categories handled manually on AMO dashboard for first listed submission).
- **GitHub Environments availability**: To be verified in DESIGN; if unavailable, fall back to Q3 Option B (separate `publish-stores.yml` with `workflow_dispatch`).

## Anti-patterns flagged and remediated

None present. See `dor-checklist.md` for full anti-pattern audit.

## Scope assessment (Phase 2.7 -- Elephant Carpaccio gate)

| Signal | Threshold | Actual | Status |
|---|---|---|---|
| Story map total stories | <= 10 | 5 | PASS |
| Bounded contexts spanned | <= 3 | 2 (CI/CD, marketplace APIs) | PASS |
| Walking skeleton integration points | <= 5 | 3 (CWS API, AMO API, GitHub Actions) | PASS |
| Estimated total effort | <= 2 weeks | ~6 days | PASS |
| Independent shippable outcomes | -- | US-1, US-2, US-5 ship independently; US-3 depends on US-1+US-2; US-4 depends on US-3 | PASS |

**Scope: right-sized. Single delivery cycle.**

## DoR aggregate

All 5 stories: **PASSED** (see `dor-checklist.md`).

## Constraints carried forward to DESIGN

1. **Functional programming paradigm** (`CLAUDE.md`): pure functions for argument parsing, classification, and state transitions; effect boundaries at HTTP and filesystem edges; algebraic types for marketplace state and outcomes.
2. **Per-feature mutation testing >= 80% kill rate** (`CLAUDE.md`).
3. **Memory rule** (`feedback_no_auto_release.md`): publish flow must not bypass "wait for explicit go-ahead" for version bumps / tags / pushes. Implementation guarantee: environment-gated publish job (Q3 Option C).
4. **Existing scripts and contracts**:
   - `scripts/patch-firefox-manifest.mjs` (`patchManifestForFirefox` pure transform) -- reuse.
   - `scripts/find-next-amo-version.mjs` (AMO unlisted version probe) -- reuse for unlisted only; do NOT call from listed publish.
   - `scripts/sign-firefox-xpi.mjs` (local unlisted sign) -- must continue to work unchanged.
   - `release.yml` (current build + GitHub release flow) -- extend, don't replace.
5. **No source-manifest mutation in CI** (consistent with current `sign-firefox-xpi.mjs` design): publish flow may patch staged copies but must never `git commit` to `package.json` or `src/manifest.json`.

## Open questions for DESIGN

These do not block DISCUSS handoff but should be resolved early in DESIGN:

1. Does Jeff already have a Chrome Web Store developer account (for US-1)? If not, account creation is a blocking prerequisite.
2. Are GitHub Environments available on this repository's plan? (If not, fallback to Q3 Option B: separate `publish-stores.yml` with `workflow_dispatch`.)
3. Does the AMO listing need one-time metadata (description, screenshots, categories) before the first listed submission? If so, document the manual prerequisite.
4. Should the dry-run mode also validate listing metadata sync (description, icons), or is that explicitly out of scope for v1? Current decision: out of scope.

## Handoff status

| Item | Status |
|---|---|
| Requirements document | Complete (`requirements.md`) |
| User stories | Complete (`user-stories.md`, 5 stories) |
| Acceptance criteria | Complete (`acceptance-criteria.md`) |
| DoR validation | All 5 stories PASSED (`dor-checklist.md`) |
| Outcome KPIs | Defined (`outcome-kpis.md`, 6 KPIs + guardrails) |
| Wave decisions | This document |
| JTBD artifacts | Skipped per Decision 4 |
| Journey artifacts | Skipped per Phase 2 scope skip |
| Peer review | Not invoked (orchestrator handles handoff per brief) |

**Ready for DESIGN handoff. Maintainer answers to Q1-Q5 should accompany the handoff package.**
