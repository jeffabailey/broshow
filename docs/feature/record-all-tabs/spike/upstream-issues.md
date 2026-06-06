# SPIKE Upstream Issues — record-all-tabs

The SPIKE revealed a contradiction with a DISCUSS locked decision. Per the
back-propagation contract, the original is preserved (not edited); the new
assumption and rationale are stated here and mirrored into `feature-delta.md`
under a "Changed Assumptions" section.

## Contradiction with DISCUSS D1

**Original (DISCUSS `feature-delta.md`, D1):**
> Meaning of "record all tabs" = follow active tab. One continuous mp4 whose
> capture source switches as the active tab changes. NOT whole-screen capture.

**Problem:** No Chromium primitive supports *tab-scoped + auto-follow + single
file*:
- `tabCapture` follow is gesture-blocked from `tabs.onActivated` (UNKNOWN-1).
- `getDisplayMedia` tab surface pins to one chosen tab (doesn't follow).
- `getDisplayMedia` window surface follows but includes browser chrome (= screen
  recording, which D1 explicitly excluded).

## Resolution (user-approved, 2026-06-06): reframe D1 → D1′ (R1-cropped)

**New D1′:** "Record all tabs" = **record the active browser window's content,
cropped to a user-selected region, which naturally follows the active tab.**
- Mechanism: `getDisplayMedia({video:{displaySurface:'window'}})` + canvas crop
  to a one-time user-drawn rectangle.
- Hides the tab strip / toolbar / other windows (the chrome-privacy goal).
- Accepted caveat: the active tab's *content* is still recorded on switch (no
  sensitive-tab exclusion in v1).

## Knock-on changes for the next wave
- **D3** (capture-follow SPIKE gate): RESOLVED — SPIKE done; mechanism chosen.
- **D5** (Firefox): simplified — Firefox already uses `getDisplayMedia` primarily.
- **Out-of-scope:** "whole-screen capture" exclusion is relaxed in spirit — this
  is window-scoped + cropped, distinct from `desktop-screen-recording` (full
  screen, no crop-to-content).
- **User stories / slices:** US-2/US-3 and slice-00/01/02 were predicated on
  tabCapture follow; re-aimed to R1-cropped (see updated slices + feature-delta).

## Status
Not blocking. Direction locked by the user; the feature can proceed to DESIGN
(or a light DISCUSS touch-up) on the R1-cropped basis.
