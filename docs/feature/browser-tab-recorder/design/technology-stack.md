# Technology Stack: BroShow

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

> **Authoritative single source of truth.** The list below is the design's binding permission contract. The manifest (`src/manifest.json`) MUST conform to this list; CI enforces via the permission-count gate (see "Implementation status" below).

```json
{
  "permissions": ["tabCapture", "offscreen", "storage", "downloads"],
  "optional_permissions": [],
  "host_permissions": []
}
```

### Design correction note (2026-04-27)

This file previously asserted that `chrome.downloads.download()` works without the `downloads` permission when the source is a `blob:` URL. **That assertion was incorrect.** Per Chrome MV3 documentation, `chrome.downloads.download()` requires the `downloads` permission for every URL type (blob:, data:, http:); the "no permission" path applies only to `<a download>` element clicks, which use a different code path entirely. The DELIVER wave caught this when the manifest reduction to a 3-permission list would have broken the download pipeline, and the user (per /nw-deliver session 2026-04-27) chose to update the KPI cap from `<= 3` to `<= 4` rather than refactor the download path. The `Permissions requested <= 4` KPI in `discuss/outcome-kpis.md` reflects this. See `devops/upstream-changes.md` UC-1 history.

### Required permissions (4 of 4 against KPI cap of <= 4)

| Permission | Required for |
|------------|--------------|
| `tabCapture` | Capturing the tab media stream via `chrome.tabCapture.getMediaStreamId({targetTabId})`. No alternative MV3-compatible API exists for tab audio+video capture. |
| `offscreen` | Hosting `MediaRecorder` and the mp4 muxer in a DOM-bearing document. MV3 service workers cannot run DOM-dependent APIs (`MediaRecorder`, `Blob` URL playback, `URL.createObjectURL` lifecycle), so `chrome.offscreen` is the only MV3-compliant path. |
| `storage` | Three load-bearing uses, all `chrome.storage.local` and never transmitted: (a) recording-state persistence across MV3 service-worker eviction (the service worker can be torn down mid-recording and must rehydrate); (b) the in-extension health surface (`lastRecording` shown as ✓/⚠/✗ in the popup — see DEVOPS `monitoring-alerting.md`); (c) the opt-in local logger ring buffer (see DEVOPS `observability-design.md`). Also used to hand the recording payload from the offscreen document to the service worker for download. |
| `downloads` | Required for `chrome.downloads.download()`, which the service worker invokes to write the recorded mp4/WebM file to the user's chosen download location. Privacy posture is unaffected: `downloads` only writes user-initiated files locally and does not enable any network egress. |

### Explicitly rejected permissions

The following permissions were considered and explicitly **not** requested. Each rejection is part of the privacy posture and the <= 4 KPI cap.

| Permission | Why NOT requested |
|------------|-------------------|
| `activeTab` | `chrome.tabCapture.getMediaStreamId({targetTabId})` accepts an explicit tab ID, so the capture path does not depend on `activeTab`'s implicit grant model. |
| `tabs` | The extension has no need to read tab metadata (URL, title, favIconUrl). Reading such metadata would itself violate the zero-network / minimum-trust privacy posture. |

### Implementation status

The current `src/manifest.json` declares **6 permissions** (`activeTab`, `tabs`, `tabCapture`, `offscreen`, `downloads`, `storage`) and DOES NOT match this design. The CI permission-count gate added in the DEVOPS wave will fail until DELIVER reduces the manifest to the 4-permission list above. See `docs/feature/browser-tab-recorder/devops/upstream-changes.md` UC-1 for the audit and reduction plan. This design is now authoritative; the manifest is the artifact that must change, not this document.

### KPI mapping

| KPI (from `discuss/outcome-kpis.md`) | Target | This design |
|--------------------------------------|--------|-------------|
| Permissions requested | <= 4 | **4 of 4** — exactly at the cap, with each permission justified above and two additional permissions (`activeTab`, `tabs`) explicitly rejected. |

## File Structure

```
broshow/
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
