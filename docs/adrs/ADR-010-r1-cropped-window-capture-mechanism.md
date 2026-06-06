# ADR-010: R1-Cropped Window-Capture Mechanism for "Record All Tabs"

## Status

Accepted (supersedes the tabCapture-follow framing of DISCUSS D1)

## Context

The `record-all-tabs` feature's DISCUSS decision D1 defined the job as
"follow the active tab — one continuous mp4 whose capture source switches as the
active tab changes; NOT whole-screen capture."

The slice-00 SPIKE (`docs/feature/record-all-tabs/spike/findings.md`,
`wave-decisions.md`, `upstream-issues.md`) tested whether a service-worker
`tabs.onActivated` handler can mint a follow capture source **without a fresh
user gesture** and yield a single continuous file. Verdict: **doesn't work as
specified.** No Chromium primitive delivers *tab-scoped + auto-follow + single
file* together (evidence-based, high confidence; Chrome 148 blocked live CLI/CDP
extension loading).

The user reframed the feature to **R1-cropped** and locked it (D1′, 2026-06-06).
This ADR records the mechanism decision.

## Options Considered

### Option A: `tabCapture.getMediaStreamId` per switch (REJECTED)

SW mints a new streamId on `tabs.onActivated`.

- **Pros**: tab-scoped (no browser chrome).
- **Cons**: `chrome.tabCapture` is gesture-gated; an `onActivated` handler
  carries no user activation, so minting a follow streamId is rejected. The
  production pipeline also binds one `MediaStreamTrackProcessor` to one track at
  start — re-piping mid-recording is net-new and fragile even if a source could
  be acquired.
- **Rejection**: hard fail on the gesture constraint (SPIKE UNKNOWN-1).

### Option B: `getDisplayMedia` tab/browser surface (REJECTED)

- **Pros**: tab-scoped.
- **Cons**: pins to the *chosen* tab; keeps capturing it after the user switches
  away. Does not follow. (Already wired as a production fallback.)
- **Rejection**: violates the follow intent.

### Option C: `getDisplayMedia` window/monitor surface, raw (REJECTED as raw)

- **Pros**: visually follows the active tab (captures the window's pixels).
- **Cons**: includes the browser toolbar/tab strip — i.e. recording the browser
  window, which D1 explicitly excluded (overlaps `desktop-screen-recording`).
- **Rejection as raw**: fails the "no browser chrome" goal.

### Option D: per-switch user gesture "segments" (REJECTED)

- **Pros**: tab-scoped; one file via stitching.
- **Cons**: destroys the "one take / follow my eyes" UX the job asked for.
- **Rejection**: defeats the JTBD.

### Option C′ (SELECTED): window-surface capture + user-drawn canvas crop

`getDisplayMedia({video:{displaySurface:'window'}})` captures the window's live
pixels (which **inherently follow** the active tab), then a **one-time
user-drawn crop rectangle** selects the content area; capture is **canvas-cropped**
to it, hiding the tab strip / toolbar / other windows.

- **Pros**:
  - Delivers the functional job: one gap-free mp4 that follows the active tab.
  - Continuity is **trivial** — one uninterrupted stream, no seam (the original
    AC2.2 seam risk disappears).
  - Builds on `getDisplayMedia`, already the production fallback path.
  - No new permission, no outbound network.
- **Cons / accepted caveats**:
  - The active tab's **content** is still recorded on switch (cropping hides
    chrome, not content). User accepted this ("R1-cropped is enough"); no
    pause/exclude in v1.
  - Crop-rectangle accuracy is the main residual risk — mitigated by ADR-011
    (live preview), which removes the fragile chrome-height-estimation problem.
  - Region/Element Capture (`cropTo`/`restrictTo`) is self-tab only and cannot
    be used; crop is manual canvas compositing.

## Decision

**Adopt Option C′ (window-surface `getDisplayMedia` + user-drawn canvas crop)
as the mechanism for the "Record all tabs" mode.** This supersedes the
tabCapture-follow framing of D1; D1′ is the locked intent.

## Consequences

### Positive

- The feature becomes feasible with **zero new dependencies** and no new
  permission.
- The "seam" risk class is eliminated (single continuous stream).
- Reuses the existing recorder pipeline and the record-page gesture surface.

### Negative

- Residual privacy caveat (sensitive-tab content recorded) — carried to DISTILL
  as an "honest indicator" requirement, not silently dropped.
- Crop fidelity must be validated on real window pixels (headed E2E or human
  gate; Chrome 148 testability constraint).

## Relationships

- Distinct from `desktop-screen-recording` (full screen, no crop-to-content):
  this is window-scoped + cropped. See ADR-012.
- Enables ADR-011 (crop selection UX) and ADR-013 (compositor placement).
- Does not touch ADR-001/002/003 (offscreen, mp4-mux, Firefox host) — those
  pipelines are reused.
