# Data Models: record-all-tabs (R1-cropped)

> Wave: DESIGN
> Sibling: `architecture-design.md`, `component-boundaries.md`, `technology-stack.md`
> Scope: only the type/message/state shapes that change. Everything else in
>   `src/types.ts` carries forward unchanged. Every change is marked
>   **additive** or **breaking** (all changes here are additive).

## 1. Summary of changes

| Type family | Change | Additive / Breaking |
|---|---|---|
| `RecordingPath` | + `'window-cropped'` member | **Additive** (union widening) |
| `CropRect` | **new** model `{x,y,w,h}` in stream coords | **Additive** (new type) |
| `RecordingMode` | **new** discriminant for the popup mode selector | **Additive** (new type) |
| `PopupToSW` start-recording | + a `'window-cropped'` variant | **Additive** (new union member) |
| `CapabilityCheckResult` | unchanged | n/a |
| `RecordingState` | unchanged (same `idle`/`recording`/`processing`) | n/a |
| `HostStartInput` / `RecorderHost` | unchanged (mode is orthogonal to target) | n/a |
| `SWToPopup` / `SWToOffscreen` / `OffscreenToSW` | unchanged | n/a |

No member is renamed, removed, or re-typed. Existing exhaustive `switch`
statements over `RecordingPath` and `PopupToSW` will surface the new member at
compile time (TypeScript), which is the intended safety net — adding the variant
is additive, but the compiler flags every site that must acknowledge it.

## 2. `RecordingPath` (types.ts)

### 2.1 Before (current)

```text
type RecordingPath = 'chromium-offscreen' | 'firefox-display-media';
```

### 2.2 After (this feature) — **additive**

```text
type RecordingPath =
  | 'chromium-offscreen'      // existing: single-tab via offscreen + tabCapture streamId
  | 'firefox-display-media'   // existing: Firefox record-page getDisplayMedia recorder
  | 'window-cropped';         // NEW: cropped-window mode (record-page getDisplayMedia + canvas crop)
```

Semantics: `RecordingPath` already mixes a *target* hint (`chromium`/`firefox`)
and a *pipeline* hint. `'window-cropped'` is a **pipeline/mode** discriminant
that is **target-blind** — both Chromium and Firefox resolve it to the
record-page recorder. The existing `targetForPath` mapping (the single platform
branch) is therefore **not** the right place to interpret it; mode routing
happens in the popup/record page (see §5), and `targetForPath` keeps mapping only
the two target-bearing paths. (Software-crafter: if `targetForPath` must be
total over the union, the `'window-cropped'` case resolves to the running
target via the capability probe, NOT via a new platform branch — it reuses the
already-detected target.)

## 3. `RecordingMode` (popup-logic.ts) — **new, additive**

The popup's user-facing selector. Distinct from `RecordingPath` (wire) so the UI
vocabulary and the wire format evolve independently.

```text
type RecordingMode =
  | 'single-tab'        // default; existing behavior, byte-for-byte unchanged
  | 'desktop-screen'    // existing desktop-screen-recording
  | 'window-cropped';   // NEW: "Record all tabs (window, cropped)"
```

Default selection is `'single-tab'` (AC1.1 — existing behavior unchanged when the
user never touches the control).

## 4. `CropRect` (types.ts) — **new, additive**

```text
type CropRect = {
  readonly x: number;   // left, in STREAM pixel coords (source video intrinsic space)
  readonly y: number;   // top,  in STREAM pixel coords
  readonly w: number;   // width  in stream px (> 0)
  readonly h: number;   // height in stream px (> 0)
};
```

Invariants (enforced by the pure `crop-geometry.ts`):

- Coordinates are in **stream space** (the source video's intrinsic
  width/height), NOT preview CSS pixels. The preview→stream mapping is the pure
  function's job.
