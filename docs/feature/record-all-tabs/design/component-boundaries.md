# Component Boundaries: record-all-tabs (R1-cropped)

> Wave: DESIGN
> Sibling: `architecture-design.md`, `data-models.md`, `technology-stack.md`
> Paradigm: Functional. Adapters are factory functions; pure modules are
>   side-effect-free. No class hierarchy. Effect boundaries are function signatures.

## 1. Purpose

Name the components the cropped-window mode introduces, declare how they slot
into the existing pure-core / effect-shell layout, and bind the dependency rules
that keep the new mode **additive** and **target-blind**. The single platform
branch (`selectHost`) stays untouched.

## 2. Module map (post-feature)

```text
src/
  popup.html / popup.css        // + mode selector option (additive markup)
  popup.ts                      // adapter -- DOM + chrome; routes the new mode to the record page
  popup-logic.ts                // PURE -- describeUI, messageForAction, capability typing
  background.ts                 // adapter -- selects RecorderHost by Target (UNCHANGED branch)
  background-logic.ts           // PURE -- state machine, badge, filename (UNCHANGED state graph)
  offscreen.ts / offscreen-logic.ts   // Chromium single-tab path -- UNCHANGED
  mp4.ts                        // recorder factories -- UNCHANGED (createRecordingSession consumes any MediaStream)
  recorder-host*.ts             // RecorderHost port + adapters -- UNCHANGED (target abstraction only)

  record.html / record.ts       // RECORD PAGE -- extended to host the live crop preview + compositor for this mode

  # NEW pure modules (no DOM, no chrome, no navigator):
  crop-geometry.ts              // PURE -- drag-rect (preview coords) -> CropRect (stream coords); clamp; output sizing
  # (mode->path mapping + message building extend popup-logic.ts; no new file required)

  # NEW effect module (browser-bound), or a section of record.ts:
  crop-compositor.ts            // adapter -- per-frame canvas draw of the cropped sub-rect; canvas.captureStream()

  types.ts                      // additive: 'window-cropped' RecordingPath, CropRect, start-recording variant
```

Naming is illustrative; software-crafter owns final names. The **boundaries**,
not the names, are what this document binds.

## 3. Dependency-inversion compliance

The new components obey the same inward-pointing rule as the rest of the codebase:

```text
PURE (inner)        crop-geometry.ts, popup-logic.ts, background-logic.ts
                    -- depend on nothing but types.ts. No chrome/browser/navigator/DOM runtime.

EFFECT (outer)      record.ts, crop-compositor.ts, popup.ts, background.ts
                    -- MAY import pure modules + the platform APIs they own.
                    -- MUST NOT contain business geometry (delegated to crop-geometry.ts).
```

- The **crop geometry** (the only non-trivial new logic) is a pure function:
  `(dragRectInPreviewCoords, previewSize, streamIntrinsicSize) → CropRect`. It is
  unit + mutation tested without a browser (QA-4). The compositor calls it and
  then performs the effectful `canvas.drawImage` — the compositor holds **no**
  geometry of its own.
- The compositor depends on the pure geometry, never the reverse. Dependencies
  point inward.
- `crop-geometry.ts` and the mode/message additions in `popup-logic.ts` fall
  under the existing `no-chrome-in-pure-logic` dependency-cruiser rule.

## 4. Component responsibilities

| Component | Layer | Responsibility | Must NOT |
|---|---|---|---|
| Mode selector (popup) | effect (DOM) | Offer `single tab` (default) \| `desktop screen` \| `record all tabs (window, cropped)`. Default unchanged. | Change single-tab behavior; add a dead control on unsupported targets |
| Mode routing (popup.ts) | effect | When `window-cropped` is chosen, open the record page (gesture + preview owner). | Call getDisplayMedia from the popup origin (forbidden) |
| Window-stream acquirer (record.ts) | effect | Call `getDisplayMedia({video:{displaySurface:'window'}, audio:true})` in the gesture; expose the stream + a `<video>` sink. | Re-acquire on tab switch; serialize the stream through a streamId |
| Crop-preview UI (record.ts) | effect (DOM) | Render the live window stream; capture a pointer-drag rectangle; confirm. | Estimate chrome height; persist a rect across sessions |
| **Crop geometry (crop-geometry.ts)** | **PURE** | Normalize/clamp the drag rect; map preview coords → stream coords; compute output `w×h`. | Touch DOM, canvas, or any global |
| Canvas-crop compositor (crop-compositor.ts) | effect | Per frame: `drawImage(video, CropRect → canvas)`; expose `canvas.captureStream(fps)`. Pass through the audio track. | Hold geometry; restart on tab switch |
| Recorder session (mp4.ts) | effect | Mux the cropped `MediaStream` to mp4 (webm fallback). **UNCHANGED.** | Know about modes or crop |
| Background state machine | PURE core + effect shell | `idle→recording→processing→idle`; download; badge. **UNCHANGED graph.** | Branch on mode beyond carrying the discriminant |
| RecorderHost port | effect (target abstraction) | `start`/`stop` per target. **UNCHANGED.** | Gain a mode dimension |

