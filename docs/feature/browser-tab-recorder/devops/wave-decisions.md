# DEVOPS Wave Decisions: BroShow

## Decisions made in this wave

| ID | Decision | Rationale | Source |
|----|----------|-----------|--------|
| D1 | CI/CD platform: GitHub Actions | User decision; repo is on GitHub | User input |
| D2 | Branching: trunk-based, lightweight protection | Solo developer, short-lived branches, fast feedback | User input + Continuous Delivery principles |
| D3 | Release: manual CWS upload via CI-built `.zip` artifact | Lowest setup cost; CWS API publish credentials deferred | User input |
| D4 | Future-proof release shape: hybrid extension point (GitHub Release on tag) is a single additive job, not a refactor | Avoid a future restructure when CWS API publish is added later | User direction |
| D5 | Mutation testing: per-feature, Stryker (TS), kill-rate >= 80% on changed files only | Matches project size and per-feature delivery cadence; avoids whole-suite mutation cost | User input + Apex principle 9 |
| D6 | Browser matrix: Chrome + Edge full pipeline, Firefox build+typecheck+unit only | Edge ≈ Chrome for these APIs; Firefox lacks `chrome.offscreen` | User input + technology-stack.md |
| D7 | Observability: local structured logs to `chrome.storage.local`, opt-in, manual export, ring-buffer 500 events, no new permissions | Hard zero-network KPI; permissions <= 4 KPI | outcome-kpis.md constraints |
| D8 | Logger size budget: < 4KB minified | Stays within the 500KB extension size budget with room for application code | KPI envelope |
| D9 | In-extension health surface: a `lastRecording` record shown in popup; ✓ / ⚠ / ✗ | Highest-signal monitoring possible without phoning home | Adapted from production-readiness skill |
| D10 | KPI gates as hard CI gates: network = 0, permissions <= 4, size < 500KB excl. muxer | These three are objectively measurable and most violation-prone | outcome-kpis.md, simplest enforcement |
| D11 | A/V drift, mp4 success rate, time-to-first-recording: logged at runtime, asserted in CI only where cheap | Some KPIs require real users / real environments to measure aggregately | outcome-kpis.md |
| D12 | Edge in CI fallback: if Playwright/Edge on Linux runners proves awkward, drop Edge to build+unit only and document | Pragmatic — Edge ≈ Chrome at the API level; runtime parity has marginal value | User direction |
| D13 | No Terraform / Kubernetes / cloud IaC artifacts | This is a browser extension; concepts do not apply | Project context |
| D14 | No `infrastructure-integration.md` | No existing infrastructure to integrate with | Orchestrator instruction |
| D15 | No `continuous-learning.md` | Zero-network KPI rules out remote feature flags / A-B testing | Orchestrator instruction |
| D16 | `recordingId` UUID generated in background and threaded through all events | Correlation glue for log reconstruction across popup/SW/offscreen | Three-pillars-of-observability adaptation |
| D17 | Logger redaction: drop URL/title/email/user* keys; truncate strings > 200 chars | Defense-in-depth privacy; KPI integrity | observability-design.md |
| D18 | `lefthook` (or husky) recommended for local hooks; not yet wired | Mirrors remote commit stage; lefthook is fast and polyglot. Solo dev, so recommendation only — no install required by this wave. | Apex principle 10 (shift-left quality gates) |

## Upstream changes (back-propagation to design / discuss waves)

### UC-1: Firefox is build-only (narrowing of `technology-stack.md` "Partial/TBD")

> Original (`docs/feature/browser-tab-recorder/design/technology-stack.md`, Browser Compatibility table):
> "Firefox | Partial/TBD | `browser.tabCapture` exists but `offscreen` API does not. Would need alternative architecture (background page). Stretch goal."

**This wave narrows that to**: Firefox in CI is **build + typecheck + unit tests only**. No Playwright / runtime validation. Full Firefox runtime support is a deferred architectural change (background page or browser-action page hosting `MediaRecorder` instead of an offscreen document). The CI Firefox leg's purpose is **early API-drift detection**, not runtime validation.