- `0 ≤ x`, `0 ≤ y`, `x + w ≤ streamWidth`, `y + h ≤ streamHeight` (clamped).
- `w > 0` and `h > 0` (a zero/degenerate drag is rejected/normalized to a
  minimum, decided by the pure function and unit-tested).
- The output canvas dimensions derive from `w×h` (1:1 by default; the pure
  function owns any rounding to even dimensions if the encoder requires it).

**Audio is not part of `CropRect`.** Cropping is video-only; the audio track (if
granted) passes through unchanged (Decision B; see architecture-design §10).

### 4.1 Pure geometry signature (informational, software-crafter owns final shape)

```text
toCropRect ::
  (dragRectPreviewPx, previewRenderedSize, streamIntrinsicSize) -> CropRect

// preview CSS-pixel rect + how big the <video> is rendered + the stream's
// intrinsic w/h  ->  clamped stream-space CropRect.
// PURE: deterministic, no DOM, no canvas. The unit + mutation tests live here.
```

## 5. `PopupToSW` start-recording (types.ts) — **additive variant**

### 5.1 Before (current)

```text
type PopupToSW =
  | { type: 'start-recording'; path: 'chromium-offscreen'; streamId: string }
  | { type: 'start-recording'; path: 'firefox-display-media' }
  | { type: 'stop-recording' }
  | { type: 'get-state' };
```

### 5.2 After (this feature) — **additive**

```text
type PopupToSW =
  | { type: 'start-recording'; path: 'chromium-offscreen'; streamId: string }
  | { type: 'start-recording'; path: 'firefox-display-media' }
  | { type: 'start-recording'; path: 'window-cropped' }   // NEW: no streamId
  | { type: 'stop-recording' }
  | { type: 'get-state' };
```

Notes:

- The `'window-cropped'` variant carries **no `streamId`** and **no `CropRect`**
  on the wire. Like the Firefox variant, the stream is acquired in the
  record-page gesture context; the `CropRect` never leaves the record page (it
  is consumed locally by the compositor — see component-boundaries §5). The SW
  only needs to know "a window-cropped recording is starting" to flip state,
  set the badge, and show the indicator.
- `messageForAction` (popup-logic.ts) gains a `'window-cropped'` overload that
  returns this variant. Pure, target-blind — same pattern as the existing
  Firefox overload.
- `background-logic.ts` already extracts `streamId` defensively
  (`'streamId' in message ? message.streamId : ''`); the new variant has no
  `streamId`, which the existing code handles without change.

## 6. Unchanged — and why (regression guarantees)

| Type | Why it does not change |
|---|---|
| `RecordingState` (`idle`/`recording`/`processing`) | The cropped-window mode produces the same lifecycle end-states. The record page hosts the recorder; the SW state graph is identical. |
| `RecorderHost` / `HostStartInput` / `HostStopResult` | Mode is orthogonal to target (ADR-012). The port stays a pure target abstraction; the single platform branch is preserved. |
| `OffscreenToSW` / `SWToOffscreen` | The single-tab offscreen handshake is not on the cropped-window flow; its message contract is untouched. |
| `formatRecordingFilename` output | AC2.3 — filename/path unchanged (`broshow-YYYY-MM-DD-HHmmss.{mp4\|webm}`). |
| `manifest.json` permission set | `getDisplayMedia` requires no host permission; `chrome.downloads` already declared. |

## 7. Type-change risk assessment

- **Exhaustiveness:** widening `RecordingPath` and `PopupToSW` will produce
  TypeScript errors at any non-total `switch`. This is desirable — it lists every
  site that must acknowledge the new mode. None of those sites need *behavioral*
  change for the existing modes; they add the `'window-cropped'` case (route to
  the record-page recorder / flip state).
- **No breaking change:** no consumer that ignores the new member breaks at
  runtime; the new member only appears when the user selects the new mode.
- **Wire compatibility:** an older SW receiving a `'window-cropped'` message
  would hit its `default`/exhaustive branch; since this ships atomically (popup +
  SW together in one build), there is no mixed-version wire concern.
