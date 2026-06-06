# SPIKE Decisions — record-all-tabs

## Assumption Tested
Can capture follow the active tab mid-recording — can a `tabs.onActivated`
handler in the service worker mint a new capture source **without a fresh user
gesture** — and yield a single continuous tab-scoped file? (UNKNOWN-1 + UNKNOWN-2)

## Probe Verdict
**DOESN'T WORK (as specified).** Evidence-based (high confidence), not
live-measured — Chrome 148 blocked every programmatic path to load/drive the
throwaway extension (`--load-extension` disabled, `/json/new` off, browser-CDP
origin-gated), and manual runs kept landing on the production BroShow card.
Verdict rests on documented `tabCapture` gesture-gating + the production capture
architecture (single-`streamId` WebCodecs pipeline, no source-swap path). See
`findings.md`. No Chromium primitive delivers *tab-scoped + auto-follow + single
file* together.

## Promotion Decision
**PIVOT.** No walking skeleton to promote (nothing worked). The original feature
definition (DISCUSS D1) is infeasible. Reframed — see `upstream-issues.md`.

## Chosen reframing: R1-cropped (locked 2026-06-06)
**Window-surface capture + user-drawn crop region.**
- `getDisplayMedia({video:{displaySurface:'window'}})` captures the browser
  window's live pixels — which **inherently follows** whichever tab is active.
- A one-time **user-drawn crop rectangle** selects the content area; capture is
  canvas-cropped to it, **hiding the tab strip / toolbar / other windows**.
- Output: a single mp4 (webm fallback) of the cropped, tab-following content.

### Accepted caveats (user decision: "R1-cropped is enough")
- Cropping hides browser chrome and other tabs, but **the active tab's content is
  still recorded** — switching to a sensitive tab records it. User accepts this
  and will avoid switching to sensitive tabs. No pause/exclude in v1.
- Region/Element Capture APIs (`cropTo`/`restrictTo`) are **self-tab only** and
  cannot be used here — crop is manual canvas compositing.
- Crop-rectangle accuracy is the main residual risk; the user-drawn region
  removes the fragile chrome-height-estimation problem.

## Walking Skeleton
None (PIVOT, not PROMOTE).

## Design Implications
- DESIGN builds on `getDisplayMedia` (already the production fallback path), adds
  a canvas-crop compositing stage before the existing recorder pipeline, and a
  crop-region selection UI.
- Firefox maps naturally: it already uses `getDisplayMedia` as its primary path.
- The existing single-`streamId` offscreen contract is replaced/augmented by a
  display-media + crop-rect contract for this mode.

## Constraints Discovered
- **Testability:** Chrome 148 blocks CLI/CDP unpacked-extension loading. Automated
  acceptance/E2E for capture behavior needs a Puppeteer/Playwright persistent
  context (headed) or a human-in-loop gate. Budget this in DISTILL/DELIVER.
- A separate **production bug** was observed while testing (BroShow 0.2.18 tab
  recording threw `Cannot read properties of undefined (reading 'track')` and
  produced no download). Out of scope here — logged for a future look.
