# Technology Stack: desktop-screen-recording

## New APIs Used

| API | Purpose | Context | Notes |
|-----|---------|---------|-------|
| `navigator.mediaDevices.getDisplayMedia()` | Acquire screen/window stream | Offscreen document | Shows browser-native picker; user selects screen or window |
| `chrome.offscreen.createDocument()` with `DISPLAY_MEDIA` reason | Create offscreen document for screen capture | Service worker | Chrome recognizes this reason as permission for getDisplayMedia |
| `chrome.storage.local` (key: `broshow:capture-mode`) | Persist source selection | Popup | Already in use for recording data transfer |
| `MediaStreamTrack.onended` | Detect source loss (window closed, display disconnected) | Offscreen document | Triggers auto-stop of recording |

## No New Dependencies

No new npm packages. The existing stack handles everything:

| Existing Dependency | Still Used For |
|-------------------|---------------|
| `mp4-mux` | WebM → mp4 muxing (source-agnostic) |
| `esbuild` | Bundling (no config changes needed) |
| TypeScript | Type safety |

## No New Permissions

The existing manifest permissions are sufficient:

```json
{
  "permissions": ["activeTab", "tabs", "tabCapture", "offscreen", "downloads", "storage"]
}
```

- `getDisplayMedia` does **not** require a manifest permission — it uses browser-native consent (the screen picker)
- `offscreen` permission already declared — just using a different `reason` at runtime
- `storage` permission already declared — just adding a new key

## Browser Compatibility

| Browser | Tab Capture | Screen Capture | Notes |
|---------|------------|---------------|-------|
| Chrome 116+ | Full | Full | `getDisplayMedia` + offscreen `DISPLAY_MEDIA` reason supported |
| Brave (latest) | Full | Full | Chromium-based |
| Edge (latest) | Full | Full | Chromium-based |
| Firefox | Partial | N/A | No `chrome.offscreen` API; would need different architecture |
| Older Chromium | Full | Hidden | `getDisplayMedia` check hides option; tab recording unaffected |

## Offscreen Document Reasons

The offscreen document creation switches reason based on capture mode:

| Capture Mode | Offscreen Reasons | Justification String |
|-------------|------------------|---------------------|
| `'tab'` | `['USER_MEDIA']` | "Recording browser tab audio and video" |
| `'screen'` | `['DISPLAY_MEDIA']` | "Recording screen or window content" |
