# Evolution — record-all-tabs (R1-cropped window recording)

**Delivered:** 2026-06-06 · **Waves:** DISCUSS → SPIKE → DESIGN → DISTILL → DELIVER
**Paradigm:** functional · **Mutation:** per-feature (≥80% gate)

## What shipped

A new top-level recording mode — **"Record all tabs (window, cropped)"** — that
captures the active browser window via `getDisplayMedia({displaySurface:'window'})`,
canvas-cropped to a user-drawn region selected over a live preview in the record
page. Because it captures the window's live pixels, it inherently **follows the
active tab** with no re-acquire and no second file; the crop hides the tab strip,
toolbar, and other windows. Audio is included if shared. A visible "Recording
window region" indicator keeps the capture scope honest.

## The pivotal decision: SPIKE killed the obvious approach

The feature was first framed (DISCUSS D1) as "follow the active tab" via
`tabCapture` — switching the capture source on `tabs.onActivated`. The SPIKE
proved this **infeasible on Chromium**: `tabCapture.getMediaStreamId` is
gesture-gated and cannot mint a new stream from a background `onActivated`
handler, and no Chromium primitive delivers *tab-scoped + auto-follow + single
file* together. The live probe couldn't even be loaded (Chrome 148 disables
CLI/CDP unpacked-extension loading), but the verdict held on API evidence + the
production capture architecture.

**Pivot (D1′):** window-surface capture + canvas crop to a user-drawn region.
Continuity became *structural* (one uninterrupted stream → no seam), which
deleted an entire class of risk (the original AC2.2 seam threshold). See
`docs/feature/record-all-tabs/spike/`.

## Architecture (additive, regression-safe)

- New pure module `src/crop-geometry.ts` — preview-rect → stream `CropRect`
  (per-axis scale, clamp, degenerate-normalize, integral + even rounding). The
  single source of crop math; **100% mutation score (28/28)**.
- New effect module `src/crop-compositor.ts` — canvas crop upstream of the
  **unchanged** `createRecordingSession` (`src/mp4.ts` untouched). Delegates all
  geometry to crop-geometry.
- Mode is **orthogonal to target**: a new `'window-cropped'` `RecordingPath`/mode;
  `selectHost`/`targetForPath` remain the **single platform branch** (no third
  target). `targetForPath('window-cropped')` resolves via the existing capability
  probe, not a new branch.
- Record page owns the gesture, getDisplayMedia, live preview, drag-to-select,
  compositor wiring, the indicator, and the AC2.4 cancel→notice path.
- Single-tab and Firefox paths preserved byte-for-byte.

ADRs: `docs/adrs/ADR-010..013`.

## Testing & honesty

- 436/436 unit/headless green; new pure seams (crop-geometry, mode-mapping,
  compositor wiring, cancel→notice, crop-selection, indicator) cover the
  automatable logic.
- **Capture, crop fidelity, follow-across-switch, out-of-window hold, single-
  gesture stop are `@human-gate` (`test.fixme`)** — Chrome 148 blocks headless
  unpacked-extension capture and these need real window pixels / pointer drags.
  They run as the slice-01/02 dogfood pass, visible in `playwright test --list`,
  never silently skipped.
- DELIVER: 7 TDD steps (5-phase DES, integrity clean), L1–L4 refactor (one real
  dedup), adversarial review APPROVED (testing-theater CLEAN), mutation gate
  PASS.

## Accepted limitation

Cropping hides browser chrome but **still records the active tab's content** when
the user switches to it — including a sensitive tab. Accepted for v1 (no
pause/exclude); the indicator is the mitigation. Revisit if a sensitive-tab
exclusion is requested.

## Testability debt (for next features)

Automated acceptance for capture behavior needs a Puppeteer/Playwright
persistent-context (headed) harness or a human gate — Chrome 148's lockdowns are
now a standing constraint. Budgeted note carried in `docs/architecture/atdd-infrastructure-policy.md`.

## Follow-up — investigated, likely a non-bug (corrected 2026-06-07)

While testing, a `Cannot read properties of undefined (reading 'track')` error +
no-download were observed and initially logged as a suspected production bug. A
follow-up 5-Whys RCA (`docs/analysis/root-cause-analysis-track-undefined-no-download.md`)
concluded this is **not BroShow's code** (high confidence): `grep -rn "\.track" src/`
returns nothing, every track access is guarded/optional-chained, and the
`(index):19529` minified location maps to the **recorded page's own third-party
script**, not BroShow's (unminified) bundles. The `download.webm`-vs-`broshow-*`
naming was a headed-Chrome CDP test-harness artifact (baseline-identical via
`git stash`). Verdict: H2 (environment/misattribution), H1 (real bug)
unsupported. A 5-minute clean-page manual repro (RCA §8) remains available to
fully settle it.
