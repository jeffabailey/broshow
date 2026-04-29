# Shared Artifacts Registry: desktop-screen-recording

## Artifacts

| Artifact | Source | Type | Consumed By |
|----------|--------|------|-------------|
| `${popup-state}` | popup-logic.ts (describeUI) | RecordingState | popup.ts (DOM rendering) |
| `${capture-mode}` | popup UI (radio/toggle) | `'tab' \| 'screen'` | popup-logic.ts (start flow branching) |
| `${stream-id}` | chrome.tabCapture.getMediaStreamId | string | background-logic.ts (tab capture path) |
| `${media-stream}` | navigator.mediaDevices.getDisplayMedia | MediaStream | offscreen-logic.ts (screen capture path) |
| `${recording-state}` | background-logic.ts (state machine) | RecordingState | popup (via message), offscreen (via message) |
| `${recording-blob}` | offscreen-logic.ts (MediaRecorder) | Blob | mp4 muxing pipeline |
| `${filename}` | background-logic.ts (filename generation) | string | chrome.downloads API |

## New Artifacts (vs browser-tab-recorder)

| Artifact | Why New |
|----------|---------|
| `${capture-mode}` | Branching point that determines which capture API to invoke |
| `${media-stream}` | getDisplayMedia returns a MediaStream directly (unlike tabCapture which returns a streamId) |

## Persistence

| Artifact | Storage | Key | Lifetime |
|----------|---------|-----|----------|
| `${capture-mode}` | chrome.storage.local | `broshow:capture-mode` | Persists across popup opens |
| `${recording-blob}` | chrome.storage.local (data URL) | `broshow:recording-data` | Cleared after download |
