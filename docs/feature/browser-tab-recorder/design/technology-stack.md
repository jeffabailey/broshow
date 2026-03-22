# Technology Stack: BroRecord

## Runtime

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Language | TypeScript | Type safety, solo dev preference |
| Extension API | Chrome Extensions Manifest V3 | Required for Chrome Web Store; works on Brave/Edge |
| Tab Capture | `chrome.tabCapture.getMediaStreamId()` | MV3-compatible tab capture API |
| Recording | `MediaRecorder` API | Browser-native, hardware-accelerated, outputs WebM (VP8/VP9 + Opus) |
| Mp4 Muxing | `mp4-mux` (npm) | Lightweight client-side WebM→mp4 remuxer. ~50KB. No ffmpeg.wasm needed. |
| Download | `chrome.downloads` API | Triggers browser download with custom filename |
| Offscreen | `chrome.offscreen` API | Hidden document for DOM-dependent APIs (MediaRecorder) in MV3 |

## Build

| Tool | Purpose | Rationale |
|------|---------|-----------|
| esbuild | Bundle TypeScript → JS | Fast, zero-config, handles npm dependencies. Produces per-entry bundles for popup, background, offscreen. |
| npm | Package management | Standard, `mp4-mux` is on npm |

## Why mp4-mux over alternatives?

| Option | Size | Pros | Cons |
|--------|------|------|------|
| **mp4-mux** | ~50KB | Lightweight, purpose-built for remuxing WebM→mp4, fast | Less mature than ffmpeg |
| ffmpeg.wasm | ~25MB | Full codec support, battle-tested | Massive bundle size, overkill for remuxing |
| fix-webm-duration + serve WebM | 0KB | No muxing needed | WebM not universally playable, doesn't meet mp4 requirement |

**Decision**: `mp4-mux` — right-sized for the job.

## Permissions

```json
{
  "permissions": ["tabCapture", "offscreen"],
  "optional_permissions": [],
  "host_permissions": []
}
```

- `tabCapture`: Required to capture tab media stream
- `offscreen`: Required to create offscreen document for MediaRecorder
- No `downloads` permission needed — `chrome.downloads.download()` works without it when downloading blob URLs

## File Structure

```
brorecord/
├── src/
│   ├── popup.ts          # Popup UI logic
│   ├── popup.html         # Popup markup
│   ├── popup.css          # Popup styles
│   ├── background.ts      # Service worker
│   ├── offscreen.ts       # Offscreen document logic
│   ├── offscreen.html     # Offscreen document markup
│   ├── types.ts           # Shared types (messages, state)
│   └── mp4.ts             # Mp4 muxing wrapper
├── icons/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── manifest.json
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
└── docs/
    └── feature/browser-tab-recorder/
```

## Browser Compatibility

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome 116+ | Full | MV3 + offscreen + tabCapture all supported |
| Brave (latest) | Full | Chromium-based, same APIs |
| Edge (latest) | Full | Chromium-based, same APIs |
| Firefox | Partial/TBD | `browser.tabCapture` exists but `offscreen` API does not. Would need alternative architecture (background page). Stretch goal. |
