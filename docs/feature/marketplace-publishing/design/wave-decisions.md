# Wave Decisions: Marketplace Publishing (DESIGN)

Feature ID: `marketplace-publishing`
Wave: DESIGN
Date: 2026-04-30
Mode: Auto

## DISCUSS decisions honored

All Q1-Q5 locked decisions from `docs/feature/marketplace-publishing/discuss/wave-decisions.md` are honored:

| # | Locked decision | DESIGN realization |
|---|---|---|
| Q1 | Both AMO channels (listed + unlisted) | New `amo-listed-adapter.effect.mjs` for listed; existing `sign-firefox-xpi.mjs` unchanged for unlisted; both run in same release cadence (build job for unlisted, publish job for listed). |
| Q2 | CWS `publishTarget=default` with `upload-only` workflow input | `cws_publish` workflow input on `release.yml` accepts `default`/`trustedTesters`/`upload-only`; `PublishMode` algebraic type encodes the `upload-only` branch; CWS adapter dispatches accordingly. |
| Q3 | Environment-gated publish job in `release.yml` | New `publish` job with `needs: build`, `if: workflow_dispatch`, `environment: marketplace-prod`. Fallback path documented (separate `publish-stores.yml`) for free-tier private repos lacking Environments — DEVOPS picks at platform setup. (ADR-007.) |
| Q4 | Tag version verbatim, fail hard for listed/CWS; auto-bump kept for unlisted only | `decisions.pure.mjs::classifyVersionState` is the central pure decision; orchestrator never invokes `find-next-amo-version.mjs`; existing unlisted flow continues. (ADR-008.) |
| Q5 | `targets` input + parallel jobs + end-of-run aggregation | Orchestrator runs adapters in parallel via `Promise.all`; aggregates outcomes via pure `aggregateOutcomes`; emits step summary with copy-paste recovery hint. |

Additional locked constraints honored:
- Functional paradigm — all decision logic in `.pure.mjs`; effects isolated in `.effect.mjs` (ADR-004, ADR-009).
- Per-feature mutation testing >= 80% — pure decision module is the highest-leverage target; Stryker named in `technology-stack.md`.
- Memory rule preservation — environment gate is the structural enforcement (ADR-007).
- No source-manifest mutation in CI — staged copies only; CI guard via `git diff --exit-code` after publish job.
- Reuse `patchManifestForFirefox`, `find-next-amo-version.mjs` (unlisted only), `sign-firefox-xpi.mjs`, `release.yml` (extend, not replace).

## DESIGN decisions made

| # | Decision | Rationale | ADR |
|---|---|---|---|
| D1 | Architectural style: modular ports-and-adapters in functional form | FP paradigm; mutation testing target; testability driver | ADR-004 |
| D2 | CWS adapter uses direct `fetch`, no library | Consistent with existing `find-next-amo-version.mjs`; zero new deps; explicit error classification | ADR-005 |
| D3 | AMO listed uses `web-ext sign --channel listed` | Already a project dep; identical auth path as unlisted; Mozilla-maintained | ADR-006 |
| D4 | Trigger: environment-gated publish job in `release.yml` (with documented fallback) | Memory-rule compliance; build+publish provenance in one workflow run | ADR-007 |
| D5 | Version conflict policy: fail-hard for listed/CWS, auto-bump kept for unlisted only | Public listing version must equal source-of-truth tag | ADR-008 |
| D6 | Pure/effect file naming convention with grep CI enforcement | Architecture rules need enforcement; lightweight | ADR-009 |
| D7 | OAuth bootstrap: native `http` server + `fetch`, no library | Zero new deps; consistent with project pattern | (covered in ADR-005) |
| D8 | JWT signing: native `crypto.createHmac`, no library | Reuse existing pattern from `find-next-amo-version.mjs` | (covered in tech stack) |
| D9 | Step summary contract: Markdown table + Recovery section | AC-3-5, AC-3-10, AC-4-4 traceability | (covered in architecture-design.md) |
| D10 | Pact-JS for CWS and AMO probe contract testing | Highest-risk boundary (external APIs); detected breaking changes pre-prod | (covered in architecture-design.md section 10) |

