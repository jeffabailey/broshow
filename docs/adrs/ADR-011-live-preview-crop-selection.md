# ADR-011: Live-Preview Crop Selection in the Record Page

## Status

Accepted

## Context

ADR-010 selects window-surface capture canvas-cropped to a user-drawn region.
This ADR decides **how the user defines the crop rectangle** and **where**. The
crop accuracy is the main residual risk identified by the SPIKE
(`spike/wave-decisions.md`): "Crop-rectangle accuracy is the main residual
risk; the user-drawn region removes the fragile chrome-height-estimation
problem."

Constraint: `getDisplayMedia` must be invoked from a page with a user gesture
and full `Window` privileges. The shipped `record.html`/`record.ts` (the Firefox
recorder surface) already satisfies this.

## Options Considered

### Option A: Chrome-height estimation (REJECTED)

Estimate the browser chrome height (toolbar + tab strip) and auto-crop it off.

- **Pros**: no user interaction.
- **Cons**: brittle across OS, zoom, theme, bookmarks bar, extensions row, DPI.
  The SPIKE explicitly named this "the fragile chrome-height-estimation
  problem."
- **Rejection**: low fidelity; fails QA-2 (crop fidelity) unpredictably.

### Option B: Fixed/preset crop ratios (REJECTED)

Offer preset regions (e.g. "16:9 centered").

- **Pros**: simple UI.
- **Cons**: cannot match arbitrary content layouts; users with side panels,
  split views, or non-standard windows get wrong crops.
- **Rejection**: does not generalize; fails the WYSIWYG promise.

### Option C: Live preview + user-drawn rectangle (SELECTED, = Decision A)

Reuse `record.html`/`record.ts` to show the captured window stream live and let
the user **drag a selection box over the live preview**, then confirm. The crop
rect is derived from the preview, not from estimation.

- **Pros**:
  - WYSIWYG — the user sees exactly what will be recorded.
  - Removes the chrome-height-estimation fragility entirely.
  - Reuses an existing gesture-capable surface; no new page invented.
  - The preview→stream coordinate mapping is a **pure** function
    (`crop-geometry.ts`), unit + mutation testable without a browser.
- **Cons**:
  - One extra interaction (drag + confirm) before recording starts.
  - Requires a live-preview render of the window stream (an effect, validated by
    the headed/manual E2E gate).

## Decision

**Option C: live-preview, user-drawn crop rectangle in the record page.** The
record page renders the window stream, captures a pointer-drag rectangle in
preview coords, and the pure `crop-geometry.ts` maps it to a stream-space
`CropRect` consumed locally by the compositor.

## Consequences

### Positive

- Highest crop fidelity with the least fragility (QA-2).
- The risky math is a pure, headlessly-tested function (QA-4).
- The `CropRect` never crosses a message boundary — it is produced and consumed
  in the same page, simplifying the data model (`data-models.md §4, §5`).

### Negative

- Adds a pre-record interaction step (acceptable per slice-01 scope).
- No mid-recording re-selection in v1 (out of scope per slice-02).

## Relationships

- Implements the crop-selection half of ADR-010.
- Feeds ADR-013 (the compositor consumes the resulting `CropRect`).
- Reuses the record-page surface introduced by ADR-003 (Firefox host).
