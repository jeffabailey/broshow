# DISTILL Wave Decisions: record-all-tabs (R1-cropped)

> Wave: DISTILL
> Predecessor waves: DISCUSS, SPIKE (D1→D1′ pivot), DESIGN
> Successor wave: DELIVER (software-crafter; functional paradigm per CLAUDE.md)
> Owner: acceptance-designer (Quinn)

## Reconciliation gate result

**Reconciliation passed — 0 contradictions.** DISCUSS (D1 tabCapture-follow) vs
DESIGN (D-DESIGN-1 window-cropped) is a documented SUPERSEDE via the SPIKE
back-propagation (D1→D1′, locked by the user 2026-06-06), not a contradiction.
D2 (originating window), D4 (honest indicator), "no new permission" are all
consistent across DISCUSS/DESIGN. DEVOPS wave-decisions absent → default
environment matrix (clean browser profile); warned, proceeded.

## DISTILL Decisions

| # | Decision | Rationale | Source |
|---|---|---|---|
| D1 | Walking skeleton = **Strategy C (extend the existing skeleton)** | The end-to-end recording skeleton exists; this feature threads the `'window-cropped'` mode through the record-page recorder path + adds a canvas-crop stage. No new skeleton. | feature-delta §"Walking Skeleton Strategy"; `distill/walking-skeleton.md` |
| D2 | **Repo-native frameworks, no Gherkin**: Vitest (pure) + @playwright/test (acceptance), Given/When/Then comment blocks | Matches the shipped convention; pytest-bdd/cucumber is not in this repo. | `playwright.config.ts`, existing specs |
| D3 | **Pure crop math is the PRIMARY mutation target** in `tests/unit/record-all-tabs-crop-geometry.test.ts` (≥80% kill) | DESIGN isolated `crop-geometry.ts` as the only non-trivial new logic, headlessly testable (QA-4). | DESIGN wave-decisions §"Pure seams"; CLAUDE.md per-feature mutation gate |
| D4 | **Mode/path discriminant** pinned in `tests/unit/record-all-tabs-mode-mapping.test.ts` (window-cropped start variant + targetForPath totality) | AC1.2 wire shape is provable without a browser; data-models §2/§5. | data-models.md §2, §5; ADR-012 |
| D5 | **Three acceptance spec files** under `tests/acceptance/record-all-tabs/`: walking-skeleton, milestone-1 (slice-01), milestone-2 (slice-02) | Mirrors slice structure + the parent feature's per-milestone layout. | slice-01, slice-02 |
| D6 | **`@human-gate` (`test.fixme`)** for crop-fidelity, getDisplayMedia(window), compositor, follow-across-switches, indicator accuracy, out-of-window hold | Chrome 148 blocks CLI/CDP unpacked-extension capture; these need real window pixels + a real pointer drag / real tab activation. Run as the slice-01/02 dogfood pass; visible in `--list`, never silently dropped. | DESIGN §16, §11; SPIKE testability constraint |
| D7 | **Headless-safe scenarios ENABLED**: mode control offered + single-tab regression. Capture-bound scenarios staged (`test.skip`/`test.fixme`) | The popup DOM + the unchanged single-tab path run in CI today; capture seams do not. | `walking-skeleton.spec.ts` #1, `milestone-1` #3 |
| D8 | **Additive types added to `src/types.ts` now** (`'window-cropped'` RecordingPath, `RecordingMode`, `CropRect`, PopupToSW variant) | Required so the `crop-geometry.ts` scaffold imports resolve (Mandate 7: RED not BROKEN). Type-only, additive, zero runtime behavior; matches the prior feature's "type widening is a real edit" precedent. | data-models.md §2-5; firefox D6 |
| D9 | **RED scaffold for `src/crop-geometry.ts`** with `__SCAFFOLD__ = true` + `throw new Error('Not yet implemented -- RED scaffold ...')` | NEW pure module mandated by DESIGN component-boundaries §2. TS scaffold template (Mandate 7); throws so the Red Gate classifies the unit tests RED, not BROKEN. | DESIGN component-boundaries §2; Mandate 7 |
| D10 | **No scaffold** for `crop-compositor.ts`, `record.ts`, `popup.ts/.html/.css`, `popup-logic.ts`, `recorder-host.ts` | `crop-compositor.ts` is an effect module exercised only via the human gate (no unit import → no scaffold needed for RED). The rest exist and are EXTENDED by DELIVER (mode routing, indicator, window-cropped overload, targetForPath totality), not rewritten. | DESIGN component-boundaries §6 (impact summary) |
| D11 | **Project Infrastructure Policy bootstrapped** at `docs/architecture/atdd-infrastructure-policy.md` (first DISTILL in project) | File was absent; wrote the three-table policy (TypeScript, Vitest+Playwright). Future DISTILL runs inherit. | `nw-distill` §Project Infrastructure Policy |
| D12 | **State-delta TS port bootstrapped** at `tests/common/state_delta.ts` | First DISTILL; polyglot bootstrap (apply-if-absent). NOTE: this feature's pure seams are exempt from Mandate 8 (pure functions, single return). Port is for future state-mutating features. | Polyglot Adapter Matrix; nw-tdd exemption |
| D13 | **No Tier B** state-machine PBT | Config/flow-shaped feature; the rich input space (crop rect) lives in the PURE crop-geometry function where PBT explores it. No ≥3-chained in-memory journey to model. | Mandate 10 "skip when" |
| D14 | **`@property` only at layer 1** (crop clamping, positive-WxH, even-output, modeToPath totality); acceptance E2E example-only | Mandate 9: PBT machinery only at layers 1-2; layer 4+ E2E is example-only. | Mandate 9 |
| D15 | **AC2.2 obsoleted, AC1.4 inherited** — flagged in `upstream-issues.md`, not silently dropped | SPIKE made continuity structural (no seam → AC2.2 moot); R1-cropped rides the existing getDisplayMedia probe (AC1.4 satisfied-by-inheritance). PO confirmation requested. | `upstream-issues.md` ISS-1, ISS-2 |

