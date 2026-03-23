# Root Cause Analysis: BroRecord Recording Pipeline Failure

**Date**: 2026-03-22
**Analyst**: Rex (RCA Specialist)
**Status**: Complete

## Problem Statement

BroRecord Chrome extension recording pipeline fails to produce a downloaded file when a user clicks Start then Stop. The pipeline involves popup -> service worker -> offscreen document -> MediaRecorder -> storage -> download. Manual testing shows "Processing recording..." stuck state. Automated Playwright tests show `offscreen-error: "No active recording session"` on stop. Unit tests (73) all pass; 4/5 acceptance tests pass; the full pipeline test fails.

**Scope**: The recording pipeline from Start click through to file download. Affected in both manual (web-ext) and automated (Playwright) environments.

---

## Branch A: Message Routing Collision -- Service Worker Receives Its Own Messages

### WHY 1A: Offscreen document receives `offscreen-start` but the recording session is not established by the time `offscreen-stop` arrives
[Evidence: Playwright logs show `offscreen-error: "No active recording session"` -- the `session` variable in offscreen-logic.ts is null when stop is called]

### WHY 2A: The `offscreen-start` message handling in offscreen.ts is fire-and-forget (returns `false` from the listener, line 108), while the stream acquisition is async and may still be in progress
[Evidence: offscreen.ts lines 100-108 -- `handleMessage(message)` is called but the result is not awaited before the listener returns `false`. The start handler in offscreen-logic.ts (line 65-75) calls `acquireStream` which calls `getUserMedia` -- an async operation that may take hundreds of milliseconds]

### WHY 3A: The service worker sends `offscreen-start` via `chrome.runtime.sendMessage` (background.ts line 37), which is a broadcast to ALL extension contexts. The service worker's own `onMessage` listener (background.ts line 58) also receives this message.
[Evidence: background.ts line 36-37: `sendMessageToOffscreen: (message: SWToOffscreen) => chrome.runtime.sendMessage(message)` -- this uses `chrome.runtime.sendMessage`, NOT a targeted send to the offscreen document. The SW message listener at line 58 handles ALL `Message` types including `offscreen-start` and `offscreen-stop`.]

### WHY 4A: `chrome.runtime.sendMessage` broadcasts to all listeners in the extension. When the SW sends `offscreen-start`, both the offscreen document AND the SW itself receive it. The SW's handler (background-logic.ts lines 209-214) handles `offscreen-start` by returning `handleGetState(state)` -- a no-op. BUT crucially, when the SW later sends `offscreen-stop`, the SW also receives it in its own listener.
[Evidence: background-logic.ts lines 208-214 show the SW explicitly handles `offscreen-start` and `offscreen-stop` message types -- these are messages the SW sends, not receives, but the broadcast means it gets them back. The SW handler is a no-op for these, but the issue is deeper: when `sendMessageToOffscreen` fires `offscreen-stop`, both the SW and offscreen doc race to handle it.]

### WHY 5A: **ROOT CAUSE A -- `chrome.runtime.sendMessage` is used where `chrome.runtime.sendMessage` with explicit targeting or a dedicated communication channel should be used.** The broadcast nature of `sendMessage` causes every message to be received by all contexts (popup, SW, offscreen). This creates race conditions and message echo effects. The offscreen document's listener filters for only `offscreen-start`/`offscreen-stop` (offscreen.ts line 78), but the SW's listener does NOT filter -- it processes ALL message types.
[Evidence: background.ts line 58 registers a listener for `Message` (the union of ALL message types). When the offscreen doc sends `offscreen-result` or `offscreen-error`, the SW correctly handles these. But when the SW sends `offscreen-start`/`offscreen-stop`, the SW also receives them and processes them through its handler.]

**ROOT CAUSE A**: The extension uses `chrome.runtime.sendMessage` (broadcast) for all inter-context communication without adequate message routing. This is architecturally incorrect for MV3 extensions where multiple contexts (popup, SW, offscreen) share the same message bus.

---

## Branch B: Race Condition Between Offscreen Document Creation and Message Delivery

### WHY 1B: The offscreen document does not reliably receive the `offscreen-start` message
[Evidence: The offscreen.ts self-start mechanism (lines 120-143) exists specifically as a workaround for this, with retry logic (5 attempts, 500ms delay). This is defensive code acknowledging the race condition.]

