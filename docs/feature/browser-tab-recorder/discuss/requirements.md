# Requirements: browser-tab-recorder (BroRecord)

## Functional Requirements

### FR-01: Tab Video Capture
The extension MUST capture the visual content of a single browser tab using the `chrome.tabCapture` API (or equivalent).

### FR-02: Tab Audio Capture
The extension MUST capture audio playing within the recorded tab.

### FR-03: Recording Control
The extension MUST provide start and stop controls via the extension popup.

### FR-04: Mp4 Output
The extension MUST save recordings as mp4 (H.264 video + AAC audio). If mp4 muxing fails, the extension MUST fall back to WebM and inform the user.

### FR-05: Automatic Download
When recording stops, the extension MUST trigger a browser download of the file with a timestamped filename (e.g., `brorecord-2026-03-22-143052.mp4`).

### FR-06: Recording Indicator
The extension MUST show a visual indicator (badge/icon change) while recording is active.

## Non-Functional Requirements

### NFR-01: Simplicity
The extension MUST have no configuration required for basic use. One button to start, one to stop.

### NFR-02: Privacy
The extension MUST NOT make any network requests. All processing happens locally. The extension MUST request only the minimum permissions needed (`tabCapture`, `downloads`).

### NFR-03: Performance
Recording MUST NOT noticeably degrade the performance of the recorded tab.

### NFR-04: Browser Compatibility
The extension MUST work on Chromium-based browsers (Chrome, Brave, Edge). Firefox support is a stretch goal.

### NFR-05: Open Source
The extension MUST be open source with a permissive license.

## Constraints

- **Manifest V3**: Must use Manifest V3 (MV2 is deprecated in Chrome)
- **No external services**: All processing client-side
- **No user accounts**: No sign-up, no cloud storage
- **Mp4 muxing**: Browser MediaRecorder outputs WebM natively; mp4 requires client-side muxing (e.g., mp4-mux or similar library)

## Out of Scope

- Webcam overlay
- Screen recording (whole desktop)
- Cloud storage / sharing
- Video editing
- Scheduled/timed recordings
- Multiple simultaneous tab recordings
