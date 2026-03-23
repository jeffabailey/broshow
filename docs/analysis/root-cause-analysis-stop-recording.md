# Root Cause Analysis: "Stop Recording Does Nothing -- No File Downloaded"

**Date**: 2026-03-22
**Investigator**: Rex (RCA Specialist)
**Methodology**: Toyota 5 Whys with multi-causal branching

---

## Problem Statement

After clicking "Stop Recording" in the BroRecord Chrome MV3 extension, no file is downloaded. The UI either stays in "Processing..." state indefinitely or returns to idle ("Ready to record") without producing a download.

**Scope**: Stop-recording flow from popup click through offscreen document processing to `chrome.downloads.download()` call. Excludes start-recording flow (verified working).

**Impact**: Complete feature failure -- the recording pipeline cannot produce output.

---

## Message Flow Trace (Reference)

```
Popup                    Service Worker              Offscreen Doc
  |                           |                          |
  |--stop-recording---------->|  (broadcast)             |
  |  (also hits offscreen,    |                          |
  |   but offscreen ignores)  |                          |
  |                           |--offscreen-stop---------->|  (broadcast)
  |                           |  (SW also receives own    |
  |                           |   broadcast -- ignored)   |
  |<--state:processing--------|                          |
  |                           |                          |--session.stop()
  |                           |                          |--storeRecording()
  |                           |                          |--sendMessage(offscreen-result)
  |                           |<--offscreen-result--------|  (broadcast)
  |                           |--downloadFile()          |
  |                           |--broadcastState(idle)    |
  |<--state:idle--------------|                          |
```

---

## Branch A: WebCodecs Pipeline Failure (No decoderConfig)

### WHY 1A: No file is downloaded after Stop Recording
**Evidence**: `mp4.ts` line 138 throws `'No decoderConfig from encoder'` when `hasDecoderConfig` is false. The offscreen catches this (offscreen-logic.ts L99-103) and sends `offscreen-error` instead of `offscreen-result`. The SW transitions to idle without downloading. Popup shows "Ready to record" with no error visible unless the error message propagates.

### WHY 2A: `hasDecoderConfig` is false at stop time
**Evidence**: `mp4.ts` line 46: `hasDecoderConfig` is only set to `true` when the VideoEncoder's `output` callback receives a chunk with `meta?.decoderConfig`. This metadata is provided by the encoder on the first keyframe output.

### WHY 3A: The VideoEncoder never outputs a chunk with decoderConfig
**Evidence**: The encoder is configured at line 52-58 and starts processing frames via `MediaStreamTrackProcessor` readable stream at line 95-112. The `output` callback at line 45-48 checks `meta?.decoderConfig`. If:
- The stream has no video frames (fake device, capture failure), or
- The recording is very short (Stop clicked before first keyframe encodes), or
- The encoder errors before producing output,

then `hasDecoderConfig` remains false.

### WHY 4A: No guard against short recordings or encoder warm-up time
**Evidence**: The code calls `videoEncoder.configure()` at line 52 and immediately starts reading frames. But `configure()` is asynchronous in the encoder pipeline -- the first `encode()` call queues a frame but the `output` callback fires later. If `stop()` is called before the first output arrives, the encoder is flushed (line 126) but the flush may produce nothing if the encoder never received a complete frame.

### WHY 5A: No minimum recording duration or encoder-ready check before allowing stop
**Evidence**: The recording session has no concept of "encoder is producing output." The user can click Stop immediately after Start. The stop sequence cancels readers, awaits processor loops, flushes encoders, and checks `hasDecoderConfig` -- but by then it is too late.

**ROOT CAUSE A**: The WebCodecs pipeline has no readiness gate. If Stop is called before the VideoEncoder emits its first chunk with `decoderConfig`, the recording fails with an error that produces no download. The user sees the UI return to idle with no file.

**SOLUTION A**:
- **Immediate mitigation**: Catch the `'No decoderConfig from encoder'` error and fall back to MediaRecorder's WebM chunks if any data was captured.
- **Permanent fix**: Track encoder readiness (first decoderConfig received). Do not allow stop until encoder has produced at least one output chunk, or implement a minimum recording duration of ~1 second.

---

## Branch B: Offscreen Document Auto-Close Race