### WHY 2B: The service worker calls `createOffscreenDocument()` then immediately calls `sendMessageToOffscreen()` (background-logic.ts lines 160-161). The offscreen document's `<script type="module">` must load and execute before its `chrome.runtime.onMessage` listener is registered.
[Evidence: background-logic.ts lines 159-161:
```
await apis.createOffscreenDocument();
await apis.sendMessageToOffscreen(result.offscreenMessage);
```
The `createOffscreenDocument` resolves when Chrome creates the document, but NOT when the module script has finished executing. offscreen.html loads `offscreen.js` as `type="module"` (line 8), which is loaded asynchronously.]

### WHY 3B: There is no handshake protocol between the SW and offscreen document. The SW fires the start message hoping it arrives after the listener is ready. The self-start retry mechanism (offscreen.ts lines 120-143) is a band-aid that queries SW state and self-starts with an empty streamId.
[Evidence: The self-start uses `streamId: ''` (offscreen.ts line 127), which means tab capture constraints will be invalid, forcing fallback through getUserMedia chains that may fail in the offscreen context.]

### WHY 4B: The Chrome offscreen document API does not provide a "ready" callback. The `chrome.offscreen.createDocument()` promise resolves before the document's scripts are fully loaded and executed.
[Evidence: This is a documented Chrome MV3 limitation. The self-start retry pattern confirms the developers are aware of the race.]

### WHY 5B: **ROOT CAUSE B -- No reliable handshake between SW and offscreen document.** The SW cannot know when the offscreen doc's listener is ready. The self-start workaround uses an empty streamId, degrading the capture to fallback paths that fail.

**ROOT CAUSE B**: Missing document-ready handshake protocol. The offscreen document needs to signal readiness to the SW, which should only then send the `offscreen-start` message with the valid streamId.

---

## Branch C: Stream Acquisition Fails in Offscreen Document with Empty/Invalid streamId

### WHY 1C: getUserMedia fails when called with empty streamId in tab capture constraints
[Evidence: offscreen-logic.ts lines 13-19 builds constraints with `chromeMediaSourceId: streamId`. When streamId is `''`, Chrome rejects the constraint. The fallback chain in offscreen.ts lines 31-53 tries getDisplayMedia then plain getUserMedia.]

### WHY 2C: In Playwright test environment, `chrome.tabCapture.getMediaStreamId` is not available when the popup is opened via URL navigation rather than browser action click
[Evidence: popup.ts lines 44-52 -- the catch block returns `''` when tabCapture fails. The comment says "In test environments, tabCapture may not be available."]

### WHY 3C: `getDisplayMedia` fallback (offscreen.ts line 42) requires user gesture in the offscreen document context, which does not exist. The offscreen document is headless -- no user interaction possible.
[Evidence: Chrome MV3 offscreen documents with USER_MEDIA reason can call getUserMedia but getDisplayMedia requires a user gesture that cannot be provided in an offscreen context.]

### WHY 4C: The plain getUserMedia fallback (offscreen.ts line 49) with `{ video: true, audio: true }` captures the device camera/microphone, NOT the tab content. In Playwright with `--use-fake-device-for-media-stream`, this succeeds but produces fake media, not tab content.
[Evidence: offscreen.ts line 49 -- `navigator.mediaDevices.getUserMedia({ video: true, audio: true })` -- this is a webcam/mic capture, not a tab capture. The test flag `--use-fake-device-for-media-stream` provides synthetic frames.]

### WHY 5C: **ROOT CAUSE C -- The streamId is lost in the pipeline.** The popup obtains a valid streamId, sends it to the SW, the SW passes it to offscreen-start, BUT: (1) the offscreen-start message may not arrive (Branch B race condition), and (2) the self-start fallback uses `streamId: ''`. The entire tab-capture pipeline depends on a valid streamId propagated from popup through to getUserMedia, but multiple failure paths discard or empty it.

**ROOT CAUSE C**: streamId propagation is fragile with multiple points of loss, and fallback paths that bypass tab capture entirely produce either no stream or wrong-type streams.

---

## Branch D: Offscreen Document Auto-Closes Before Download Completes

