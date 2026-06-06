# Walking Skeleton: record-all-tabs (R1-cropped)

> Wave: DISTILL
> Strategy: **C (extend the existing skeleton)** — per feature-delta §"Walking
>   Skeleton Strategy" and DISCUSS [D]. The end-to-end recording skeleton already
>   exists (popup gesture → record-page/offscreen capture → recorder pipeline →
>   mp4 mux → `chrome.downloads`). This feature threads a NEW top-level mode
>   `'window-cropped'` through the record-page recorder path (the shape Firefox
>   already uses) and adds a canvas-crop stage upstream of the unchanged
>   `createRecordingSession`. It does NOT stand up a new skeleton.

## Strategy declaration (Architecture of Reference)

| Port class | Port | Treatment | Mechanism |
|---|---|---|---|
| Driving | Popup UI (mode selector) | REAL | Playwright persistent context + `--load-extension`; real `popup.html` |
| Driving | Record page (`record.html`) crop preview + gesture | REAL | Playwright persistent context; real page in a real window |
| Driven internal | `chrome.downloads` (file output) | REAL | real download; assert file appears on disk |
| Driven internal | Recorder pipeline (`createRecordingSession`) | REAL | unchanged; consumes the cropped `MediaStream` |
| Driven internal | Canvas-crop compositor | REAL | real `<canvas>` + `captureStream` (headed / human gate) |
| Driven external / non-deterministic | `getDisplayMedia({displaySurface:'window'})` surface picker | FAKE | Chrome `--use-fake-ui-for-media-stream` / `--auto-select-desktop-capture-source` |

No `@in-memory` on any `@walking_skeleton` scenario. The skeleton uses real
adapters end-to-end, exactly as the existing `walking-skeleton.spec.ts`.

## The walking-skeleton scenario

`tests/acceptance/record-all-tabs/walking-skeleton.spec.ts`, tagged
`@walking_skeleton @real-io @chromium`:

> **Dana picks "Record all tabs (window, cropped)", drags a crop region over the
> live window preview, records, stops, and gets ONE cropped file named
> `broshow-YYYY-MM-DD-HHmmss.{mp4|webm}`.**

This closes the full R1-cropped loop through the production composition root
(popup → record page gesture → getDisplayMedia(window) → crop-geometry →
compositor → recorder → `chrome.downloads`). A non-technical stakeholder confirms
"yes — Dana drew a box, recorded, and got one cropped video." That is the demo.

### Two-part realization (Chrome 148 constraint)

The walking skeleton is split into the part automatable today and the part that
needs a human gate:

1. **`@walking_skeleton` headless-safe (ENABLED):** "Dana opens the popup and
   sees a 'Record all tabs' mode she can choose, with single-tab still the
   default." Proves the new mode is OFFERED through the real popup and the default
   path is untouched (AC1.1) — runs in CI now.
2. **`@walking_skeleton @human-gate` (`test.fixme`):** the full crop-draw +
   record + cropped-file flow. Needs real window pixels and a real pointer drag
   that Chrome 148 will not let an unpacked extension drive via CDP. Run as the
   slice-01 dogfood pass; DELIVER records the outcome and unfixmes if an
   automatable crop-drag harness lands.

This mirrors the parent `firefox-recording-support` skeleton, which is likewise
dual-track (automatable Chromium regression guard + `@manual-fallback` Firefox
runtime). The honest test boundary is documented, not hidden.

## Mandate 5 litmus test (user-centric framing)

| Scenario | User goal? | Then is observable? | Stakeholder-confirmable? |
|---|---|---|---|
| "Dana sees a 'Record all tabs' mode, single-tab still default" | YES (Dana wants to opt into multi-tab capture) | YES (mode control visible; Start still there) | YES |
| "Dana draws a crop, records, gets ONE cropped file" | YES (one share-ready cropped take) | YES (a file in Downloads, dimensions = crop) | YES |

Both are framed as Dana's goals and end in observable outcomes (a control she can
pick, a file she can open) — not "layers connect."

## Mandate 9 (Walking Skeleton Boundary Proof)

| Check | Status | Evidence |
|---|---|---|
| 9a — Strategy declared | PASS | This file + feature-delta §"Walking Skeleton Strategy" (Strategy C). |
| 9b — WS matches strategy | PASS | Real Playwright + real extension; no `@in-memory` on any WS scenario. |
| 9c — Every driven adapter has a real-I/O test | PASS (with human gate) | See adapter coverage audit below. |
| 9d — WS fixture tier is real | PASS | Deleting the record-page crop wiring (the new path) breaks the WS; no in-memory shim is exercised. |
| 9e — No `@in-memory` on `@walking_skeleton` | PASS | grep verified: WS uses `@real-io` only. |

## Mandate 6 — Adapter coverage audit

| Driven adapter | Coverage | Spec | Tag |
|---|---|---|---|
| `crop-geometry.ts` (PURE seam) | Real (pure) unit + mutation | `tests/unit/record-all-tabs-crop-geometry.test.ts` | (ENABLED, RED; ≥80% mutation target) |
| Canvas-crop compositor (`crop-compositor.ts`, NEW effect) | Real `<canvas>`+`captureStream` via headed E2E / human gate | `walking-skeleton.spec.ts` #2, `milestone-1` #5 | `@real-io @human-gate` |
| `getDisplayMedia({displaySurface:'window'})` | Real API, fake picker (Chrome flags) | `walking-skeleton.spec.ts` #2, `milestone-1` | `@real-io @human-gate` |
| `chrome.downloads` (file output) | Real download → file on disk | `walking-skeleton.spec.ts` #2, `milestone-1` #6 | `@real-io @human-gate` |
| Recorder pipeline (`createRecordingSession`) | UNCHANGED; covered by existing parent-feature WS + `milestone-1` regression | existing + `milestone-1` #3 | `@real-io @chromium @regression` |
| Popup mode control (DOM) | Real popup, headless-safe | `walking-skeleton.spec.ts` #1, `milestone-1` #3 | `@walking_skeleton @real-io @chromium` |

Every NEW driven adapter has at least one real-I/O scenario. The two seams that
need real window pixels (compositor, getDisplayMedia) are covered by the
`@human-gate` dogfood pass; the pure crop math is covered headlessly and carries
the mutation gate. The recorder pipeline is unchanged and regression-guarded.

## Why "extend, don't rebuild"

DESIGN (ADR-013, component-boundaries §5) places the canvas-crop compositor
INSIDE the record page, upstream of the UNCHANGED `createRecordingSession`. The
cropped `MediaStream` is consumed where it is produced (it cannot be serialized
through a `streamId`). The single-tab Chromium offscreen/`streamId` contract is
byte-for-byte preserved and is NOT on this flow. So the skeleton's job is to prove
the NEW path (record page → crop → recorder → download) end-to-end while the
existing single-tab skeleton stays green — exactly what scenarios #1/#3
(regression) and #2 (new path, human gate) do together.
