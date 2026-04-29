# Requirements: desktop-screen-recording

## Functional Requirements

### FR-1: Source Selection UI
The popup must present a source selector allowing the user to choose between:
- **"This Tab"** — existing tab capture via `chrome.tabCapture.getMediaStreamId`
- **"Screen / Window"** — new screen/window capture via `navigator.mediaDevices.getDisplayMedia`

Default selection: "This Tab" (preserves existing behavior for current users).

### FR-2: Screen/Window Capture
When "Screen / Window" is selected and the user clicks Start Recording:
- The extension invokes `getDisplayMedia()` with video (and audio if available)
- The browser shows its native screen/window picker
- The user selects a screen or window
- The resulting MediaStream is passed to the offscreen document for recording

### FR-3: Stream Pipeline Compatibility
The offscreen recording pipeline must accept both:
- A `streamId` (from tabCapture, existing path)
- A `MediaStream` (from getDisplayMedia, new path)

Both paths must produce the same output: MediaRecorder chunks -> mp4 mux -> download.

### FR-4: Source Selection Persistence
The user's source selection must persist in `chrome.storage.local` so it is remembered across popup opens.

### FR-5: UI Guards During Recording
The source selector must be disabled while recording is active or processing. The user cannot switch source mid-recording.

### FR-6: Stream Termination Handling
If the captured screen/window becomes unavailable (window closed, display disconnected), the extension must:
- Detect the stream's `ended` event
- Auto-stop recording
- Process and download whatever was captured

### FR-7: Graceful Degradation
If `getDisplayMedia` is not available in the browser, the "Screen / Window" option must be hidden. The extension operates in tab-only mode without errors.

## Non-Functional Requirements

### NFR-1: No New Permissions
`getDisplayMedia` does not require additional manifest permissions beyond what is already declared. No new permissions should be added.

### NFR-2: Existing Behavior Unchanged
Users who never interact with the source selector must experience identical behavior to the current extension. Default = tab capture.

### NFR-3: Functional Architecture
New logic must follow the existing functional paradigm:
- Pure functions for state transitions and UI descriptions
- Effects isolated at browser API boundaries
- Algebraic types for the new capture mode discriminant
