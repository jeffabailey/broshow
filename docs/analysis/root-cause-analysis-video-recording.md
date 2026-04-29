# Root Cause Analysis: BroShow Video Recording Pipeline

**Date**: 2026-03-22
**Analyst**: Rex (RCA Specialist)
**Status**: Complete
**Prior Analysis**: `docs/analysis/recording-pipeline-rca.md` (partially addressed by uncommitted changes)

## Problem Statement

BroShow Chrome extension does not produce a working video recording. The goal is to record a browser tab and save as MP4. The pipeline involves: popup (user gesture + streamId) -> service worker (orchestration) -> offscreen document (MediaRecorder/WebCodecs capture) -> chrome.storage.local (data transfer) -> chrome.downloads (file save).

**Scope**: Full recording pipeline from Start click through file download. Includes both manual (web-ext) and automated (Playwright) environments.

**Environmental context**: Chrome MV3 extension with popup, background service worker, and offscreen document. Uses WebCodecs + mp4-muxer for MP4 output with MediaRecorder WebM fallback.

---

## Evidence Inventory

### Source Code State

The working tree has significant uncommitted changes relative to the last commit (`a85f3b8`). These changes represent fixes attempted for prior root causes. Key changes:

1. **Removed** the `waitForOffscreenReady` handshake in favor of passing `streamId` via URL query parameter to offscreen document
2. **Added** `broadcastState` to push state updates to popup after processing
3. **Changed** `createOffscreenDocument` to accept `streamId` parameter
4. **Replaced** `sendMessageToOffscreen(offscreen-start)` with auto-start from URL params in offscreen.ts
5. **Rewrote** `mp4.ts` from a post-processing wrapper to a real-time WebCodecs + mp4-muxer pipeline with MediaRecorder fallback
6. **Added** `blobToDataUrl` fallback path when `chrome.storage.local` is unavailable
7. **Made** `storeRecording` return `boolean` (success/failure) instead of void
8. **Added** `dataUrl` optional field to `offscreen-result` message for fallback transfer
9. **Added** error handling for missing storage data in `offscreen-result` handler

### Test State

- 75 unit tests: all pass
- Acceptance tests: the full pipeline test (`Start -> Record -> Stop -> Download produces an mp4 file`) is the one that fails
- Memory file documents 7 failed approaches to the recording pipeline

---

## Branch A: MediaStream Acquisition Fails in Offscreen Document

### WHY 1A: The offscreen document cannot obtain a valid tab capture stream
[Evidence: The `getUserMedia` call in offscreen.ts line 35 uses tab capture constraints with a streamId. When the streamId is empty or invalid, this call fails. The fallback chain (getDisplayMedia -> plain getUserMedia) produces either no stream or wrong-type stream (camera/mic instead of tab content).]

### WHY 2A: The streamId may be empty when it arrives at the offscreen document
[Evidence: popup.ts lines 44-52 -- `getStreamId()` wraps `chrome.tabCapture.getMediaStreamId()` in a try/catch that returns `''` on failure. The comment says "In test environments, tabCapture may not be available." In Playwright, the popup is opened via `context.newPage() + goto()`, not via browser action click.]

### WHY 3A: `chrome.tabCapture.getMediaStreamId()` requires a browser action popup context -- it must be called from a popup opened by clicking the extension's browser action icon, not from a page navigated to the popup URL
[Evidence: Chrome MV3 API documentation. walking-skeleton.spec.ts lines 273-277 open the popup via URL navigation. popup.ts line 47 calls `chrome.tabCapture.getMediaStreamId({ targetTabId })` which requires the browser action context.]

### WHY 4A: Playwright has no API to simulate clicking a browser action icon. The standard workaround (`context.newPage()` + `goto(chrome-extension://...)`) opens the popup as a regular page, which lacks the user gesture context required by tabCapture
[Evidence: walking-skeleton.spec.ts lines 273-277. This is a documented Playwright limitation for extension testing.]

### WHY 5A: The Chrome tabCapture API was designed for browser action popups as a security measure, and no test automation framework can bypass this restriction programmatically

