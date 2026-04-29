# ADR-003: Firefox Recording Host on the MV3 Background Event Page

## Status

Accepted

## Context

ADR-001 selected `chrome.offscreen.createDocument()` as the MediaRecorder
host on Chromium MV3 and noted: "Firefox compatibility requires a different
approach (Firefox supports background pages, not offscreen documents)."
This ADR resolves that open thread.

The user-visible contract that constrains the choice (from
`docs/feature/firefox-recording-support/discuss/`):

- AC-FF-03: a 5-minute recording on Firefox MUST survive without popup
  interaction.
- FR-FF-04: the host MUST treat `MediaStreamTrack#ended` as equivalent to
  the user clicking Stop.
- FR-FF-07: the Chrome path MUST be byte-for-byte unchanged.
- NFR-FF-01: no new permissions.
- NFR-FF-03: no outbound network.

Three host options were enumerated in DISCUSS (DQ-1).

## Options Considered

### Option A: Popup as host (REJECTED)

The popup invokes `getDisplayMedia` and runs MediaRecorder until the user
clicks Stop.

- **Pros**: Simplest. Same context that already calls `tabCapture.getMediaStreamId`
  on Chrome. User-gesture context is local.
- **Cons**: The popup closes on blur in Firefox (and in Chromium). A
  recording that cannot survive a click anywhere else in the browser
  violates AC-FF-03. The only mitigation is "tell the user to keep the
  popup open," which is unacceptable UX and unenforceable.
- **Rejection reason**: Hard fail on AC-FF-03 (the floor set by DISCUSS).

### Option B: Dedicated record-tab (REJECTED, kept as fallback)

The popup or background opens a new extension-owned tab whose page hosts
MediaRecorder.

- **Pros**: Survives popup blur. Has DOM. Reliable lifetime. User-gesture
  context can be reconstructed inside the tab on its first interactive
  load.
- **Cons**: The user sees an extra tab. Tab management UX (open on Start,
  focus on Stop, close after download). Risk of the user closing the tab
  mid-recording, requiring graceful handling. Higher maintenance load
  versus the symmetrical Chromium offscreen design.
- **Rejection reason**: Worse on QA-5 (maintainability) and QA-1 (Chrome
  parity); equal on QA-2. Retained as a documented fallback if the spike
  on Option C fails.

### Option C: Firefox MV3 background event page as host (SELECTED)

Code that already runs in the Firefox MV3 background event page (configured
by `scripts/patch-firefox-manifest.mjs`'s `background.scripts`) hosts
MediaRecorder + mp4-mux. The popup forwards Start/Stop messages; the
event page invokes `getDisplayMedia` on receipt of Start. Active
MediaRecorder + active MediaStream tracks keep the event page alive across
the recording's lifetime.

- **Pros**:
  - Symmetric to Chrome's offscreen document pattern (popup as remote
    control, host elsewhere).
  - Reuses `createOffscreenMessageHandler` from `src/offscreen-logic.ts`
    by swapping only the `getUserMedia` adapter.
  - mp4-mux runs unchanged (DOM/Blob/URL all present).
  - No new permissions, no new tabs, no UX artifacts.
  - Single target branch in `background.ts`'s `selectHost` factory; pure
    logic stays target-blind.
- **Cons**:
  - `getDisplayMedia`'s user-gesture binding when invoked from a
    background context after a popup-forwarded message is not
    universally documented for all Firefox MV3 versions; this is the
    one architectural assumption that requires a spike (S-1 in
    `docs/feature/firefox-recording-support/design/wave-decisions.md`).
  - Firefox's MV3 event-page lifetime is less rigorously specified than
    Chrome's service-worker lifetime, though active media activity is
    documented to keep it alive.

## Decision

**Option C: the Firefox MV3 background event page hosts MediaRecorder.**

Tie-break versus Option B: equal on the AC-FF-03 floor; Option C wins on
maintainability (QA-5) by reusing the pure recording handler with a single
adapter swap, and on Chrome-parity (QA-1) by mirroring the Chrome
offscreen pattern.

## Consequences

### Positive

- Functional core (`*-logic.ts`) is unchanged. The Firefox path is purely
  additive at the adapter layer.
- mp4-mux + WebM-fallback pipeline (ADR-002) is reused byte-for-byte.
- Permission set in `src/manifest.json` is unchanged (NFR-FF-01 honored).
- One platform branch only -- located in `background.ts`'s `selectHost`
  factory. Architecture rule enforced via dependency-cruiser (see
  technology-stack.md §5).
- The popup is a remote control on both targets; no platform-specific
  popup logic beyond capability detection and hint visibility.

### Negative

- One spike (S-1) is required during DELIVER to validate the
  `getDisplayMedia` user-gesture chain on Firefox 121 ESR. If the call
  rejects, fall back to Option B (record-tab); if both reject, the
  decision returns to DISCUSS.
- A small risk that the Firefox event page is unloaded mid-recording. An
  active MediaRecorder is documented to keep the page alive; defense in
  depth is a no-op `setInterval` heartbeat in the host adapter (added
  only if S-2 reveals the need).
- Firefox-specific code lives in a new `firefox-host.ts` adapter. This is
  the intended architectural seam, not accidental duplication.

### Quality-attribute trade-off summary

| Attribute | Option A (popup) | Option B (record-tab) | Option C (background) |
|---|---|---|---|
| QA-1 Chrome regression risk | Low (popup shared) | None (purely additive new tab) | None (additive adapter) |
| QA-2 5-min survival w/o popup | FAIL | Pass | Pass (assumes S-1) |
| QA-3 No outbound network | Pass | Pass | Pass |
| QA-4 No new permissions | Pass | Pass | Pass |
| QA-5 Maintainability | Bad | Medium | Best |

## Relationships to other ADRs

- **ADR-001 (offscreen for MediaRecorder on Chromium)**: NOT superseded.
  Remains Accepted. ADR-003 is its Firefox counterpart, not a replacement.
- **ADR-002 (mp4-mux for container conversion)**: NOT amended. mp4-mux
  runs identically in the Firefox host context.

## Implementation notes (non-binding; software-crafter owns code)

- New file: `src/firefox-host.ts`. Exposes a factory that returns a
  `RecorderHost` (port shape defined in
  `docs/feature/firefox-recording-support/design/component-boundaries.md`).
- The factory composes `createOffscreenMessageHandler` from
  `src/offscreen-logic.ts` with a Firefox-flavored `MediaAPIs` adapter --
  only `getUserMedia` differs (calls
  `navigator.mediaDevices.getDisplayMedia({video:true, audio:true})`).
- `src/background.ts` adds a `selectHost(target: 'chromium' | 'firefox')`
  factory that picks the adapter once at first `start-recording` message.
- `src/popup-logic.ts` extends `CapabilityCheckResult` to a 3-variant
  discriminated union (see `data-models.md`).
- No change to `src/manifest.json`; no change to
  `scripts/patch-firefox-manifest.mjs`.

## Revisability

ADR-003 is independently revisable. If the S-1 spike fails on Firefox 121
ESR, this ADR is superseded by an ADR-004 selecting Option B (record-tab).
The pure-core code remains untouched in that branch -- only the adapter
file changes.
