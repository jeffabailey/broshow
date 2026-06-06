# slice-01 — Record window content, cropped to a user-drawn region

**Type:** Value slice (first R1-cropped end-to-end proof). **Reframed** from the
obsolete tabCapture-follow version (see slice-00 PIVOT). **Effort:** ≤ 1 day.

## Goal (one sentence)
Pick "Record all tabs" mode, drag a crop rectangle over the content area, record
the active browser window cropped to that region, and download one mp4.

## IN scope
- Popup mode control gains **"Record all tabs (window, cropped)"** (US-1, AC1.1–1.2).
- `getDisplayMedia({video:{displaySurface:'window'}})` acquisition (reuses the
  production getDisplayMedia path).
- One-time **crop-region selection** (user-drawn rectangle) over the content area.
- Canvas-crop compositing stage → existing recorder pipeline → mp4 (webm fallback).
- Single output file of the cropped region (US-2, AC2.1, AC2.3 — filename/path
  unchanged).

## OUT scope
- Following indicator polish + multi-switch validation (→ slice-02).
- Sensitive-tab pause/exclude (out of scope v1 per accepted caveat).
- Auto-detecting chrome height (we use the user-drawn rect, not estimation).

## Learning hypothesis
- **Disproves** "we can crop window capture to just the content area and record it"
  if the canvas-crop stage drops frames, mis-aligns, or the recorder pipeline
  can't consume the cropped canvas stream.
- **Confirms** the R1-cropped mechanism end-to-end → unlocks slice-02 (follow + indicator).

## Acceptance criteria
- AC1.1, AC1.2 (mode control + getDisplayMedia window acquisition).
- AC-crop: the downloaded video shows ONLY the user-drawn region — no tab strip,
  toolbar, or other windows. **Production data:** a real browser window, not a fixture.
- AC2.3 (filename/path unchanged: `broshow-YYYY-MM-DD-HHmmss.{mp4|webm}`).
- Regression: single-tab and desktop-screen modes unchanged.

## Dependencies
- None blocking — mechanism resolved by slice-00 SPIKE.

## Dogfood moment
- Record a real 2-tab walkthrough cropped to the content area; confirm chrome is absent.

## Taste tests
- Ships <4 new pieces (mode option + crop-select UI + canvas-crop stage). ✅ thin.
- No unshipped abstraction — getDisplayMedia + recorder pipeline already exist. ✅
- Disproves a real pre-commitment (clean content-only crop). ✅ Production data. ✅