**ROOT CAUSE A**: `chrome.tabCapture.getMediaStreamId` cannot be invoked from a Playwright-opened popup page. The streamId is always empty in automated tests, causing the entire tab capture pipeline to fall back to unreliable alternatives.

**Impact**: In automated testing, the extension always operates with `streamId: ''`. In manual use (clicking the extension icon), this path should work -- but it has never been verified end-to-end because the acceptance test cannot exercise it.

---

## Branch B: getDisplayMedia Fallback Fails in Offscreen Document Context

### WHY 1B: When getUserMedia with tab capture constraints fails (empty streamId), the code falls back to `navigator.mediaDevices.getDisplayMedia()` (offscreen.ts line 43)
[Evidence: offscreen.ts lines 39-47 -- the catch block attempts `getDisplayMedia({ video: true, audio: true })`]

### WHY 2B: `getDisplayMedia` requires a user gesture (user activation). The offscreen document is a headless context with no user interaction possible
[Evidence: Chrome specification requires transient activation for `getDisplayMedia`. Offscreen documents have no UI and therefore no user gesture context. The `--auto-select-desktop-capture-source` Chrome flag auto-selects the source but does NOT bypass the user gesture requirement.]

### WHY 3B: The third fallback (`getUserMedia({ video: true, audio: true })` at offscreen.ts line 49) captures the device camera/microphone, NOT the browser tab. With `--use-fake-device-for-media-stream` in tests, this produces synthetic frames -- but the content is not the tab
[Evidence: offscreen.ts line 49 -- plain getUserMedia. The Chrome flag `--use-fake-device-for-media-stream` provides fake camera/mic input. This may succeed but records fake content, not the actual tab.]

### WHY 4B: The fallback chain is designed to "get any stream" rather than "get the tab stream or fail clearly". This means when tab capture fails, the extension may silently record the wrong content
[Evidence: offscreen.ts lines 31-55 -- three nested try/catch blocks, each trying a different capture method with no validation that the stream is actually tab content]

### WHY 5B: There is no verification that the acquired stream actually contains tab content. The architecture treats all MediaStreams as equivalent regardless of source

**ROOT CAUSE B**: The stream acquisition fallback chain prioritizes getting *any* stream over getting the *correct* stream. When tab capture fails (which it always does in tests), the extension either fails entirely or silently records wrong content.

---

## Branch C: WebCodecs MP4 Pipeline Hangs on MediaStreamTrackProcessor

### WHY 1C: The WebCodecs pipeline (mp4.ts lines 17-156) uses `MediaStreamTrackProcessor` to read video and audio frames. The read loops (`while (true) { await reader.read() }`) run indefinitely until the track ends or the reader is cancelled
[Evidence: mp4.ts lines 97-114 (video processor loop) and lines 80-93 (audio processor loop). Both use `reader.read()` which blocks until a frame is available.]

### WHY 2C: When recording stops, the `stop()` method (mp4.ts line 117) cancels the readers first (`videoReader.cancel()`, `audioReader.cancel()`), then waits for processor loops to exit, then flushes encoders
[Evidence: mp4.ts lines 118-131 -- sequential cancel -> await processors -> flush encoders]

### WHY 3C: With fake media devices (`--use-fake-device-for-media-stream`), the `VideoEncoder` may never produce a `decoderConfig` in its output callback. The `hasDecoderConfig` flag (mp4.ts line 43) stays false. When `stop()` runs and `hasDecoderConfig` is false (line 140), it throws and falls back to WebM
[Evidence: mp4.ts lines 43-48 -- `output` callback only sets `hasDecoderConfig = true` when `meta?.decoderConfig` exists. Line 140: `if (!hasDecoderConfig) throw new Error('No decoderConfig from encoder')`]

### WHY 4C: The WebCodecs fallback path (mp4.ts line 152: `return webmFallback.stop()`) calls the MediaRecorder's stop, which relies on the MediaRecorder's `onstop` event to resolve. But by this point, the stream tracks may have already been affected by the reader cancellation
[Evidence: mp4.ts line 119 cancels `videoReader`, which may affect the underlying track. The MediaRecorder (created at mp4.ts line 205 via `createMediaRecorderSession`) is recording the same stream. If the stream's tracks become inactive, MediaRecorder's behavior is undefined.]