**Severity**: low. This is a clarification of an already-acknowledged stretch goal, not a contradiction. No architect action required beyond awareness.

### UC-2: Manifest currently declares 6 permissions; KPI cap is 3 — RESOLVED AT DESIGN; OPEN AT IMPLEMENTATION

> KPI (`docs/feature/browser-tab-recorder/discuss/outcome-kpis.md`, Trust Outcomes — original target before correction):
> "Permissions requested | <= 3"

> Current `src/manifest.json` declares: `["activeTab", "tabs", "tabCapture", "offscreen", "downloads", "storage"]` — **6 permissions**.

**Resolution at design level** (initial DEVOPS wave + 2026-04-27 correction): `docs/feature/browser-tab-recorder/design/technology-stack.md` was updated to make the authoritative permission list `["tabCapture", "offscreen", "storage", "downloads"]` (4 permissions), with rationale for each kept permission and explicit rejection notes for `activeTab` and `tabs`. The KPI cap was bumped from `<= 3` to `<= 4` because the design's original claim that `chrome.downloads.download()` works without the `downloads` permission for blob URLs was discovered to be incorrect during DELIVER (see `upstream-changes.md` UC-1 history). The design is now the single source of truth.

**Open at implementation level**: `src/manifest.json` still declares 6 permissions and **DOES NOT** match the authoritative design. The permission-count CI gate added in this wave **will fail on every run** until DELIVER reduces the manifest to the 4-permission list.

> ⚠️ **CI-BLOCKING NOTE FOR DEVELOPERS** ⚠️
> If you see the permission-count gate fail, this is **intentional**, not a regression. The gate enforces the authoritative 4-permission design against the current 6-permission implementation. To unblock CI, reduce `src/manifest.json` to `["tabCapture", "offscreen", "storage", "downloads"]` per `technology-stack.md` and `upstream-changes.md` UC-1. This is a DELIVER-wave task.

**Severity**: HIGH at implementation level. Resolved at design level.

**This is escalated to a dedicated upstream-changes file** (`docs/feature/browser-tab-recorder/devops/upstream-changes.md`) because it requires software-crafter action in DELIVER.

### UC-3: Storage permission is now load-bearing for observability — RESOLVED

> Design (`docs/feature/browser-tab-recorder/design/technology-stack.md`) previously listed only `tabCapture` and `offscreen` as required permissions.

**Resolution**: design was updated during this wave to include `storage` as the 3rd required permission with rationale covering: (a) MV3 service-worker eviction state rehydration, (b) the `lastRecording` health surface (`monitoring-alerting.md`), and (c) the opt-in local logger ring buffer (`observability-design.md`). No further architect action required.

## Open questions (none blocking)

- Whether to wire `lefthook` immediately or treat it as a follow-up. Recommendation: follow-up; CI is the authoritative gate.
- Whether to add `ffprobe` as a CI dev-dependency for mp4 well-formedness validation, or defer. Recommendation: defer; rely on `mp4-muxer`'s own validation for now.
- Whether to enable per-PR mutation testing automatically vs. label-gated. Recommendation: label-gated, per user decision (per-feature cadence).

## DELIVER prerequisites (peer review surfaced; deferred to DELIVER wave)

The DEVOPS peer review surfaced 18 issues. The 3 blocking ones are addressed in this wave (D19, D20, D21 below). The remaining items are real but belong to DELIVER — implementation, test code, and operational tooling that this wave intentionally does not produce. Tracked here so they are not lost.

