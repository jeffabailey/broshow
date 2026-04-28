# Acceptance Review: browser-tab-recorder

> **Updated by RETROFIT DISTILL** to reconcile with the DEVOPS wave outputs (`environments.yaml`, `wave-decisions.md` D1..D21, `kpi-instrumentation.md`). Reconciliation log lives in `distill/wave-decisions.md` §2.

## Coverage Matrix

| User Story / Install State | Acceptance Test | Milestone |
|----------------------------|-----------------|-----------|
| US-01: Install extension | `walking-skeleton.spec.ts` — popup shows Start button | 1. Walking Skeleton |
| US-02: Start tab recording | `walking-skeleton.spec.ts` — click Start, Stop appears | 1. Walking Skeleton |
| US-03: Stop recording | `walking-skeleton.spec.ts` — click Stop, file downloaded | 1. Walking Skeleton |
| US-04: Download as WebM | `walking-skeleton.spec.ts` — full pipeline, file > 1KB | 1. Walking Skeleton |
| US-05: Convert to mp4 | `milestone-2-mp4-output.spec.ts` — file has ftyp signature | 2. Mp4 Output |
| US-06: WebM fallback | `milestone-2-mp4-output.spec.ts` — fallback notice visible | 2. Mp4 Output |
| US-07: Recording indicator | `milestone-3-polish.spec.ts` — badge REC / cleared | 3. Polish |
| US-08: Tab audio capture | `milestone-3-polish.spec.ts` — audio test page recording | 3. Polish |
| US-09: Sensible filename | `milestone-3-polish.spec.ts` — filename regex match | 3. Polish |
| US-10: Firefox compatibility | **Deferred to future feature; out of DISTILL scope.** Requires alternative architecture (background page hosting MediaRecorder). CI runs build+typecheck+unit only on Firefox; no Playwright runtime tests. (Reconciliation R2.) | n/a — not in this DISTILL |
| install_states.clean_install | `walking-skeleton.spec.ts` (clean profile) and `stale-state-recovery.spec.ts` ("clean baseline" scenario) | 1 + 5 |
| install_states.upgrade_from_prior_version | `upgrade.spec.ts` (3 scenarios: valid prior, forward-compat, incompat migration) | 4. Upgrade Robustness (NEW — Reconciliation R5) |
| install_states.with_prior_recording_state | `stale-state-recovery.spec.ts` (3 scenarios: stale recording, stale processing, clean baseline) | 5. Stale State Recovery (NEW — Reconciliation R6) |

## Story Coverage

- **9/9 in-scope stories covered** (US-01 through US-09).
- US-10 (Firefox) is explicitly **out of DISTILL scope** and deferred to a future feature; not counted as an uncovered story.
- **3/3 install states covered** (clean_install, upgrade_from_prior_version, with_prior_recording_state) per `devops/environments.yaml`.

## Acceptance Criteria Coverage

| AC | Test | Covered |
|----|------|---------|
| AC-01: Complete recording flow | `walking-skeleton.spec.ts` — full pipeline | YES |
| AC-02: Permission denial recovery | Not covered (Playwright limitation: cannot reliably simulate permission denial when `--auto-select-tab-capture-source-by-title` is in effect). Verified manually pre-release; covered by unit-level tests on `background-logic.ts` error paths. | PARTIAL |
| AC-03: Recording indicator | `milestone-3-polish.spec.ts` — badge REC / cleared | YES |
| AC-04: Tab closed during recording | Not covered automatically (closing a recorded tab during a Playwright test is unstable). Verified manually pre-release. | NO (manual) |
| AC-05: Mp4 fallback | `milestone-2-mp4-output.spec.ts` | YES |
| AC-06: No network requests | **CI HARD GATE** via `tests/acceptance/fixtures/no-network.ts` and `page.on('request')` assertion in every acceptance test. Failure blocks merge. (Reconciliation R3 — was previously "Manual / code review", now mechanically enforced per `devops/kpi-instrumentation.md`.) | YES (HARD GATE) |
| AC-07: Brave compatibility | Same tests, different browser launch (Chromium-equivalent — same Playwright suite passes). Edge covered same way (DEVOPS D6). | YES (config) |
| AC-08: Filename format | `milestone-3-polish.spec.ts` — filename regex match | YES |
| **install_states.upgrade_from_prior_version** (NEW) | `upgrade.spec.ts` — 3 scenarios | YES (NEW) |
| **install_states.with_prior_recording_state** (NEW) | `stale-state-recovery.spec.ts` — 3 scenarios | YES (NEW) |
| **coexistence_matrix.privacy_extension** (NEW) | All acceptance specs via `no-network.ts` fixture (BroShow makes zero outbound network → privacy extensions have nothing to block) | YES (NEW — Reconciliation R8) |

### AC Coverage Summary

| Status | Count |
|--------|-------|
| Covered (CI-asserted) | 8 of 11 (AC-01, AC-03, AC-05, AC-06 hard gate, AC-07, AC-08, upgrade install state, stale state, coexistence) |
| Partial (manual + unit) | 1 (AC-02) |
| Manual only | 1 (AC-04) |
| **Total ACs in scope** | **11** |
| **Coverage** | **~82% CI-asserted, 100% addressed** |

## Notes

- **AC-02 (permission denial)**: Playwright's Chromium automation, when configured with `--auto-select-tab-capture-source-by-title`, auto-grants the dialog. Simulating denial without the flag breaks every other recording test. Mitigated by: (a) unit tests on `background-logic.ts` error-path branches; (b) manual smoke per release.
- **AC-04 (tab closed during recording)**: Closing a tab mid-recording in Playwright is unstable across runs (timing-dependent). Mitigated by manual smoke pre-release. Could be revisited if the recording-pipeline RCA prompts a refactor.
- **AC-06 (no network)** — promoted from manual to CI hard gate this retrofit. The `no-network.ts` fixture makes any network leak a build failure. This was the largest gap in the previous DISTILL.

## Implementation Order (Outside-In TDD)

1. Remove `test.skip` from `walking-skeleton.spec.ts` tests one at a time; implement code to pass each.
2. When all skeleton tests pass, move to `milestone-2-mp4-output.spec.ts`.
3. Then `milestone-3-polish.spec.ts`.
4. Then `upgrade.spec.ts` (Milestone 4 — Upgrade Robustness).
5. Then `stale-state-recovery.spec.ts` (Milestone 5 — Stale State Recovery).

> **Note**: Milestones 4 and 5 may already pass against the current production code, since `src/background.ts` initializes `let state = createInitialState()` on every cold start (the stale state in storage is read for blob handoff, not for state restoration). DELIVER will confirm this empirically and add a one-time migration helper only if `upgrade.spec.ts` reveals a real gap. See `distill/wave-decisions.md` §4 for the scaffold-vs-existing decision.

## Cross-references to DEVOPS artifacts

| AC / Install State | DEVOPS source | DELIVER prerequisite |
|--------------------|---------------|----------------------|
| AC-06 (no network) | `kpi-instrumentation.md` Trust Outcomes; `wave-decisions.md` D10 | DP-6 (`no-network.ts` fixture) |
| Permissions <= 4 (KPI; cap raised from 3 to 4 on 2026-04-27 per `devops/upstream-changes.md` UC-1) | `technology-stack.md` (now authoritative); `wave-decisions.md` UC-2/D20 | DP-1 (reduce manifest) |
| install_states.upgrade_from_prior_version | `environments.yaml` | DP-4 (`upgrade.spec.ts`) |
| install_states.with_prior_recording_state | `environments.yaml` | DP-5 (`stale-state-recovery.spec.ts`) |
