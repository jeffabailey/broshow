# Walking Skeleton: browser-tab-recorder

## Purpose

The walking skeleton proves the entire capture pipeline works end-to-end:
**Install → Click Start → Capture Tab → Click Stop → Download File**

It intentionally skips mp4 muxing (saves WebM) to isolate the core recording pipeline from format conversion.

## Skeleton Scope

| Component | Included | Notes |
|-----------|----------|-------|
| manifest.json | Yes | MV3, tabCapture + offscreen permissions |
| Popup UI | Yes | Start/Stop button only, no status display |
| Service Worker | Yes | Orchestration, state management |
| Offscreen Document | Yes | MediaRecorder only, no mp4 muxing |
| Mp4 muxing | No | Deferred to Milestone 2 |
| Recording indicator | No | Deferred to Milestone 3 |
| Audio capture | No | Deferred to Milestone 3 |
| Filename formatting | No | Deferred to Milestone 3 |

## Acceptance Test

`walking-skeleton.spec.ts` — a single end-to-end test that:
1. Loads the extension in a Chromium browser via Playwright
2. Opens a test page with known content
3. Clicks the extension popup's Start button
4. Grants tab capture permission
5. Waits a few seconds
6. Clicks Stop
7. Verifies a file was downloaded
8. Verifies the downloaded file is a valid video (WebM at this stage)

## Implementation Order

1. `manifest.json` — make the extension loadable
2. `popup.html` + `popup.ts` — render Start/Stop, send messages
3. `background.ts` — handle messages, call tabCapture, manage offscreen
4. `offscreen.html` + `offscreen.ts` — MediaRecorder, collect chunks, return blob
5. Wire download — service worker triggers `chrome.downloads.download()`

## Success Criteria

- [ ] Extension loads without errors in Chromium
- [ ] Clicking Start → granting permission → clicking Stop produces a downloaded file
- [ ] Downloaded file is a valid video container (WebM)
- [ ] Walking skeleton acceptance test passes
