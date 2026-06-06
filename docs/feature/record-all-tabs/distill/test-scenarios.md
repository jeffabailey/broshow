# Test Scenarios: record-all-tabs (R1-cropped)

> Wave: DISTILL
> Owner: acceptance-designer (Quinn)
> Inputs: `../feature-delta.md` (DISCUSS + SPIKE back-propagation D1→D1′),
>   `../design/{architecture-design,component-boundaries,data-models,technology-stack,wave-decisions}.md`,
>   `../slices/slice-0{1,2}-*.md`, ADR-010..013, `src/{types,popup-logic,recorder-host,record,background-logic}.ts`.

Narrative companion to the executable test files. The repo convention is
**Vitest** (pure/unit) + **@playwright/test** (acceptance E2E, persistent-context
extension loading) — there are NO Gherkin `.feature` files. Each scenario uses
Given/When/Then COMMENTS inside a business-language `test.describe`/`it` body
(matching the existing `walking-skeleton.spec.ts` / `firefox-recording-support`
convention).

## Scope (re-aimed to R1-cropped)

Per the SPIKE back-propagation (feature-delta §"Wave: SPIKE / Changed
Assumptions"), the original tabCapture-follow framing of US-2/US-3 is OBSOLETE.
"Record all tabs" = a NEW top-level mode `'window-cropped'`:
`getDisplayMedia({video:{displaySurface:'window'}})` acquired in the record page,
canvas-cropped to a user-drawn region, fed upstream of the unchanged
`createRecordingSession`. The window stream inherently follows the active tab
(continuity is structural — NO seam, AC2.2 obsoleted). These scenarios test the
reframed job, not the obsolete one.

## Scenario inventory

| # | File | Tag(s) | Driving port | Pins (AC / US) | Layer |
|---|------|--------|--------------|----------------|-------|
| 1 | `tests/acceptance/record-all-tabs/walking-skeleton.spec.ts` | `@walking_skeleton @real-io @chromium` | popup UI (loaded ext) | AC1.1 | E2E (headless-safe) |
| 2 | `walking-skeleton.spec.ts` | `@walking_skeleton @real-io @chromium @human-gate` | popup UI + record page | AC-crop, AC2.1, AC2.3 | E2E (human gate) |
| 3 | `milestone-1-window-cropped-record.spec.ts` | `@real-io @chromium @regression` | popup UI (loaded ext) | AC1.1 (single-tab regression) | E2E (headless-safe) |
| 4 | `milestone-1-window-cropped-record.spec.ts` | `@real-io @chromium` | popup UI → record page routing | AC1.2 | E2E (pending DELIVER routing) |
| 5 | `milestone-1-window-cropped-record.spec.ts` | `@real-io @chromium @human-gate` | record page (getDisplayMedia + crop) | AC-crop (slice-01) | E2E (human gate) |
| 6 | `milestone-1-window-cropped-record.spec.ts` | `@real-io @chromium @human-gate` | record page → chrome.downloads | AC2.3 | E2E (human gate) |
| 7 | `milestone-1-window-cropped-record.spec.ts` | `@real-io @chromium @human-gate @error` | record page (picker cancel) | AC2.4 | E2E (human gate) |
| 8 | `milestone-2-follow-and-indicator.spec.ts` | `@real-io @chromium` | popup / record page indicator DOM | AC1.3 / AC3.1 (indicator presence) | E2E (pending DELIVER indicator) |
| 9 | `milestone-2-follow-and-indicator.spec.ts` | `@real-io @chromium @human-gate` | record page (follow across switches) | AC2.1 generalized | E2E (human gate) |
| 10 | `milestone-2-follow-and-indicator.spec.ts` | `@real-io @chromium @human-gate` | indicator DOM across switches | AC3.1 (accuracy) | E2E (human gate) |
| 11 | `milestone-2-follow-and-indicator.spec.ts` | `@real-io @chromium @human-gate` | record page stop | AC3.3 | E2E (human gate) |
| 12 | `milestone-2-follow-and-indicator.spec.ts` | `@real-io @chromium @human-gate @error` | record page (other window) | AC3.2 / D2 | E2E (human gate) |
| 13 | `tests/unit/record-all-tabs-crop-geometry.test.ts` | (ENABLED, RED) | `toCropRect` | AC-crop math, data-models §4 | unit (pure) |
| 14 | `record-all-tabs-crop-geometry.test.ts` | `@property` | `toCropRect` clamping | data-models §4 invariants | unit (pure) |
| 15 | `record-all-tabs-crop-geometry.test.ts` | `@property` | `toCropRect` positive WxH | data-models §4 (degenerate drag) | unit (pure) |
| 16 | `record-all-tabs-crop-geometry.test.ts` | — | `toCropRect` negative origin | data-models §4 (clamp origin) | unit (pure) |
| 17 | `record-all-tabs-crop-geometry.test.ts` | — | `toCropRect` full-preview | identity crop at scale | unit (pure) |
| 18 | `record-all-tabs-crop-geometry.test.ts` | — | `toCropRect` non-uniform scale | per-axis scale (letterbox) | unit (pure) |
| 19 | `record-all-tabs-crop-geometry.test.ts` | — | `toCropRect` integrality | integer pixel rects | unit (pure) |
| 20 | `record-all-tabs-crop-geometry.test.ts` | — | `outputDimensions` 1:1 | data-models §4 output sizing | unit (pure) |
| 21 | `record-all-tabs-crop-geometry.test.ts` | `@property` | `outputDimensions` even | encoder even-WxH requirement | unit (pure) |
| 22 | `tests/unit/record-all-tabs-mode-mapping.test.ts` | (ENABLED, RED) | `messageForAction('start','window-cropped')` | AC1.2, data-models §5 | unit (pure) |
| 23 | `record-all-tabs-mode-mapping.test.ts` | `@regression` | `messageForAction` chromium variant | AC1.1 (unchanged) | unit (pure) |
| 24 | `record-all-tabs-mode-mapping.test.ts` | `@regression` | `messageForAction` firefox variant | AC1.1 (unchanged) | unit (pure) |
| 25 | `record-all-tabs-mode-mapping.test.ts` | `@regression` | `messageForAction('stop')` | unchanged across modes | unit (pure) |
| 26 | `record-all-tabs-mode-mapping.test.ts` | `@regression` | `targetForPath` existing paths | data-models §2 (regression) | unit (pure) |
| 27 | `record-all-tabs-mode-mapping.test.ts` | — | `targetForPath('window-cropped')` | data-models §2 (no new branch) | unit (pure) |
| 28 | `record-all-tabs-mode-mapping.test.ts` | `@property` | `modeToPath` totality | ADR-012 (every mode routed) | unit (pure) |

Total: **28 scenarios** across **5 files** — 12 acceptance E2E + 16 pure unit
seams. ENABLED (RED) on first run: #1, #3 (headless-safe acceptance), #13, #22
(pure seams). The rest are staged: `it.skip`/`test.skip` (one-at-a-time DELIVER)
or `test.fixme @human-gate` (need real window pixels).

## Real-browser vs pure-seam split

| Concern | Where it is tested | Why |
|---|---|---|
| Crop **math** (drag-rect → stream CropRect, clamp, output size) | **Pure unit** (Vitest), #13-21 — the ≥80% mutation target | Deterministic, headless, no browser (QA-4). Chrome 148 cannot run capture; the math must not depend on it. |
| Mode → path discriminant + start-message variant | **Pure unit** (Vitest), #22-28 | Pure function; AC1.2 wire shape provable without a browser. |
| Mode control offered + single-tab default unchanged | **Acceptance, headless-safe** (#1, #3) | The popup DOM is real and drivable; no capture needed → runs in CI today. |
| Popup → record-page routing; indicator present in DOM | **Acceptance, pending** (#4, #8) | Automatable once DELIVER wires routing/indicator; `test.skip` until then. |
| Crop **fidelity** (real pixels, content-only), getDisplayMedia(window), canvas compositor, follow-across-switches, indicator accuracy, out-of-window hold | **Acceptance, human gate** (#2, #5-7, #9-12) | Need real window pixels + a real pointer drag + real tab activation. Chrome 148 blocks CLI/CDP unpacked-extension capture, and a pixel-accurate crop cannot be driven headlessly. |

**Brittle-assertion avoidance (per task brief).** No scenario screenshot-compares
to prove "chrome is excluded." Robust proxies used instead:
- file downloads with the unchanged pattern `broshow-YYYY-MM-DD-HHmmss.{mp4|webm}`;
- recorded video dimensions match the crop output size (crop applied);
- download COUNT is exactly 1 after N tab switches (no second file → follow, not re-acquire);
- the "Recording window region" indicator text is present in the DOM.
Pixel-level chrome exclusion is confirmed by a human reviewer on production data
(the dogfood gate), never by an automated pixel diff.

## Human / CI gate (tagged, NOT silently skipped)

Per DESIGN §16 + SPIKE testability constraint (Chrome 148 blocks CLI/CDP
unpacked-extension loading; crop fidelity / follow need real window pixels), the
following are `test.fixme` with the `@human-gate` tag and run as the **slice-01 /
slice-02 dogfood pass** (feature-delta DoD #1, slice "Dogfood moment"):

| Gate scenario | AC | Run as |
|---|---|---|
| #2, #5 — content-only crop on a real window | AC-crop | slice-01 dogfood: record a real 2-tab walkthrough cropped to the content area; human confirms chrome is absent. |
| #6 — exactly one cropped file, filename unchanged | AC2.3 | slice-01 dogfood (same pass). |
| #7 — picker cancel surfaces a visible notice | AC2.4 | slice-01 dogfood (cancel the picker; confirm notice + idle). |
| #9 — follow across 3 tabs, one file, no gap | AC2.1 | slice-02 dogfood: 3+ tab demo in one cropped take. |
| #10, #11 — indicator accurate across switches; ≤1-gesture stop | AC3.1, AC3.3 | slice-02 dogfood (same pass). |
| #12 — other-window activation does NOT extend capture | AC3.2 / D2 | slice-02 dogfood (open a 2nd window; confirm its content is absent). |

DELIVER records per-run outcomes (PASS/FAIL, tester, date) when it executes the
dogfood passes; it unfixmes a scenario if/when an automatable harness (e.g. a
headed persistent-context driver that can drive the crop drag) becomes available.
The `@human-gate` tag keeps these visible in `playwright test --list` so the lane
is never silently dropped (same pattern as `firefox-host-smoke.spec.ts`
`@manual-fallback`).

## AC-to-scenario traceability

| AC | Scenarios pinning it |
|----|----------------------|
| AC1.1 (mode control; default single-tab unchanged) | 1, 3, 23, 24, 25 |
| AC1.2 (start carries the follow/window-cropped mode discriminant) | 4, 22 |
| AC1.3 (indicator: which scope is being captured) | 8, 10 |
| AC1.4 (no dead control on unsupported targets) | see note ‡ |
| AC2.1 (one file, content updates across switches, no gap) | 2, 9 |
| AC2.2 (seam threshold) | **OBSOLETED by SPIKE** — continuity is structural (one stream, no seam). No scenario; documented in feature-delta SPIKE section. |
| AC2.3 (filename/path unchanged) | 2, 6 |
| AC2.4 (re-acquire/capture failure surfaces a visible notice, never silent) | 7 |
| AC3.1 (indicator updates within one activation; accurate whole session) | 8, 10 |
| AC3.2 (other-window activation does not extend capture; D2) | 12 |
| AC3.3 (stop in ≤1 gesture regardless of switch count) | 11 |
| AC-crop (slice-01: content-only output) | 2, 5, 13–21 (math) |

‡ **AC1.4 note (back-propagation candidate):** AC1.4 ("on an unsupported target
the mode control is hidden or disabled with a one-line reason") was written for
the obsolete tabCapture-follow capability probe. Under R1-cropped the mechanism is
`getDisplayMedia`, which BroShow already feature-detects via
`detectRecordingCapability` (`popup-logic.ts`) — the cropped-window mode is
available wherever `getDisplayMedia` is. A dedicated "hide the mode on unsupported"
scenario is deferred: the existing capability probe already gates recording, and
the cropped-window mode rides the same probe. Flagged in `upstream-issues.md` for
the PO to confirm AC1.4 is satisfied-by-inheritance rather than needing a new
control-hiding behavior. Not a blocker — no contradiction, just a re-aim artifact.

## US-to-scenario traceability

| US | Scenarios pinning it |
|----|----------------------|
| US-1 (arm the cropped-window mode; default unchanged) | 1, 3, 4, 22, 23, 24 |
| US-2 (continuous capture across a tab switch; one file) | 2, 9, 6 |
| US-3 (know + bound what is recorded; honest indicator) | 8, 10, 11, 12 |

Every in-scope US has at least one scenario. Every testable AC maps to ≥1
scenario; AC2.2 is explicitly obsoleted (documented), AC1.4 is
satisfied-by-inheritance (flagged for PO confirmation).

## Error / edge-case ratio (Mandate happy-path bias)

Error / boundary / negative / regression scenarios:
- 3, 23, 24, 25, 26 — regression guards (existing modes byte-for-byte unchanged)
- 7 — picker-cancel / capture failure surfaces a notice (AC2.4)
- 12 — out-of-window boundary; capture does NOT extend (AC3.2)
- 14, 15, 16 — clamping / degenerate-drag / negative-origin (boundary math)
- 19 — sub-pixel integrality (boundary)
- 21 — odd-dimension even-rounding (boundary)
- 27 — targetForPath totality over the widened union (defensive)

Error/boundary/negative scenarios: **13 of 28 = 46%.** Above the 40% threshold.

## Spec-file purpose summary

- **walking-skeleton.spec.ts** — the thinnest R1-cropped E2E (pick mode → crop →
  record → stop → one cropped file). One headless-safe scenario (mode offered) +
  one human-gated full-flow scenario.
- **milestone-1-window-cropped-record.spec.ts** — slice-01: cropped-window record
  flow, crop fidelity (human gate), filename parity, AC2.4 capture-failure notice,
  and the single-tab regression guard (headless-safe).
- **milestone-2-follow-and-indicator.spec.ts** — slice-02: honest indicator
  presence (headless-safe) + follow-across-switches, indicator accuracy,
  ≤1-gesture stop, out-of-window hold (human gate).
- **record-all-tabs-crop-geometry.test.ts** — PRIMARY mutation target; the pure
  crop math (drag-rect → CropRect, clamp, output sizing).
- **record-all-tabs-mode-mapping.test.ts** — the mode/path discriminant + the
  window-cropped start-message variant + targetForPath totality (pure).

## Why no Gherkin `.feature` files

Same as the parent features: the repo convention is Playwright + Vitest with
descriptive `describe`/`it` strings and Given/When/Then comment blocks, not
pytest-bdd / cucumber. The BDD intent is preserved (business-language titles,
Given/When/Then structure); the feature-delta DISCUSS stories are the canonical
narrative source.
