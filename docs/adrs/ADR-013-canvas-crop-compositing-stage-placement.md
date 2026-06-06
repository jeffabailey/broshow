# ADR-013: Canvas-Crop Compositing Stage Placement

## Status

Accepted

## Context

ADR-010 introduces a canvas-crop stage between the window stream and the recorder.
DESIGN must decide **where** this stage lives and **how** it connects to the
existing recorder pipeline (`createRecordingSession` / `createMediaRecorderSession`
in `mp4.ts`) and the `RecorderHost` port — without disturbing the shipped
single-tab Chromium offscreen `streamId` contract or adding a platform branch.

Facts that constrain the choice:
- `getDisplayMedia` must run in a gesture-capable page; the cropped local
  `MediaStream` cannot be serialized through a Chromium `streamId`, so it must be
  consumed in the page that produced it.
- `createRecordingSession` accepts any `MediaStream` (it reads
  `getVideoTracks()[0]` / `getAudioTracks()[0]` and sizes the encoder from the
  track settings).
- The shipped Firefox path already hosts the recorder in the record page.

## Options Considered

### Option A: Compositor in the Chromium offscreen document (REJECTED)

Send the window stream to the offscreen document and crop there.

- **Pros**: keeps the recorder in offscreen (symmetric with single-tab Chromium).
- **Cons**: the window `MediaStream` cannot be passed to the offscreen document
  via the `streamId` URL handshake (streamId is a tabCapture artifact, not a
  display-media one). Would require a net-new cross-context stream transfer, and
  would entangle the new mode with the single-tab offscreen contract (regression
  risk, violates QA-1).
- **Rejection**: infeasible/serialization-hostile; risks the shipped path.

### Option B: New "crop" method on the RecorderHost port (REJECTED)

Add a `startCropped(stream, cropRect)` to the `RecorderHost` port.

- **Pros**: explicit.
- **Cons**: `RecorderHost` is a **target** abstraction (chromium vs firefox), not
  a **mode** abstraction. Adding a mode method creates a mode×target matrix and
  pollutes the single-platform-branch invariant.
- **Rejection**: violates QA-5 (port stays target-only; ADR-012's orthogonality).

### Option C: Compositor in the record page, upstream of an UNCHANGED recorder (SELECTED)

The compositor runs in the record page (the same page that owns
`getDisplayMedia` and the crop preview). Per frame it draws the cropped sub-rect
of the source `<video>` onto a `<canvas>`, then `canvas.captureStream(fps)`
yields the cropped `MediaStream` — which is handed to the **unchanged**
`createRecordingSession`. The granted audio track passes through unchanged.

```text
getDisplayMedia(window) → <video> → [PURE CropRect] → canvas.drawImage(sub-rect)
   → canvas.captureStream(fps) → createRecordingSession(stream) → mp4/webm
```

- **Pros**:
  - The recorder (`mp4.ts`) is **byte-for-byte unchanged** — it sees an ordinary
    `MediaStream`.
  - The `RecorderHost` port is **untouched**; no new platform branch (QA-5).
  - Continuity is structural: one stream for the whole session; the compositor
    and recorder never restart on tab switch (QA-3).
  - The cropped local stream is consumed where it is produced — no cross-context
    serialization problem.
  - The geometry is extracted to a **pure** `crop-geometry.ts` (QA-4); the
    compositor holds only the `requestAnimationFrame` loop + `drawImage`.
  - Maps to Firefox with no extra branching (Firefox already records in the
    record page).
- **Cons**:
  - For this mode only, the recorder runs in the record page on Chromium too
    (not in the offscreen document). This is an intentional, isolated divergence
    confined to the new mode; the single-tab Chromium path keeps offscreen.

## Decision

**Option C: the canvas-crop compositor lives in the record page, upstream of the
unchanged `createRecordingSession`. The `RecorderHost` port is not modified, and
no new platform branch is added.**

## Consequences

### Positive

- `mp4.ts`, `offscreen*.ts`, and `recorder-host*.ts` are unchanged (QA-1, QA-5).
- Crop geometry is a pure, headlessly-tested function (QA-4).
- The new mode is fully additive; shipped modes are regression-safe.

### Negative

- The Chromium single-tab path (offscreen) and the cropped-window path
  (record-page recorder) diverge in *where the recorder runs*. This is the
  intended architectural seam (mode-specific), documented here and in
  `component-boundaries.md §5–§7`, not accidental duplication.
- The compositor's frame rate is best-effort (`captureStream`); validated by the
  headed/manual E2E gate.

## Relationships

- Realizes the compositor placement implied by ADR-010 and constrained by
  ADR-012 (mode orthogonal to target).
- Consumes the `CropRect` produced per ADR-011.
- Preserves ADR-001 (offscreen) and ADR-002 (mp4-mux) for the existing modes.