### WHY 1D: Chrome auto-closes the offscreen document when media tracks stop
[Evidence: offscreen.ts comment at line 96-98: "Chrome will auto-close the offscreen document when USER_MEDIA has no active tracks." The manifest lists `USER_MEDIA` as an offscreen reason (background.ts line 23).]

### WHY 2D: When MediaRecorder.stop() is called (mp4.ts line 64), the media tracks end. The `session.stop()` in offscreen-logic.ts line 85 triggers this. After stop, the code calls `apis.storeRecording(recordingBlob)` (line 86), which converts blob to data URL and stores in chrome.storage.local.
[Evidence: The offscreen-logic.ts stop handler (lines 84-89) is: stop recorder -> store recording -> send result message. All of this must complete before Chrome auto-closes the document.]

### WHY 3D: The `blobToDataUrl` function (offscreen.ts lines 22-28) uses FileReader which is async. If the blob is large (multi-second recording), this conversion takes time. Chrome may close the offscreen document during this conversion.
[Evidence: The offscreen.ts listener returns `true` for offscreen-stop (line 97) to keep the message channel open. However, Chrome's auto-close on USER_MEDIA track end is independent of the message channel.]

### WHY 4D: The manifest specifies `USER_MEDIA` as the primary reason (background.ts line 23). Chrome monitors active tracks for documents with this reason and auto-closes when tracks end. Adding `BLOBS` reason (also present) is not sufficient to prevent auto-close once `USER_MEDIA` tracks end.
[Evidence: background.ts line 23 uses array `[chrome.offscreen.Reason.USER_MEDIA, chrome.offscreen.Reason.DISPLAY_MEDIA, chrome.offscreen.Reason.BLOBS]`. Chrome's behavior is to auto-close when the primary use case (USER_MEDIA) no longer has active tracks.]

### WHY 5D: **ROOT CAUSE D -- Data conversion and storage race against Chrome's auto-close behavior.** The offscreen document must complete blob-to-dataURL conversion and chrome.storage.local.set BEFORE Chrome detects that media tracks have ended and auto-closes the document. This is a race with no guaranteed winner.

**ROOT CAUSE D**: The offscreen document lifecycle is tied to media track lifecycle, but post-recording processing (blob conversion, storage) needs to outlive the tracks. The architecture places processing in a context that Chrome can terminate at any time after recording stops.

---

## Branch E: Duplicate Message Processing and Response Routing

### WHY 1E: The SW's onMessage handler processes messages from all senders without distinguishing source
[Evidence: background.ts lines 58-76 -- the listener receives `message: Message` but ignores `_sender`. It processes every message type including `offscreen-start`, `offscreen-stop`, `state-update`, `error`, `fallback-notice` (background-logic.ts lines 208-214).]

### WHY 2E: When the offscreen document sends `offscreen-result` (on successful recording), this goes to ALL listeners. The SW handles it (background-logic.ts lines 180-195) -- this is correct. But the popup's listener may also intercept it if the popup is still open.
[Evidence: The popup uses `chrome.runtime.sendMessage` (popup.ts line 18) and awaits a response. If the popup is still open when offscreen-result arrives, the popup's pending sendMessage promise may resolve with unexpected data, or the message may interfere.]

### WHY 3E: More critically, the `sendResponse` callback in the SW (background.ts line 64) sends the response back to the message SENDER. When the offscreen doc sends `offscreen-result`, the response goes back to the offscreen doc -- but the offscreen doc may already be closing (Branch D). The SW proceeds to call `downloadFile` regardless, but the response is lost.
[Evidence: background-logic.ts lines 186-194: the SW reads storage, downloads file, clears storage, closes offscreen doc. But `apis.downloadFile(dataUrl, filename)` (line 189) calls `chrome.downloads.download({ url, filename })` (background.ts line 41). If `dataUrl` is null (storage write didn't complete before auto-close), the download silently fails.]

### WHY 4E: The `getRecordingData` call (background-logic.ts line 186) reads from chrome.storage.local. If the offscreen document was auto-closed BEFORE `storeRecording` completed (Branch D race), the data is not in storage. The code checks `if (dataUrl)` (line 187) and silently skips the download.
[Evidence: background-logic.ts lines 186-191 -- `const dataUrl = await apis.getRecordingData(); if (dataUrl) { ... }` -- no error is logged or reported when dataUrl is null. The user sees "Processing recording..." stuck because the state transitions to idle but no download occurs and no error reaches the popup.]

### WHY 5E: **ROOT CAUSE E -- Silent failure when recording data is missing from storage.** The download path has no error reporting for the case where `getRecordingData()` returns null. The state transitions to idle, the offscreen doc is closed, but no file is downloaded and no error reaches the user.

**ROOT CAUSE E**: The download handler silently succeeds (transitions to idle) even when no recording data exists in storage. No feedback loop tells the user that the recording was lost.

---

## Branch F: Playwright Test Environment Cannot Trigger tabCapture

### WHY 1F: In Playwright, the popup is opened via URL navigation (`popupPage.goto(chrome-extension://...popup.html)`) rather than by clicking the browser action icon
[Evidence: walking-skeleton.spec.ts lines 273-277 -- `const popupPage = await context.newPage(); await popupPage.goto(...)` -- this opens the popup as a regular page, not as a browser action popup.]

### WHY 2F: `chrome.tabCapture.getMediaStreamId` requires the call to originate from a browser action popup context. When called from a regular page context, it fails.
[Evidence: popup.ts lines 44-52 -- the try/catch around `getMediaStreamId` silently returns `''` on failure. Chrome's tabCapture API documentation requires the call to be made from an "action popup" context for MV3.]

### WHY 3F: Playwright does not expose an API to simulate clicking a browser action icon. There is no `page.clickBrowserAction()`. The test resorts to URL navigation as a workaround.
[Evidence: walking-skeleton.spec.ts uses `context.newPage()` + `goto()`. This is the standard Playwright workaround for extension testing, documented in Playwright docs.]

### WHY 4F: The `--auto-select-tab-capture-source-by-title` Chrome flag helps with the tab capture permission prompt, but does NOT solve the API context requirement. tabCapture.getMediaStreamId still requires the browser action popup context.
[Evidence: walking-skeleton.spec.ts line 53 passes this flag, but streamId is still empty in tests because the API context is wrong.]

### WHY 5F: **ROOT CAUSE F -- Fundamental test environment limitation.** Playwright cannot invoke `chrome.tabCapture.getMediaStreamId` because it cannot open the popup via browser action click. This means the full pipeline test can NEVER get a valid streamId in the current test architecture.

**ROOT CAUSE F**: The acceptance test architecture cannot test the real tabCapture flow. The test always operates with an empty streamId, falling through to fallback capture paths that are unreliable in an offscreen document.

---

## Phase 3: Validation and Cross-Reference

### Backwards Chain Validation

| Root Cause | Forward Trace | Produces Observed Symptoms? |
|---|---|---|
| A: Broadcast messaging | SW receives its own offscreen-start/stop -> no direct harm (no-op handler) but adds latency and confusion in message ordering | Contributes to timing issues, not primary cause of "no download" |
| B: No SW-offscreen handshake | offscreen-start arrives before listener ready -> message lost -> self-start with empty streamId | YES: explains why offscreen has no session when stop arrives |
| C: streamId lost in pipeline | Empty streamId -> getUserMedia fails with tab constraints -> fallback chain fails in offscreen context | YES: explains "No active recording session" error |
| D: Auto-close race | Offscreen doc closes before blob stored -> storage empty | YES: explains "Processing recording..." stuck and no download |
| E: Silent failure on missing data | SW downloads nothing, reports no error, transitions to idle | YES: explains stuck "Processing recording..." -- popup never gets error or completion |
| F: Playwright cannot use tabCapture | Test always has empty streamId | YES: explains why acceptance test always fails on full pipeline |

### Cross-Validation

- Root Causes B + C are reinforcing: B causes the streamId to be lost (self-start uses empty), C means empty streamId causes stream acquisition failure.
- Root Causes D + E are reinforcing: D causes data to be missing, E silently swallows the failure.
- Root Cause A is a contributing factor that increases fragility but is not directly causal on its own.
- Root Cause F is test-specific and explains why automated tests always fail, but does not explain the manual testing failure (manual testing has a different path).
- All symptoms collectively explained: YES.

### Manual Testing Failure Path (web-ext / npm start)

The manual path may get a valid streamId from tabCapture (if popup opens as browser action). The likely failure path for manual testing is: B (race condition) -> self-start with empty streamId -> C (stream fails) OR D (auto-close) -> E (silent failure) -> user sees "Processing recording..." stuck.

---

## Phase 4: Solution Development

### Immediate Mitigations (restore service / unblock development)

| ID | Mitigation | Addresses |
|---|---|---|
| M1 | Add error logging/reporting when `getRecordingData()` returns null in the SW's offscreen-result handler | Root Cause E |
| M2 | Add a timeout in the popup that detects stuck "Processing recording..." state and reports an error | Root Cause E |
| M3 | In offscreen stop handler, stop media tracks AFTER blob conversion and storage are complete (not in `finally` which runs alongside auto-close) | Root Cause D |

### Permanent Fixes (prevent recurrence)

| ID | Fix | Addresses | Priority |
|---|---|---|---|
| P1 | **Implement offscreen-ready handshake**: Offscreen doc sends `offscreen-ready` message after listener registration. SW waits for this before sending `offscreen-start`. Remove self-start workaround. | Root Cause B | P1 |
| P2 | **Preserve streamId through the ready handshake**: SW stores the streamId when start-recording arrives, sends it in offscreen-start only after offscreen-ready is received. Removes the need for self-start with empty streamId. | Root Cause C | P1 |
| P3 | **Separate media track lifecycle from processing**: Stop media tracks only AFTER blob has been stored in chrome.storage.local. Alternatively, perform blob-to-dataURL conversion synchronously with the stop, or keep tracks alive with a dummy track until processing is done. | Root Cause D | P1 |
| P4 | **Add explicit error path for missing recording data**: When `getRecordingData()` returns null after offscreen-result, send an error response to popup instead of silently succeeding. Log a warning. | Root Cause E | P1 |
| P5 | **Filter messages by sender in SW listener**: Check `sender.url` or message type prefixing to avoid processing broadcast echoes. Or use `chrome.runtime.connect()` (long-lived port) for SW-offscreen communication instead of `sendMessage`. | Root Cause A | P2 |
| P6 | **Redesign acceptance test for tabCapture**: Either (a) use CDP to programmatically click the browser action, or (b) mock the streamId at the SW level for acceptance tests, or (c) accept that the full e2e test requires manual interaction and mark it as such. | Root Cause F | P2 |

### Early Detection Measures

| ID | Measure | Detects |
|---|---|---|
| D1 | Add integration test that verifies offscreen-ready handshake completes within timeout | Root Cause B regression |
| D2 | Add assertion in offscreen stop handler that `session !== null` with descriptive error | Root Cause C -- empty streamId causing no session |
| D3 | Add telemetry/console logging at each pipeline stage with timestamps | All timing-related root causes |

---

## Phase 5: Summary of Findings

### Primary Failure Chain (explains both manual and automated failures)

```
Popup gets streamId (valid or empty)
  -> SW creates offscreen doc
    -> SW immediately sends offscreen-start (RACE: doc not ready)
      -> Message lost OR self-start with empty streamId
        -> getUserMedia fails with invalid constraints
          -> Fallback chain fails in offscreen context
            -> session remains null
              -> offscreen-stop arrives, session is null
                -> "No active recording session" error
                  -> OR: if session was created, auto-close kills offscreen before storage completes
                    -> SW reads null from storage
                      -> Silent no-op, no download, no error to user
                        -> "Processing recording..." stuck forever
```

### Root Causes Ranked by Impact

1. **B + C (Critical)**: Race condition + streamId loss -- these together prevent recording from ever starting successfully.
2. **D (Critical)**: Auto-close race -- even if recording starts, data may be lost before download.
3. **E (High)**: Silent failure -- masks all other failures, making debugging very difficult.
4. **A (Medium)**: Broadcast messaging -- adds fragility, not directly causal.
5. **F (Medium, test-only)**: Playwright limitation -- blocks automated verification of fixes.

### Recommended Fix Order

1. P1 + P2 (handshake + streamId preservation) -- fixes the primary failure
2. P3 (media track lifecycle separation) -- fixes the secondary failure
3. P4 (error reporting) -- makes failures visible
4. P5 (message routing) -- reduces fragility
5. P6 (test architecture) -- enables automated verification
