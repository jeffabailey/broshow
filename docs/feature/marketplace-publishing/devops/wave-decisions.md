# Wave Decisions: Marketplace Publishing (DEVOPS)

Feature ID: `marketplace-publishing`
Wave: DEVOPS
Date: 2026-04-30
Mode: Auto

This document is the DEVOPS decision summary. It captures the decisions made by Apex (platform-architect) during the DEVOPS wave, with explicit traceability back to DESIGN's open questions and DISCUSS's Q3 trigger model.

## 1. Open questions resolved

DESIGN left three open questions for DEVOPS (per `design/wave-decisions.md` section "Open architectural questions for maintainer"). Resolutions:

| # | Question | DEVOPS resolution | Source |
|---|---|---|---|
| 1 | GitHub Environments availability | **Available**. Repo `jeffabailey/broshow` is PUBLIC; GitHub Environments with required reviewers are free for public repos. **Q3 Option C selected** (environment-gated publish job). Fallback path (separate `publish-stores.yml`) is NOT used. | Verified via `gh repo view` per orchestrator brief; ADR-007 |
| 2 | Pact broker hosting | **File-based committed fixtures**. Zero infra, zero operational cost, sufficient for two consumer adapters at single-maintainer release cadence. Hosted Pact broker not justified. | Per `design/wave-decisions.md` open Q2 |
| 3 | AMO listing first-time metadata | **Out of scope per DISCUSS Q5 wave decision**. Maintainer creates the AMO listing manually before the first listed publish. The publish workflow expects the listing to already exist; first-time metadata sync (description, screenshots, categories) is deferred to a future iteration if ever requested. Documented in `environment-setup-instructions.md` Step 4. | Per `discuss/wave-decisions.md` Decision 12; DISCUSS Q5 |
| 4 | Stryker scope | **Mutate `scripts/*.pure.mjs` and classification helpers in `*.effect.mjs`; exclude raw HTTP send lines.** Per-feature mutation testing >= 80% kill rate (CLAUDE.md rule). Stryker config landed by DELIVER. | Per `design/wave-decisions.md` open Q4 |

## 2. Platform decisions made in DEVOPS

| # | Decision | Rationale | Affects |
|---|---|---|---|
| P1 | Trigger model: Q3 Option C (environment-gated publish job in `release.yml`) | GitHub Environments confirmed available for public repo | `ci-cd-pipeline.md` section 4 |
| P2 | Runner: `ubuntu-latest` for all jobs | No native binary needs; consistent with current `release.yml`; cheapest GitHub-hosted SKU | `platform-architecture.md` section 5 |
| P3 | CWS secrets: environment-scoped on `marketplace-prod`. AMO secrets: repo-scoped (kept as today). | CWS only used by publish job (env-gated). AMO used by both build (unlisted, tag push) AND publish (listed, dispatch). Repo scope necessary for AMO. | `secret-inventory.md` section 2 |
| P4 | Job graph: `build` -> `publish` (matrix on target) -> `aggregate-summary` | Failure isolation per target (Q5 Option A); single aggregation point for step summary and exit code | `ci-cd-pipeline.md` section 4.5 |
| P5 | Dry-run as separate sibling job (`publish-dry-run`), not conditional environment in `publish` job | GitHub Actions YAML doesn't support dynamic environment selection; cleanest implementation | `ci-cd-pipeline.md` section 4.3 |
| P6 | Concurrency group: `release-${{ inputs.tag || github.ref_name }}` with `cancel-in-progress: false` | Prevent two concurrent runs of same tag from racing on store APIs | `ci-cd-pipeline.md` section 3 |
| P7 | Artifact passing: `actions/upload-artifact@v4` build -> `actions/download-artifact@v4` publish | No rebuild in publish job; identical bytes published as released | `platform-architecture.md` section 2 |
| P8 | Step summary writer: `aggregate-summary` job only (single writer pattern) | Per-target jobs write outcome JSON to artifact; aggregate consumes; deterministic summary | `observability-plan.md` section 3 |
| P9 | KPI #1 (time-to-publish) instrumentation: computed in `aggregate-summary` from `RUN_STARTED_AT` env | Built-in GitHub Actions metadata; zero new infra | `observability-plan.md` section 5 |
| P10 | Test environment matrix (DISTILL handoff): `clean`, `with-amo-throttle-active`, `with-cws-rate-limit-active`, `with-stale-cws-token-near-expiry` | Adapted from nw-distill skill default; targets the four failure-classification branches the design's `Result<T, E>` types must handle | `environments.yaml` |
| P11 | No external observability stack (Grafana/Prometheus/Datadog) | Low-frequency event-based feature; GitHub Actions UI + step summary IS the dashboard | `observability-plan.md` sections 7-8 |
| P12 | Reusable workflow / composite action: NOT used for v1 | Two ~50-line jobs is readable; DRY discipline applied to `.mjs` code where mutation testing rewards it | `ci-cd-pipeline.md` section 8 |