### WHY 1B: No file is downloaded; offscreen processing may not complete
**Evidence**: Memory file (`project_recording_pipeline_debug.md`) documents: "Blob URLs get invalidated when Chrome auto-closes the offscreen doc (USER_MEDIA reason expires when tracks stop)." The offscreen document is created with reasons `USER_MEDIA`, `DISPLAY_MEDIA`, `BLOBS` (background.ts L24).

### WHY 2B: Chrome auto-closes the offscreen document during stop processing
**Evidence**: When `videoReader.cancel()` and `audioReader.cancel()` are called (mp4.ts L117-118), the MediaStream tracks may become inactive. Chrome monitors the `USER_MEDIA` reason and may close the document when it determines media is no longer being used. The `BLOBS` reason was added to extend the document's lifetime, but Chrome's heuristics are not fully documented.

### WHY 3B: The stop sequence has a window between track cancellation and storage write where the document is vulnerable
**Evidence**: The stop sequence in mp4.ts L115-152:
1. Cancel readers (tracks may go inactive) -- **vulnerability window opens**
2. Wait for processor loops
3. Flush encoders
4. Finalize muxer, create blob
5. Return blob to offscreen-logic.ts
6. `storeRecording(blob)` converts to dataUrl and writes to `chrome.storage.local`
7. `sendMessage(resultMsg)` broadcasts result

Steps 2-7 involve async operations (encoder flush, FileReader, storage write, message send). If Chrome closes the document during any of these steps, the operation fails silently or throws.

### WHY 4B: The code relies on Chrome keeping the offscreen document alive during async post-recording operations
**Evidence**: The `BLOBS` reason was added specifically to address this (background.ts L24 comment: "Recording tab audio/video and converting blob to data URL"). However, Chrome's documentation states that reasons are hints, not guarantees. The `BLOBS` reason is intended for active Blob URL usage, not for general async work.

### WHY 5B: No mechanism to ensure offscreen document survives the entire stop-process-store-send pipeline
**Evidence**: The architecture depends on the offscreen document staying alive long enough to: stop encoding, create a blob, convert to dataUrl (FileReader -- async), write to chrome.storage.local (async), and send a message (async). There is no keepalive mechanism, no chunked processing, and no checkpoint that persists partial progress.

**ROOT CAUSE B**: The offscreen document's lifetime is not guaranteed across the async stop pipeline. Chrome may auto-close it after media tracks go inactive, before the blob is stored and result message is sent. When this happens, the SW never receives `offscreen-result` or `offscreen-error`, and the processing timeout (30s) eventually recovers the UI to idle -- but no download occurs.

**SOLUTION B**:
- **Immediate mitigation**: The 30s processing timeout (already implemented) provides recovery. Add user-visible error message when timeout fires ("Recording may have been lost").
- **Permanent fix**: Store recording data to `chrome.storage.local` BEFORE stopping media tracks. Alternatively, use a `chrome.runtime.Port` (long-lived connection) between SW and offscreen, which Chrome respects for document lifetime. Or move the blob-to-dataUrl conversion and storage write to happen before canceling the stream readers.

---

## Branch C: Duplicate and Self-Received Broadcast Messages

### WHY 1C: Message delivery is unreliable between SW and offscreen
**Evidence**: All inter-context communication uses `chrome.runtime.sendMessage` (broadcast). In background.ts:
- `sendMessageToOffscreen` (L36-37): `chrome.runtime.sendMessage(message)` -- broadcasts `offscreen-stop` to ALL contexts
- `broadcastState` (L51-55): `chrome.runtime.sendMessage(...)` -- broadcasts state to ALL contexts

In offscreen.ts:
- `sendMessage` (L54-55): `chrome.runtime.sendMessage(message)` -- broadcasts `offscreen-result` to ALL contexts

### WHY 2C: The SW receives its own broadcast messages
**Evidence**: In Chrome MV3, the service worker's `onMessage` listener fires for `chrome.runtime.sendMessage` calls from the same service worker. The code handles this with explicit ignore cases at background-logic.ts L257-263 (`offscreen-stop`, `offscreen-start`, `state-update`, `error`, `fallback-notice`, `offscreen-ready`).

