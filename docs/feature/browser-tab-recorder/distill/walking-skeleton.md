# Walking Skeleton: browser-tab-recorder

## Purpose

The walking skeleton proves the entire capture pipeline works end-to-end:
**Install → Click Start → Capture Tab → Click Stop → Download File**

It intentionally skips mp4 muxing (saves WebM) to isolate the core recording pipeline from format conversion.

## WS Strategy

**Strategy C — Real local.** Playwright launches a real Chromium with `--load-extension`, real `MediaRecorder`, real `chrome.storage.local`, real `chrome.downloads`. No costly externals. No containers. See `distill/wave-decisions.md` §1 for the full strategy decision and resource classification.

**Tagging convention**: walking-skeleton scenarios are tagged `@walking_skeleton @real-io` on their `test.describe` block. See `distill/wave-decisions.md` §1 for the tagging table.

## Skeleton Scope

| Component | Included | Notes |
|-----------|----------|-------|
| manifest.json | Yes | MV3, with permissions `tabCapture`, `offscreen`, `storage`, `downloads` (authoritative 4-of-4 against KPI cap of <= 4 — see `design/technology-stack.md` Permissions section, now authoritative; cap was raised from 3 to 4 on 2026-04-27 per `devops/upstream-changes.md` UC-1; reconciled per `distill/wave-decisions.md` R1) |
| Popup UI | Yes | Start/Stop button only, no status display |
| Service Worker | Yes | Orchestration, state management. Reads/writes `chrome.storage.local` for cross-context blob handoff and (post-DELIVER) for opt-in logger and `lastRecording`. |
| Offscreen Document | Yes | MediaRecorder only, no mp4 muxing |
| Mp4 muxing | No | Deferred to Milestone 2 |
| Recording indicator | No | Deferred to Milestone 3 |
| Audio capture | No | Deferred to Milestone 3 |
| Filename formatting | No | Deferred to Milestone 3 |
| Zero-network assertion | Yes | Every walking-skeleton scenario calls `attachNetworkRecorder` + `assertZeroExternalNetwork` from `tests/acceptance/fixtures/no-network.ts` (CI hard gate — DEVOPS D10) |

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