## 5. Data flow — cropped-window mode (popup → record page → SW → recorder → download)

```text
1. POPUP (gesture): user selects "Record all tabs (window, cropped)" → clicks Start.
   popup.ts (mode === 'window-cropped') opens record.html in a window
   (reuses the shipped Firefox launcher path; the record page carries the gesture).

2. RECORD PAGE (gesture + preview):
   a. record.ts calls getDisplayMedia({video:{displaySurface:'window'}, audio:true}).
   b. The granted window MediaStream renders live in a <video> preview.
   c. User drags a crop box over the content area, confirms.
   d. crop-geometry.ts (PURE) maps the drag rect → CropRect {x,y,w,h} in stream coords.
   e. crop-compositor.ts starts: each frame drawImage(video[CropRect]) → canvas;
      canvas.captureStream(fps) → croppedStream (cropped video + pass-through audio).
   f. record.ts hands croppedStream to createRecordingSession (the recorder).

3. SW (orchestration, target-blind):
   - record.ts notifies the SW it is recording (start-recording, path:'window-cropped').
   - The SW state machine flips idle→recording, sets the REC badge, and shows the
     "Recording window region" indicator. It does NOT mint a stream and does NOT
     install a tabs.onActivated handler.

4. TAB SWITCHES (no action): the window stream's pixels change; the compositor and
   recorder keep running on the SAME stream. One continuous file, no seam.

5. STOP (≤1 gesture): user clicks Stop (in the record page or via the SW path).
   recorder session.stop() → mp4 (webm fallback) → chrome.downloads.download
   with the UNCHANGED filename broshow-YYYY-MM-DD-HHmmss.{mp4|webm}. SW → idle.
```

The path differs from single-tab Chromium in exactly one structural way: **the
recorder runs in the record page** (as Firefox already does), so the cropped
local `MediaStream` is consumed where it is produced. The single-tab Chromium
offscreen/`streamId` path is **not** on this flow and is byte-for-byte preserved.

## 6. Where the new code touches existing modules (impact summary)

| File | Change | Additive / Breaking |
|---|---|---|
| `types.ts` | + `'window-cropped'` RecordingPath; + `CropRect`; + start-recording variant | **Additive** |
| `popup-logic.ts` | + mode→path mapping; + `messageForAction` window-cropped variant | **Additive** (overload) |
| `popup.ts` / `popup.html` / `popup.css` | + mode option; + route to record page | **Additive** |
| `record.ts` | + window-surface constraint for this mode; + preview + compositor wiring | **Additive** (new mode branch; existing Firefox path unchanged) |
| `crop-geometry.ts` | NEW pure module | New (additive) |
| `crop-compositor.ts` | NEW effect module | New (additive) |
| `background-logic.ts` | carry the mode discriminant through start-recording | **Additive** (no state-graph change) |
| `recorder-host*.ts` / `selectHost` | none | **Unchanged** (single platform branch preserved) |
| `mp4.ts` / `offscreen*.ts` | none | **Unchanged** |
| `manifest.json` | none (getDisplayMedia needs no permission) | **Unchanged** |

## 7. Invariants this design must not break

1. **`selectHost` remains the SINGLE platform branch.** Mode is orthogonal to
   target; no `target ===` site is added.
2. **Single-tab Chromium offscreen/`streamId` contract is byte-for-byte
   unchanged.** The new mode never flows through it.
3. **Pure modules import only `types.ts`.** `crop-geometry.ts` and the
   `popup-logic.ts` additions contain no DOM/chrome/navigator runtime use.
4. **Continuity is structural, not engineered.** One window stream for the whole
   session; the compositor/recorder never restart on tab switch.
5. **Filename and download path are unchanged** (`formatRecordingFilename`
   reused as-is).