### WHY 3C: The SW processes broadcasts from the offscreen, but also the sendResponse callback creates redundant delivery
**Evidence**: When the offscreen receives `offscreen-stop`:
1. It processes the stop and calls `apis.sendMessage(resultMsg)` (offscreen-logic.ts L97) -- broadcasts `offscreen-result`
2. It calls `sendResponse(result)` (offscreen.ts L77) -- sends the same data as a response to the SW's `sendMessageToOffscreen` call

The SW receives `offscreen-result` via broadcast at its `onMessage` listener (path 1). The SW's `sendMessageToOffscreen` promise resolves with the `sendResponse` value (path 2), but this is fire-and-forget (`.catch(() => {})`), so the response is discarded.

This means path 1 is the ONLY path that delivers the result to the SW's handler logic. If path 1 fails (message not delivered, or offscreen document closed before `sendMessage` completes), no download occurs.

### WHY 4C: Broadcast-based messaging has no delivery guarantee
**Evidence**: `chrome.runtime.sendMessage` is fire-and-forget. If no listener is ready (e.g., SW is restarting, offscreen is closing), the message is lost. There is no retry, no acknowledgment, no queue. The `sendResponse` path (path 2) is the only path with a delivery guarantee (Chrome keeps the channel open when the listener returns `true`), but the SW discards this response.

### WHY 5C: The architecture chose broadcast messaging over targeted/port-based messaging
**Evidence**: `chrome.runtime.sendMessage` is simpler than `chrome.runtime.connect` (ports) but provides no delivery guarantees. The fire-and-forget pattern for `sendMessageToOffscreen` (background-logic.ts L208-211) explicitly discards the response that would confirm delivery.

**ROOT CAUSE C**: The `offscreen-result` message from offscreen to SW relies on broadcast delivery (`chrome.runtime.sendMessage`) which has no delivery guarantee. The `sendResponse` callback -- which Chrome DOES guarantee delivery for -- is discarded by the fire-and-forget pattern. If the broadcast fails (offscreen closing, SW restarting), the download never triggers.

**SOLUTION C**:
- **Immediate mitigation**: Instead of fire-and-forget, await the `sendMessageToOffscreen` response and use the `sendResponse` value as the primary result delivery path.
- **Permanent fix**: Use `chrome.runtime.connect` (ports) for the SW-offscreen communication channel. Ports provide bidirectional, reliable messaging with connection-state awareness.

---

## Branch D: MediaRecorder onstop Event May Not Fire

### WHY 1D: The stop flow hangs when using the MediaRecorder fallback path
**Evidence**: mp4.ts L179-193 -- MediaRecorder's `stop()` returns a Promise that resolves only when `recorder.onstop` fires. If `onstop` never fires, the Promise never resolves, `handleStop()` in offscreen-logic.ts hangs, no result/error is sent, and the SW stays in `processing` state until the 30s timeout.

### WHY 2D: `recorder.onstop` may not fire if the stream is already ended
**Evidence**: If the MediaStream's tracks have been stopped or ended before `recorder.stop()` is called, Chrome may not fire the `onstop` event. The code does not check `recorder.state` before calling `stop()`.

### WHY 3D: No timeout on the recorder.stop() Promise
**Evidence**: mp4.ts L179-193 creates a Promise that only resolves on `onstop` or rejects on `onerror`/`stop()` throw. There is no timeout. If `onstop` never fires and `onerror` is never triggered, the Promise hangs indefinitely.

### WHY 4D: The MediaRecorder session assumes the happy path for event delivery
**Evidence**: The code does not handle the case where `recorder.stop()` succeeds (no throw) but `onstop` never fires. This is an edge case in the MediaRecorder API that is not widely documented.

### WHY 5D: No defensive timeout at the recorder session level
**Evidence**: The only timeout is at the SW level (PROCESSING_TIMEOUT_MS = 30s in background-logic.ts L58). There is no session-level timeout to detect and recover from a hung `recorder.stop()`.

**ROOT CAUSE D**: The MediaRecorder `stop()` Promise has no timeout guard. If `onstop` never fires (stream already ended, Chrome edge case), the entire stop pipeline hangs. The SW's 30s processing timeout eventually recovers the UI, but no download occurs and the user gets no clear error message.

