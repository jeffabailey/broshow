# Requirements: firefox-recording-support

> Extends `docs/feature/browser-tab-recorder/discuss/requirements.md`.
> Existing FRs and NFRs from the parent feature still apply unless explicitly amended below.

## Functional Requirements (Additions)

### FR-FF-01: Firefox recording path

The extension MUST capture a Firefox tab/window/screen using
`navigator.mediaDevices.getDisplayMedia({video: true, audio: true})` when run
on a browser that lacks `chrome.tabCapture` and `chrome.offscreen` but provides
`getDisplayMedia`.

### FR-FF-02: Capability-based path selection

The popup MUST select between the Chromium recording path and the Firefox
recording path using feature detection (not user-agent sniffing). The
detection result is the single source of truth that drives both the path
chosen and the visibility of the Firefox-specific hint copy.

### FR-FF-03: Recording host with sufficient lifetime

The recording host on Firefox MUST keep MediaRecorder alive for at least 5
minutes without any popup interaction. The specific host implementation
(popup, dedicated record-tab, or background.scripts page) is the subject of
DESIGN wave decision DQ-1.

### FR-FF-04: Native-stop parity

The recording host MUST treat `MediaStreamTrack#ended` events (raised when the
user clicks Firefox's native "Stop sharing" or closes the recorded tab) as
equivalent to the user clicking the BroShow Stop button: stop MediaRecorder,
finalize the file, trigger the download, clear the REC badge.

### FR-FF-05: Surface-picker cancel is a no-op

`getDisplayMedia` rejection with `NotAllowedError` (the picker's cancellation
signal) MUST NOT produce a user-facing error. The popup returns to its idle
state.

### FR-FF-06: Audio absence is communicated

When the captured MediaStream has no audio track at recording start, the
popup's success message MUST include "Audio was not captured." This signal
applies on Firefox only.

### FR-FF-07: Chrome path unchanged

The Chrome recording path (offscreen document, `chrome.tabCapture`,
auto-target active tab, mp4 output, REC badge) MUST be byte-for-byte
unchanged from v0.1.2 except for any incidental refactoring required to
introduce the path-selection logic in popup-logic.

## Non-Functional Requirements (Additions / Amendments)

### NFR-FF-01: Permission parity

The Firefox add-on MUST NOT request permissions beyond the current set
declared in `src/manifest.json`. (Today: `tabCapture`, `offscreen`, `storage`,
`downloads`. Firefox accepts unused permissions as warnings only, so the
shipped declared set may stay identical.) If DESIGN finds a Firefox-only
permission is unavoidable, this is an architecture decision that bumps the
permissions count guardrail in `outcome-kpis.md`.

### NFR-FF-02: Browser compatibility

The extension MUST work on Firefox 121+ (matches the existing
`strict_min_version` set by `scripts/patch-firefox-manifest.mjs`). Chromium-
based browsers continue to be supported per the parent feature.

### NFR-FF-03: Privacy parity

No outbound network requests on Firefox, identical to Chrome (NFR-02 in the
parent feature). All processing client-side.

### NFR-FF-04: Performance parity

Recording on Firefox MUST NOT degrade the recorded surface's performance
beyond what `getDisplayMedia` itself imposes (which is browser-controlled).
The mp4-mux step's runtime characteristics MUST match Chrome (within the
limits of the host context chosen by DESIGN).

## Constraints

- **Manifest V3**: Firefox MV3 background uses `background.scripts` (already
  patched by `scripts/patch-firefox-manifest.mjs`). Chrome MV3 uses
  `service_worker`. Both MUST coexist from a single source manifest.
- **No new permissions**: see NFR-FF-01.
- **mp4-mux constraint**: ADR-002 still applies. If the recording host on
  Firefox cannot run mp4-mux (e.g., no DOM), DESIGN must propose an ADR
  amendment.
- **Surface picker is OS/browser-owned**: We cannot style or auto-fill the
  Firefox surface picker.

## Out of Scope (Carry-over from parent + Firefox-specific)

- Webcam overlay
- Whole-desktop recording as a primary feature (it is *available* via the
  Firefox picker but not promoted in our copy)
- Cloud storage / sharing
- Video editing
- Scheduled/timed recordings
- Multiple simultaneous tab recordings
- Auto-retry on picker cancel (cancel is a normal outcome)
- Surface-aware filenames (no need to encode tab vs window vs screen)
- Firefox add-on signing / AMO submission (DEVOPS concern; this feature only
  produces the unsigned `.xpi` build)

## Open Architectural Questions for DESIGN

See `wave-decisions.md`. Summary:

- DQ-1: Where does the recording host live on Firefox? (popup vs record-tab
  vs background.scripts page)
- DQ-2: How does the popup determine which path to use? (capability probe
  is the recommended single source.)
- DQ-3: Does ADR-001 need a Firefox companion ADR, or an amendment?