### WHY 5C: The WebCodecs pipeline and the MediaRecorder fallback both operate on the **same MediaStream simultaneously**. The MediaRecorder is started immediately (mp4.ts line 179: `recorder.start(1000)`) as a "safety net", while the WebCodecs pipeline also reads from the same tracks. When the WebCodecs pipeline cancels readers on stop, it may interfere with the MediaRecorder's access to the stream

**ROOT CAUSE C**: The dual-pipeline design (WebCodecs + MediaRecorder on the same stream) creates interference. Reader cancellation in the WebCodecs pipeline can disrupt the MediaRecorder fallback. Additionally, fake media devices in tests never produce `decoderConfig`, forcing every test run through the fallback path that may be corrupted by the primary pipeline's cleanup.

---

## Branch D: Offscreen Document Auto-Closes Before Data Is Stored

### WHY 1D: Chrome auto-closes offscreen documents when the reason for their existence is no longer active. The offscreen document is created with `USER_MEDIA` reason (background.ts line 24)
[Evidence: background.ts line 24: `reasons: [chrome.offscreen.Reason.USER_MEDIA, chrome.offscreen.Reason.DISPLAY_MEDIA, chrome.offscreen.Reason.BLOBS]`]

### WHY 2D: When recording stops, the session's `stop()` method eventually stops the media tracks (either via MediaRecorder.stop() ending the recording, or via WebCodecs reader cancellation). Once tracks end, Chrome detects that the `USER_MEDIA` reason is no longer valid
[Evidence: The `BLOBS` reason is also specified, but Chrome's auto-close behavior for `USER_MEDIA` may take precedence when tracks end.]

### WHY 3D: After `session.stop()` returns the blob, the offscreen document must still: (1) convert blob to data URL via FileReader (offscreen.ts lines 23-29), (2) write to chrome.storage.local (offscreen.ts line 60). Both are async operations that take time
[Evidence: offscreen-logic.ts lines 87-98 -- stop session -> storeRecording -> send message. The `storeRecording` call involves `blobToDataUrl` (FileReader async) then `chrome.storage.local.set` (async).]

### WHY 4D: If Chrome auto-closes the offscreen document between blob creation and storage completion, the `chrome.storage.local.set` call will fail or be interrupted. The data is lost.
[Evidence: offscreen.ts lines 57-65 -- the `storeRecording` function wraps storage in try/catch and returns false on failure. But if the document is terminated mid-execution, even the catch block may not run.]

### WHY 5D: The architecture places data post-processing (blob conversion + storage) in a context (offscreen document) whose lifecycle is tied to media track activity. The post-processing must outlive the tracks, but the document hosting it may not.

**ROOT CAUSE D**: The offscreen document lifecycle is coupled to media track lifecycle via the `USER_MEDIA` reason. Post-recording data processing needs to complete after tracks end, but Chrome may terminate the offscreen document before storage completes. The current fallback (sending dataUrl in the message) only works if the offscreen document survives long enough to complete `blobToDataUrl`.

---

## Branch E: Stop Message May Not Reach Offscreen Document (Fire-and-Forget)

### WHY 1E: The service worker sends `offscreen-stop` as fire-and-forget (background-logic.ts lines 179-183): `apis.sendMessageToOffscreen(result.offscreenMessage).catch(() => {})`
[Evidence: background-logic.ts lines 179-183 -- the stop message is sent with `.catch(() => {})` and the response is returned to popup immediately without waiting for the offscreen to acknowledge.]

### WHY 2E: The `sendMessageToOffscreen` uses `chrome.runtime.sendMessage` (background.ts line 37), which broadcasts to ALL extension contexts. The offscreen document's listener (offscreen.ts line 82) filters for `offscreen-stop` only, which is correct. But the SW's own listener (background.ts line 64) also receives this message
[Evidence: background.ts line 37: `sendMessageToOffscreen: (message: SWToOffscreen) => chrome.runtime.sendMessage(message)`. The SW handles all Message types in its listener at line 64.]

### WHY 3E: When the SW receives its own `offscreen-stop` (via broadcast), it processes it through the handler. In background-logic.ts lines 226-232, `offscreen-stop` falls through to the default case which returns `handleGetState(state)` -- a no-op. But this adds unnecessary processing and potential timing issues
[Evidence: background-logic.ts lines 226-232 -- the SW explicitly handles its own outbound message types as no-ops.]

### WHY 4E: More critically, `chrome.runtime.sendMessage` may fail silently if the offscreen document has already been auto-closed (Branch D). The fire-and-forget pattern means the SW never knows if the stop message was received
[Evidence: The `.catch(() => {})` at background-logic.ts line 181 swallows all errors including "Could not establish connection. Receiving end does not exist."]

### WHY 5E: There is no confirmation protocol for the stop command. The SW transitions to `processing` state optimistically and relies on the offscreen document to eventually send `offscreen-result` or `offscreen-error`. If neither arrives (because the offscreen doc is already gone), the extension gets stuck in `processing` state forever

**ROOT CAUSE E**: The stop command uses broadcast messaging with fire-and-forget semantics and no delivery confirmation. If the offscreen document is unavailable when the stop message is sent, the extension permanently stalls in `processing` state with no timeout or recovery mechanism.

---

## Branch F: No Timeout or Recovery for Processing State

### WHY 1F: When recording stops, the popup shows "Processing recording..." and disables the button. The popup waits for a `state-update` push from the SW (via `broadcastState`) to transition back to idle
[Evidence: popup-logic.ts lines 44-68 -- `processing` state sets `buttonDisabled: true`, `buttonAction: null`. The popup can only recover when it receives a `state-update` with `idle` status.]

### WHY 2F: The `broadcastState` call (background-logic.ts lines 197, 220) only fires after the SW completes its `offscreen-result` or `offscreen-error` handling. If neither message arrives from the offscreen document, `broadcastState` is never called
[Evidence: background-logic.ts lines 188-209 (offscreen-result handler) and lines 211-222 (offscreen-error handler) -- both call `apis.broadcastState(state)` only within their own handler paths.]

### WHY 3F: There is no timeout mechanism in either the popup or the SW. If the offscreen document dies silently (crashes, auto-closes, or never receives the stop message), the SW never transitions out of `processing` state
[Evidence: No setTimeout, no periodic state check, no heartbeat in any of the three components.]

### WHY 4F: The popup has `onMessage` listener (popup-logic.ts lines 155-157) that handles pushed state updates, but this listener only reacts to messages -- it cannot detect the *absence* of messages
[Evidence: popup-logic.ts lines 155-157 -- passive listener only.]

### WHY 5F: The system has no watchdog or dead letter detection. A broken offscreen document (from any of the causes in Branches A-E) results in permanent state lockup with no user-visible error and no recovery path

**ROOT CAUSE F**: No timeout, watchdog, or recovery mechanism exists for the processing state. The system relies on the offscreen document to always respond, but multiple failure paths (Branches A-E) can prevent that response, causing permanent UI lockup.

---

## Phase 3: Validation and Cross-Reference

### Backwards Chain Validation

| Root Cause | Forward Trace | Produces Observed Symptoms? |
|---|---|---|
| A: tabCapture unavailable in Playwright | streamId = '' -> tab capture constraints invalid -> getUserMedia fails -> enters fallback chain | YES: primary trigger for stream acquisition failure in tests |
| B: Fallback chain captures wrong content or fails | getDisplayMedia needs user gesture (fails in offscreen) -> plain getUserMedia captures camera not tab -> wrong content or error | YES: explains why even when a stream is obtained, it is not tab content |
| C: Dual pipeline interference | WebCodecs + MediaRecorder on same stream -> reader cancellation corrupts MediaRecorder -> fallback produces corrupt or empty blob | YES: explains why even successful recording produces bad output |
| D: Offscreen auto-close race | Tracks end -> Chrome terminates offscreen -> storage write incomplete -> data lost | YES: explains "Processing recording..." stuck state |
| E: Fire-and-forget stop with no confirmation | Stop message lost -> offscreen never stops -> never sends result -> SW stuck in processing | YES: explains permanent processing state |
| F: No processing timeout | No recovery from any failure -> permanent UI lockup | YES: explains why user sees "Processing recording..." forever |

### Cross-Validation

- **A + B are sequential**: A causes empty streamId, B means the fallback paths that result from empty streamId either fail or capture wrong content.
- **C is independent but reinforcing**: Even if a stream is obtained (via fallback), the dual-pipeline design can corrupt the output.
- **D + E are independent failure modes with same symptom**: Both can cause the processing state to become permanent, but through different mechanisms (data loss vs. message loss).
- **F amplifies all others**: Every other root cause results in permanent lockup because F means there is no recovery.
- **No contradictions**: All root causes can coexist and contribute independently to the overall failure.

### Manual Testing Failure Path

In manual testing (clicking the extension icon), Root Cause A does not apply (tabCapture should work). The likely failure path is:
- If tabCapture succeeds and streamId is valid: C (dual pipeline interference) or D (auto-close race) -> F (stuck in processing)
- If tabCapture fails for another reason: A -> B -> D or E -> F

---

## Phase 4: Solution Development

### Immediate Mitigations (unblock development)

| ID | Mitigation | Addresses Root Cause | Priority |
|---|---|---|---|
| M1 | Add a processing timeout (e.g., 30s) in the service worker that transitions state to idle and broadcasts an error if no offscreen-result/error arrives | F | P0 |
| M2 | Log the streamId value at every pipeline stage to identify where it becomes empty or invalid | A, B | P0 |
| M3 | When `storeRecording` fails and `blobToDataUrl` fallback also fails, send an explicit `offscreen-error` instead of silently dropping the data | D, E | P0 |

### Permanent Fixes (prevent recurrence)

| ID | Fix | Addresses Root Cause | Priority |
|---|---|---|---|
| P1 | **Separate WebCodecs and MediaRecorder into exclusive paths**: Do not run both simultaneously on the same stream. Check WebCodecs availability first, then choose one path. If WebCodecs fails during recording, the recording is lost (acceptable for MVP) rather than falling back to a corrupted MediaRecorder. | C | P1 |
| P2 | **Keep media tracks alive during post-processing**: After MediaRecorder/WebCodecs stops producing data, do NOT cancel readers or stop tracks until `chrome.storage.local.set` has completed. Sequence: stop encoder/recorder -> convert blob -> store in storage -> send result message -> THEN allow tracks to end (triggering offscreen auto-close). | D | P1 |
| P3 | **Add delivery confirmation for stop message**: After sending `offscreen-stop`, wait for an acknowledgment (the `offscreen-result` or `offscreen-error` response). If no response within timeout, retry the stop message or transition to error state. | E | P1 |
| P4 | **Add processing state timeout with error recovery**: Implement a 30-second timeout in the SW's processing state. On timeout, close the offscreen document, transition to idle, and broadcast an error to the popup. | F | P1 |
| P5 | **Validate stream source after acquisition**: After `getUserMedia` succeeds, check that the stream contains the expected tab capture track (e.g., check track label or settings for tab capture indicators). Reject streams from camera/mic fallback with a clear error rather than silently recording wrong content. | B | P2 |
| P6 | **Use `chrome.runtime.connect()` (long-lived port) for SW-offscreen communication**: Replace broadcast `sendMessage` with a dedicated port between SW and offscreen document. This eliminates message echo (SW receiving its own messages) and provides connection state (port disconnect = offscreen doc died). | E | P2 |
| P7 | **Redesign acceptance test for tabCapture limitation**: Accept that Playwright cannot test the real tabCapture flow. Either (a) use CDP `Target.activateTarget` to simulate browser action click, (b) mock streamId at the SW level and test the pipeline from offscreen-start onward, or (c) create a dedicated integration test that uses `--use-fake-device-for-media-stream` and validates the WebM fallback path only. | A | P2 |

### Early Detection Measures

| ID | Measure | Detects |
|---|---|---|
| D1 | Add console.log with timestamp at: popup getStreamId result, SW start-recording handler, offscreen auto-start, offscreen getUserMedia result, offscreen recorder created, offscreen stop received, offscreen blob size, offscreen storage result, SW offscreen-result received, SW download initiated | All timing-related failures |
| D2 | Add unit test that verifies WebCodecs session `stop()` does not interfere with a concurrent MediaRecorder on the same stream (if dual-pipeline is kept) | C regression |
| D3 | Add unit test that verifies `storeRecording` failure triggers the dataUrl fallback in the message | D regression |

---

## Phase 5: Summary of Findings

### Primary Failure Chains

**Chain 1: Stream Acquisition Failure (Tests)**
```
Playwright opens popup via URL (not browser action click)
  -> tabCapture.getMediaStreamId fails (no browser action context)
    -> streamId = '' (empty string)
      -> getUserMedia with tab constraints fails
        -> getDisplayMedia fails (no user gesture in offscreen)
          -> plain getUserMedia captures camera/mic (wrong content)
            -> OR: all fallbacks fail -> session is null
              -> offscreen-stop arrives, "No active recording session"
```

**Chain 2: Data Loss Race (Even When Recording Succeeds)**
```
Recording stops -> session.stop() completes -> blob created
  -> WebCodecs reader cancellation may corrupt MediaRecorder fallback
    -> blobToDataUrl conversion starts (async)
      -> RACE: Chrome detects tracks ended, auto-closes offscreen
        -> storage.set interrupted -> data lost
          -> SW reads null from storage
            -> "Recording data missing from storage" error
              -> OR: error not delivered -> stuck in processing forever
```

**Chain 3: Permanent State Lockup (Amplifier)**
```
Any failure in Chain 1 or Chain 2
  -> offscreen-result/offscreen-error never reaches SW
    -> No timeout exists
      -> SW stuck in 'processing' state permanently
        -> Popup shows "Processing recording..." forever
          -> User must reload extension to recover
```

### Root Causes Ranked by Impact

1. **F (Critical)**: No processing timeout -- amplifies every other failure into permanent lockup
2. **D (Critical)**: Offscreen auto-close race -- data loss even when recording succeeds
3. **C (High)**: Dual-pipeline interference -- WebCodecs cleanup corrupts MediaRecorder fallback
4. **E (High)**: Fire-and-forget stop with no confirmation -- silent message loss
5. **A (High, test-specific)**: tabCapture unavailable in Playwright -- blocks automated verification
6. **B (Medium)**: Fallback chain captures wrong content -- silent incorrect behavior

### Recommended Fix Order

1. **P4** (processing timeout) -- immediately prevents permanent lockup, makes all other failures recoverable
2. **P2** (keep tracks alive during post-processing) -- fixes the data loss race
3. **P1** (separate pipelines) -- eliminates dual-pipeline interference
4. **P3** (stop message confirmation) -- ensures reliable stop delivery
5. **P6** (long-lived port) -- eliminates broadcast messaging issues
6. **P5** (validate stream source) -- prevents silent wrong-content recording
7. **P7** (test architecture) -- enables automated verification of fixes

### Architectural Observation

The fundamental tension in this architecture is that Chrome MV3's offscreen document is designed to be ephemeral (Chrome controls its lifecycle), but the recording pipeline needs it to be persistent (data must survive until download). The `BLOBS` reason is intended to keep the document alive for blob processing, but it competes with `USER_MEDIA` auto-close behavior. A more robust architecture would either:

1. **Move data transfer out of the offscreen document entirely**: Stream encoded chunks to the SW via messages during recording (not after), so the offscreen document has nothing to preserve on stop.
2. **Use a different transfer mechanism**: Write chunks to IndexedDB or chrome.storage.local incrementally during recording, not as a single blob at the end.
3. **Separate recording from encoding**: The offscreen document only captures raw chunks. The SW (or a second offscreen document with `BLOBS` reason only) handles muxing and storage.