## RED classification (pre-DELIVER fail-for-the-right-reason gate)

Executed `npx vitest run` on the two new unit files. Both ENABLED tests fail for
the RIGHT reason:

| Scenario | Failure mode | Verdict |
|---|---|---|
| crop-geometry #13 "maps a centered preview drag…" | `Error: Not yet implemented -- RED scaffold (crop-geometry.toCropRect)` | ✅ MISSING_FUNCTIONALITY (RED) |
| mode-mapping #22 "start in window-cropped mode…" | `AssertionError: expected { …path:'window-cropped' } got { …path:'chromium-offscreen', streamId:'' }` | ✅ MISSING_FUNCTIONALITY (RED) |

Zero IMPORT_ERROR / FIXTURE_BROKEN / SETUP_FAILURE. All 403 pre-existing unit
tests stay GREEN (additive types → zero regression). `npm run build` (esbuild)
passes. `playwright test --list` collects all 12 acceptance scenarios cleanly.
**Gate PASS** — DELIVER may proceed.

## Open items handed forward to DELIVER

1. **Implement `crop-geometry.ts`** (replace the RED scaffold) — drag-rect →
   stream CropRect with per-axis scale, clamping, degenerate-drag normalization,
   integer pixels, even output dimensions. Unskip crop-geometry scenarios
   one-at-a-time. **Run the ≥80% mutation gate** (`npm run test:mutation` scoped
   to `crop-geometry.ts`) — this is the primary mutation target.
2. **Widen `messageForAction`** with the `('start','window-cropped')` overload →
   `{ type:'start-recording', path:'window-cropped' }` (no streamId). Export
   `modeToPath` from `popup-logic.ts`. Make `targetForPath` total over the widened
   union (window-cropped resolves to the running target via the capability probe,
   NOT a new platform branch). Unskip mode-mapping scenarios.
3. **Wire the popup mode control** ("Record all tabs (window, cropped)") and route
   it to `record.html`. Unskip `milestone-1` #4 (routing) and the
   `walking-skeleton` headless mode-control assertion already passes.
4. **Add the live crop preview + `crop-compositor.ts`** in the record page
   (getDisplayMedia(window) → `<video>` → drag-rect → CropRect → canvas
   drawImage/captureStream → `createRecordingSession`). Pass-through audio if
   shared (Decision B).
5. **Add the "Recording window region" indicator** to the record-page/popup DOM
   (US-3 honest indicator). Unskip `milestone-2` #8.
6. **Run the dogfood human gates** (slice-01: content-only crop; slice-02:
   follow + indicator + ≤1-gesture stop + out-of-window). Record PASS/FAIL,
   tester, date. Unfixme any scenario that becomes automatable.
7. **PRIVACY.md / listing copy** — touch if the cropped-window mode changes the
   described capture surface (DoD #6); no new permission (manifest diff empty).
8. **PO confirmation** of ISS-1 (AC2.2 obsoleted) and ISS-2 (AC1.4 inherited).

## Forwarded to platform-architect (DEVOPS)

- No contract tests (no external integrations — all capture/crop/mux in-browser).
- Extend **dependency-cruiser** `no-chrome-in-pure-logic` to cover the new pure
  `crop-geometry.ts` (and any `popup-logic.ts` mode/message additions).
- Confirm the headed-E2E persistent-context runner fits the CI budget, OR ratify
  the documented `@human-gate` dogfood lane as the boundary for capture-bound
  scenarios (Chrome 148 constraint).
- Decide whether a feature-specific `environments.yaml` (single env:
  `clean-profile`) is wanted.

## Handoff checklist

- [x] All 28 scenarios written (12 acceptance E2E + 16 pure unit seams)
- [x] Walking-skeleton scenario present + strategy declared (Strategy C)
- [x] Enabled scenarios are RED for the right reason (fail-for-right-reason gate PASS)
- [x] One-at-a-time staging (`it.skip` / `test.skip` / `test.fixme @human-gate`)
- [x] RED scaffold present with `__SCAFFOLD__` marker (Mandate 7); throws AssertionError-equivalent
- [x] Adapter coverage audit complete (Mandate 6); every new adapter has a real-I/O or human-gate scenario
- [x] Pure crop math is the declared ≥80% mutation target
- [x] Error/boundary/negative ratio 46% (> 40%)
- [x] Real-browser-vs-pure-seam split documented; @human-gate visible in `--list`
- [x] AC traceability table populated; AC2.2 obsoleted + AC1.4 inherited flagged
- [x] US traceability: every in-scope US covered
- [x] Self-review APPROVED (`distill/acceptance-review.md`)
- [x] Project Infrastructure Policy + state-delta TS port bootstrapped
- [x] Additive types only; build (esbuild) green; 403 prior unit tests green (zero regression)

DELIVER may proceed.