| ID | Item | Severity | Source (review issue) |
|----|------|----------|------------------------|
| DP-1 | Reduce `src/manifest.json` to `["tabCapture", "offscreen", "storage"]` (unblocks the permission-count CI gate) | HIGH | UC-2 / Issue 15 |
| DP-2 | Implement `src/logger.ts` (ring-buffer 500 events, redaction rules, opt-in toggle, manual export) | HIGH | Issue 6 |
| DP-3 | Add `tests/unit/logger.test.ts` covering ring-buffer eviction, redaction (URL/email/title/`user*`/length-cap), opt-in disabled = no-op, storage-quota bounds | HIGH | Issues 6, 8 |
| DP-4 | Add `tests/acceptance/upgrade.spec.ts` (vN-1 → vN; verify `chrome.storage.local` migrates or is discarded gracefully) | HIGH | Issue 17 |
| DP-5 | Add `tests/acceptance/stale-state-recovery.spec.ts` (cold start with stale `RecordingState` after SW eviction; verify reset to idle) | HIGH | Issue 17 |
| DP-6 | Add `tests/acceptance/fixtures/no-network.ts` (Playwright `page.on('request')` listener asserting 0 requests outside `chrome-extension://` origin) | HIGH | Issue 11 |
| DP-7 | Decide A/V drift logging: log `avDriftMs` on `mp4.ok` events from mp4-muxer output, OR explicitly mark as manual-pre-release-QA-only and update `kpi-instrumentation.md` | MEDIUM | Issue 7 |
| DP-8 | Add ESLint with `eslint-plugin-security` to commit CI stage | MEDIUM | Issue 9 |
| DP-9 | Add `npm audit --audit-level=moderate` to commit CI stage; enable Dependabot | MEDIUM | Issue 10 |
| DP-10 | Add `timeout-minutes: 30` to the `build-test` job in `.github/workflows/ci.yml` | MEDIUM | Issue 2 |
| DP-11 | Add a release validation checklist to `branching-strategy.md` (5-step smoke after CWS upload: email received, .zip download, fresh-profile install, recording start/stop, log review) | MEDIUM | Issue 5 |
| DP-12 | Rename Firefox matrix leg in YAML output to make build-only scope visible (`build-test (firefox-build-only)`) or add an explicit logged-skip step | MEDIUM | Issue 3 |
| DP-13 | Update `technology-stack.md` Browser Compatibility row for Firefox to "Build-only (CI, not runtime)" with cross-reference to `environments.yaml` | MEDIUM | Issue 16 |
| DP-14 | Reference or summarise `tests/acceptance/walking-skeleton.spec.ts` test design once it exists in DELIVER | LOW | Issue 18 |
| DP-15 | Wire `lefthook` for local pre-commit / pre-push hooks (or document that CI is the only gate) | LOW | (D18) |

## Reviewer-driven decisions added in this wave

| ID | Decision | Rationale | Source |
|----|----------|-----------|--------|
| D19 | Hybrid Release-on-tag job: kept as a documented additive extension point (NOT wired in this wave) — but CI artifact retention extended from 30 → 90 days as a cheap rollback-window mitigation | Honors user's choice of "Q4 = 1 with structure ready for 4". Reviewer flagged the 30-day post-publish rollback gap (Issue 4); 90 days widens the window without violating the user's release-strategy decision. The Release-on-tag job remains the long-term fix and is ready to drop in unchanged. | Reviewer Issue 4 + user direction |
| D20 | UC-2 (manifest permission contradiction) is communicated as INTENTIONAL CI-blocking via a callout in this document and in `upstream-changes.md` | Prevents developers from misreading the failing permission-count gate as a CI regression. The gate is correct; the implementation is what must change. | Reviewer Issue 15 |
| D21 | Permission-count and size-budget CI gates remain shell + `jq` / `du` (NOT refactored to a TypeScript script in this wave) | Each gate is ~10 lines and well-understood; refactoring to TS adds build/test glue out of proportion to the maintenance benefit at current scale. If the gates grow or the size-budget heuristic gets more complex, revisit in DELIVER (tracked as DP-follow-up below). | Reviewer Issue 1 + scope discipline |

## Constraint-impact decision rules applied

- **Zero-network KPI** (affects 100% of delivery, HIGH priority) → addressed as primary focus across observability and monitoring designs.
- **Permission cap** (affects 100%, HIGH priority, currently violated) → addressed as primary focus via CI gate + upstream-changes escalation.
- **Size budget** (affects 100%, HIGH priority) → addressed via CI gate.
- **Firefox `chrome.offscreen` gap** (affects ~33% of browser matrix, MEDIUM) → deferred to architectural future work; build-only CI leg added for drift detection.