## Top-level components

### New modules

1. `scripts/publish-orchestrator.effect.mjs` — composition root
2. `scripts/cws-adapter.effect.mjs` — CWS API
3. `scripts/amo-listed-adapter.effect.mjs` — AMO listed channel
4. `scripts/decisions.pure.mjs` — all pure decision logic
5. `scripts/cws-bootstrap.mjs` — one-time local OAuth bootstrap CLI
6. `scripts/fs-adapter.effect.mjs` — filesystem effect seam
7. `scripts/amo-jwt.pure.mjs` — JWT generation extracted (small)

### Existing modules (reused, unchanged)

8. `scripts/patch-firefox-manifest.mjs` — pure transform
9. `scripts/strip-chrome-only-permissions.mjs` — pure transform
10. `scripts/sign-firefox-xpi.mjs` — local unlisted sign
11. `scripts/find-next-amo-version.mjs` — unlisted auto-bump probe (NOT called by new orchestrator)

### Modified

12. `.github/workflows/release.yml` — extended with workflow inputs and a new `publish` job (build job upload-artifacts; publish job downloads + invokes orchestrator)

## Driven adapter list with port signatures

| Port (signature) | Adapter |
|---|---|
| `(creds: CwsCreds) => Promise<Result<AccessToken, AuthError>>` | `cws-adapter.effect.mjs::exchangeCwsRefreshToken` |
| `(creds: CwsCreds, itemId: string) => Promise<Result<CwsItemState, CwsError>>` | `cws-adapter.effect.mjs::probeCwsItemState` |
| `(creds: CwsCreds, itemId: string, zipPath: string) => Promise<Result<UploadResult, CwsError>>` | `cws-adapter.effect.mjs::uploadCwsItem` |
| `(creds: CwsCreds, itemId: string, target: CwsPublishTarget) => Promise<Result<PublishResult, CwsError>>` | `cws-adapter.effect.mjs::publishCwsItem` |
| `(jwt: AmoJwtCreds, addonGuid: string) => Promise<Result<Set<string>, AmoError>>` | `amo-listed-adapter.effect.mjs::probeAmoListedVersions` |
| `(jwt: AmoJwtCreds, xpiPath: string, version: string) => Promise<Result<AmoSubmitResult, AmoError>>` | `amo-listed-adapter.effect.mjs::submitAmoListed` |
| `(manifestPath: string) => Promise<string>` | `fs-adapter.effect.mjs::readManifestVersion` |
| `(markdown: string) => Promise<void>` | `fs-adapter.effect.mjs::writeStepSummary` |

## ADRs created

| ADR | Title |
|---|---|
| ADR-004 | Marketplace Publish — Modular Ports-and-Adapters in Functional Style |
| ADR-005 | CWS Adapter — Direct `fetch` vs. Library |
| ADR-006 | AMO Listed Submission via `web-ext sign --channel listed` |
| ADR-007 | Publish Trigger — Environment-Gated Job in `release.yml` (with Documented Fallback) |
| ADR-008 | Version Conflict Policy — Fail-Hard for Listed/CWS, Auto-Bump for AMO Unlisted Only |
| ADR-009 | Pure vs. Effect File-Naming Convention as Architecture-Rule Enforcement |

## Paradigm constraints

- All new modules use functional patterns: pure transforms in `*.pure.mjs`, effectful boundary modules in `*.effect.mjs`.
- Algebraic types for `PublishTarget`, `PublishMode`, `OutcomeStatus`, `VersionState` etc. (string-literal unions encoded in JSDoc).
- `Result<T, E>` shape for adapter returns; throws reserved for programmer errors only.
- No classes; no inheritance; no this-binding.
- Composition pipelines for the publish flow: `parseInputs >> planRun >> Promise.all(adapters) >> aggregateOutcomes >> renderSummary >> writeSummary`.

## Upstream changes