**SOLUTION D**:
- **Immediate mitigation**: Add a timeout (e.g., 10s) to the MediaRecorder `stop()` Promise. If `onstop` has not fired within the timeout, reject the Promise with a descriptive error.
- **Permanent fix**: Check `recorder.state` before calling `stop()`. If the recorder is in `inactive` state, resolve immediately with whatever chunks have been collected.

---

## Cross-Validation

| Root Cause | Explains "no download" | Explains "stuck in Processing" | Explains "returns to idle" | Independent |
|-----------|----------------------|------------------------------|--------------------------|------------|
| A: No decoderConfig | Yes (error path, no data) | No (error sent, transitions to idle) | Yes | Yes |
| B: Offscreen auto-close | Yes (storage write fails) | Yes (no result/error sent) | Yes (via 30s timeout) | Yes |
| C: Broadcast message loss | Yes (result never reaches SW) | Yes (SW never processes result) | Yes (via 30s timeout) | Yes |
| D: MediaRecorder hang | Yes (stop never completes) | Yes (no result/error sent) | Yes (via 30s timeout) | Yes |

**Consistency check**: Root causes A-D are mutually consistent and address different failure modes. Root cause A covers the WebCodecs path. Root cause D covers the MediaRecorder fallback path. Root causes B and C are cross-cutting concerns that affect both paths.

**Completeness check**: All observed symptoms are explained:
- "No download" -- all four root causes
- "UI stuck in Processing" -- B, C, D (offscreen never responds; 30s timeout eventually recovers)
- "UI returns to idle without download" -- A (error path), B/C/D (via timeout recovery)

---

## Solution Summary

| Priority | Root Cause | Fix Type | Description |
|---------|-----------|---------|-------------|
| P0 | C | Permanent | **Await sendMessageToOffscreen response** instead of fire-and-forget. The `sendResponse` from offscreen.ts already returns the result. Use it as the primary delivery path for `offscreen-result`. |
| P0 | A | Permanent | **Add encoder readiness tracking**. Do not throw on missing decoderConfig -- instead, return whatever data is available or fall back to MediaRecorder. |
| P1 | B | Permanent | **Reorder stop sequence**: store partial data to `chrome.storage.local` before canceling media tracks, keeping the offscreen document alive during the critical write window. |
| P1 | D | Immediate | **Add timeout to MediaRecorder stop() Promise** (10s). Resolve with collected chunks on timeout. |
| P2 | B | Permanent | **Use chrome.runtime.connect (ports)** for SW-offscreen communication. Chrome respects port connections for document lifetime management. |
| P2 | C | Permanent | **Replace broadcast messaging** with port-based targeted messaging for all SW-offscreen communication. |

---

## Recommended Fix Order

1. **Fix C first** (highest impact, lowest effort): Change background.ts to await `sendMessageToOffscreen` and use its resolved value. The offscreen already sends the response via `sendResponse` in offscreen.ts L77. The SW currently discards this via `.catch(() => {})`. Instead, await it and process the result.

2. **Fix A second**: Remove the hard throw on missing `decoderConfig`. Either return an empty blob with a warning, or fall back to MediaRecorder if WebCodecs produced no output.

3. **Fix D third**: Add a Promise.race timeout to MediaRecorder's `stop()`.

4. **Fix B last** (systemic): Restructure the stop sequence to persist data earlier, or adopt port-based communication for document lifetime guarantees.

---

## Appendix: Key File Locations

- `/Users/jeffbailey/Projects/foss/leading/brorecord/src/background-logic.ts` -- SW message handler, fire-and-forget at L208-211
- `/Users/jeffbailey/Projects/foss/leading/brorecord/src/background.ts` -- Chrome API adapters, broadcast-based sendMessageToOffscreen at L36-37
- `/Users/jeffbailey/Projects/foss/leading/brorecord/src/offscreen-logic.ts` -- handleStop at L79-110, dual message send (broadcast + return)
- `/Users/jeffbailey/Projects/foss/leading/brorecord/src/offscreen.ts` -- Message listener with sendResponse at L75-77
- `/Users/jeffbailey/Projects/foss/leading/brorecord/src/mp4.ts` -- WebCodecs decoderConfig check at L138, MediaRecorder stop at L179-193