## 3. DESIGN decisions honored

All DESIGN decisions from `design/wave-decisions.md` are honored verbatim. No re-litigation. Specifically:

| DESIGN # | Decision | DEVOPS realization |
|---|---|---|
| D1 | Modular ports-and-adapters in functional form | Reflected in `platform-architecture.md` section 5 (component-to-runner mapping) |
| D4 | Trigger: environment-gated publish job in `release.yml` | DEVOPS confirms primary path; `ci-cd-pipeline.md` implements |
| D5 | Version conflict policy: fail-hard for listed/CWS, auto-bump for AMO unlisted only | Test env matrix exercises both branches (`environments.yaml` notes); aggregate-summary recovery hint distinguishes via classification taxonomy (`observability-plan.md` section 4) |
| D9 | Step summary contract: Markdown table + Recovery section | `observability-plan.md` section 3 specifies exact Markdown layout |
| D10 | Pact-JS for CWS and AMO probe contract testing | DEVOPS confirms file-based fixtures (no broker); DELIVER wires Pact-JS into acceptance stage |

## 4. DISCUSS decisions honored

All Q1-Q5 locked decisions from `discuss/wave-decisions.md` are honored:

| Q | Decision | DEVOPS realization |
|---|---|---|
| Q1 | Both AMO channels (listed + unlisted, additive) | Build job retains existing unlisted-channel signing; new publish job handles listed via matrix leg |
| Q2 | CWS `publishTarget=default` + `upload-only` exposed as input | `mode` workflow input includes `publish` (default), `upload-only`, and `dry-run`; `ci-cd-pipeline.md` section 2 |
| Q3 | Environment-gated publish job (Option C) | Confirmed primary path; `marketplace-prod` env with required reviewer; `ci-cd-pipeline.md` section 4.2 |
| Q4 | Tag version verbatim, fail hard for listed/CWS; auto-bump for unlisted | `version_conflict` classification in observability taxonomy; existing find-next-amo-version.mjs untouched |
| Q5 | `targets` input + parallel jobs + end-of-run aggregation | Matrix on `target` with `continue-on-error`; `aggregate-summary` job; `ci-cd-pipeline.md` section 4 |

## 5. CLAUDE.md constraints honored

| Constraint | DEVOPS realization |
|---|---|
| Functional paradigm | All decision logic stays in `*.pure.mjs`; orchestrator is the only "shell" component; matrix legs invoke orchestrator (not adapters directly) |
| Per-feature mutation testing >= 80% | Stryker scoped to `*.pure.mjs` + classification helpers (per design open Q4 resolution); DELIVER lands the config |
| Memory rule (no auto-publish without explicit go-ahead) | Q3 Option C environment gate is the structural enforcement; reviewer click IS the explicit go-ahead |
| Existing scripts unchanged | `find-next-amo-version.mjs`, `sign-firefox-xpi.mjs`, `patch-firefox-manifest.mjs` invoked from build job only, exact same flags as today |

## 6. Deliverables produced this wave

| Deliverable | Path | Status |
|---|---|---|
| Platform architecture | `docs/feature/marketplace-publishing/devops/platform-architecture.md` | Complete |
| CI/CD pipeline extension plan | `docs/feature/marketplace-publishing/devops/ci-cd-pipeline.md` | Complete |
| Test environment matrix | `docs/feature/marketplace-publishing/devops/environments.yaml` | Complete |
| Secret inventory | `docs/feature/marketplace-publishing/devops/secret-inventory.md` | Complete |
| Environment setup instructions | `docs/feature/marketplace-publishing/devops/environment-setup-instructions.md` | Complete |
| Observability plan | `docs/feature/marketplace-publishing/devops/observability-plan.md` | Complete |
| Wave decisions | This document | Complete |

NOT produced (out of DEVOPS scope per orchestrator brief):
- `.github/workflows/release.yml` modifications — DELIVER does this per `ci-cd-pipeline.md`
- Any code in `scripts/` — DELIVER implements per `design/component-boundaries.md`
- GitHub Environment creation via `gh api` — maintainer does this manually per `environment-setup-instructions.md`
- Any secret values minted, real or placeholder — maintainer mints CWS_REFRESH_TOKEN locally via bootstrap script
- Pact-JS broker provisioning — DEVOPS chose file-based fixtures; no broker
- Stryker config file — DELIVER lands as part of test infrastructure

## 7. Maintainer action items (handoff to maintainer; in execution order)

After DELIVER lands the implementation:

1. Create the `marketplace-prod` GitHub environment with required reviewer (`environment-setup-instructions.md` Step 1).
2. Add 4 placeholder env secrets (`CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`, `CWS_EXTENSION_ID`) (Step 2).
3. (Optional) Restrict environment to `main` + tags (Step 3).
4. Create OAuth 2.0 Client in Google Cloud Console + obtain CWS_EXTENSION_ID (Step 4).
5. Run `node scripts/cws-bootstrap.mjs` locally; paste 4 values into env secrets (Step 5).
6. Run dry-run via `Run workflow` UI to verify wiring (Step 6).
7. Tag a release + dispatch `mode=publish` for first real publish (Step 7).

Total maintainer time: ~25 minutes one-time setup + ~5 minutes verification + ~30 seconds per release (target north-star KPI #1).

## 8. DISTILL handoff readiness

DISTILL (acceptance-designer) starts after DELIVER lands the implementation. The DEVOPS deliverables that DISTILL consumes:

| DEVOPS artifact | DISTILL use |
|---|---|
| `environments.yaml` | Bind each acceptance scenario to one of the 4 envs (clean, throttle, rate-limit, stale-token); each env's `simulate` block IS the test setup |
| `ci-cd-pipeline.md` section 6 (failure modes table) | Cross-check that every documented failure mode has an acceptance scenario |
| `observability-plan.md` section 3 (step summary contract) | Acceptance tests assert on Markdown summary content (e.g., recovery hint text matches expected) |
| `observability-plan.md` section 4 (classification taxonomy) | Acceptance tests assert on outcome `classification` field value |

DISTILL is **ready to start as soon as DELIVER's implementation lands**. No DEVOPS-side blockers.

## 9. DELIVER handoff readiness

DELIVER (software-crafter) is the next wave. DELIVER's checklist (also in `ci-cd-pipeline.md` section 10):

- [ ] Edit `.github/workflows/release.yml` per `ci-cd-pipeline.md` sections 4.1-4.4
- [ ] Implement `scripts/publish-orchestrator.effect.mjs`
- [ ] Implement `scripts/aggregate-and-summarize.effect.mjs`
- [ ] Implement adapters per `design/component-boundaries.md`
- [ ] Implement `scripts/cws-bootstrap.mjs`
- [ ] Add Stryker config (mutate `*.pure.mjs` + classification helpers)
- [ ] Add Pact-JS contract tests (file-based fixtures, no broker)
- [ ] Add architecture rule grep CI step (ADR-009)
- [ ] Add secret-leak grep CI step (per `secret-inventory.md` section 5)
- [ ] Run mutation testing locally to confirm >= 80% kill rate

DELIVER is **ready to start immediately**. No DEVOPS-side blockers.

## 10. Blockers and risks

**No blockers.** All DESIGN open questions resolved, all decisions made, all artifacts produced.

**Risks** (informational):

| Risk | Mitigation |
|---|---|
| Maintainer skips Step 3 (branch restrictions on environment) | Documented as "optional but recommended"; not a v1 blocker. Defense in depth only. |
| Refresh token expires after 6 months of unused (Google policy) | `secret-inventory.md` section 6 documents rotation runbook; observability plan classifies `auth_expired` and emits clear recovery hint. |
| AMO unilaterally tightens rate limits | `with-amo-throttle-active` env exercises classification; recovery hint says "tomorrow" which is conservative enough for any plausible new limit. |
| GitHub deprecates Environments on free tier (unlikely) | Fallback path (separate `publish-stores.yml`) is fully designed in ADR-007 and can be activated without re-architecting. |

## 11. Quality gates passed

Per nw-platform-architect Phase 4 (Quality Validation) and Phase 6 (Completion Validation):

- [x] Pipeline design includes all stages (commit, acceptance, production)
- [x] Quality gates defined per stage (`ci-cd-pipeline.md` section 5)
- [x] Local quality gates documented (DELIVER may add lefthook/pre-commit; DEVOPS does not require)
- [x] Rollback procedure designed first: re-dispatch with subset `targets` is the rollback for partial failures (`observability-plan.md` section 4 recovery hints)
- [x] DORA metrics improvement path documented (KPI #1 north star = lead-time-for-changes proxy at single-maintainer scale)
- [x] Pipeline security: secrets discipline, `::add-mask::`, grep guard, sanitizer (`secret-inventory.md` + `observability-plan.md`)
- [x] Branch strategy aligned: trunk-based on `main` with tags; ADR-007 trigger model fits
- [x] KPI instrumentation designed for all 6 outcome KPIs (`observability-plan.md` section 5)
- [x] Test environment matrix sized to failure-mode classification branches (`environments.yaml`)
- [x] Secret inventory complete with rotation policies (`secret-inventory.md`)
- [x] Maintainer setup steps documented end-to-end (`environment-setup-instructions.md`)

## 12. Recommended next wave

**DELIVER**, then **DISTILL** (or DISTILL in parallel with DELIVER if acceptance test design can proceed against the documented contracts ahead of implementation).

DEVOPS Phase 5 peer review (platform-architect-reviewer) is **deferred** per orchestrator brief (auto-mode, no peer review invoked). The orchestrator handles handoff.