| File | Change | Reason |
|---|---|---|
| `.github/workflows/release.yml` | Extend with workflow inputs (`tag`, `targets`, `cws_publish`, `dry_run`); split into `build` job (existing logic + upload-artifacts) and new `publish` job (download-artifacts + orchestrator); environment gate on publish job | Implements the trigger model (ADR-007) |
| `package.json` | Add `@stryker-mutator/core`, `@stryker-mutator/vitest-runner`, `@pact-foundation/pact` to `devDependencies` | Mutation testing gate; consumer-driven contract tests |
| `docs/release.md` (new or extended) | Document recovery procedure, environment-gate setup, secrets inventory, dry-run usage | Maintainer-facing operational docs |
| GitHub repo Settings -> Environments | Create `marketplace-prod` environment with required reviewer = repo owner | One-time DEVOPS task (primary path only) |
| GitHub repo Settings -> Secrets | Add `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`, `CWS_EXTENSION_ID` | After maintainer runs `cws-bootstrap.mjs` locally |

No changes to: `src/manifest.json`, `package.json` `version`, source application code. The feature is CI/build infrastructure only.

## Open architectural questions for maintainer

Low priority; resolvable during DEVOPS:

1. **GitHub Environments availability**: confirm during DEVOPS whether the repo's plan supports environment-gated jobs with required reviewers. Both primary and fallback paths are designed.
2. **Pact broker hosting**: file-based contract sharing (committed JSON fixtures) vs hosted Pact broker. File-based is simpler and recommended for this feature; revisit if Pact volume grows.
3. **AMO listing first-time metadata** (description, screenshots, categories): out of scope per `wave-decisions.md` (DISCUSS); maintainer creates the listing manually before the first listed publish. DEVOPS documents this prerequisite in `docs/release.md`.
4. **Stryker scope**: `decisions.pure.mjs` and `amo-jwt.pure.mjs` are the primary mutation targets. Adapters' classification helpers can be partial-mutated (skip pure HTTP send lines). DEVOPS finalizes Stryker config.

## Handoff status

| Artifact | Path | Status |
|---|---|---|
| Architecture design | `docs/feature/marketplace-publishing/design/architecture-design.md` | Complete |
| Technology stack | `docs/feature/marketplace-publishing/design/technology-stack.md` | Complete |
| Component boundaries | `docs/feature/marketplace-publishing/design/component-boundaries.md` | Complete |
| Data models | `docs/feature/marketplace-publishing/design/data-models.md` | Complete |
| ADRs | `docs/adrs/ADR-004` through `ADR-009` | Complete |
| Wave decisions | This document | Complete |
| Peer review | Skipped per auto-mode brief (orchestrator handles handoff) | -- |

## Recommended next wave

**DEVOPS first, then DISTILL.**

This is an infrastructure feature whose primary surface IS the CI/CD pipeline. Platform-architect (DEVOPS) needs to:
- Decide between primary and fallback trigger path (probe GitHub Environments availability).
- Wire the `marketplace-prod` environment with required reviewer (one-time setup).
- Configure the secret manifest in repo Settings.
- Set up Stryker mutation testing config.
- Wire Pact-JS contract tests into the CI acceptance stage for CWS and AMO probe endpoints.

After DEVOPS, DISTILL (acceptance-designer) translates the 38 ACs into driving-port-anchored acceptance tests. The driving-port mapping in `data-models.md` section 4 is the input DISTILL needs.

## Quality gates summary

All design quality gates passed (see `architecture-design.md` section 13). Specifically:
- Requirements traced to components: yes.
- Component boundaries with clear responsibilities: yes.
- Technology choices in ADRs with alternatives: yes (ADR-005, ADR-006).
- Quality attributes addressed: yes (architecture-design.md section 7).
- Dependency-inversion compliance: yes (component-boundaries.md section 3).
- C4 diagrams: L1 + L2 + L3 in Mermaid.
- Integration patterns specified: REST/fetch + subprocess; section 10.
- OSS preference validated: all MIT/MPL/Apache.
- AC behavioral, not implementation-coupled: yes (data-models.md section 4 maps each AC to a driving port without prescribing implementation).
- External integrations annotated for contract tests: yes (architecture-design.md section 10).
- Architecture rule enforcement tooling recommended: yes (ADR-009 grep CI step).
