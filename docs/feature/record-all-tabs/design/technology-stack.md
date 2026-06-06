# Technology Stack: record-all-tabs (R1-cropped)

> Wave: DESIGN
> Sibling: `architecture-design.md`, `component-boundaries.md`, `data-models.md`
> Principle: open-source first; reuse before introducing. **This feature adds
>   no runtime dependencies.**

## 1. Headline: zero new dependencies

The cropped-window mode is built entirely from **browser-native Web Platform
APIs** already in use by BroShow, plus one library already shipped. No new npm
package, no new permission, no new outbound network.

| Capability | Mechanism | Status in BroShow |
|---|---|---|
| Acquire the active window's live pixels | `navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'window'}, audio:true})` | **Already used** — production fallback chain + the Firefox record-page path (`record.ts`) |
| Crop to a sub-rectangle per frame | `<video>` + `<canvas>` `CanvasRenderingContext2D.drawImage(src, sx,sy,sw,sh, dx,dy,dw,dh)` | **New use of a native API** (no dependency) |
| Derive a recordable stream from the canvas | `HTMLCanvasElement.captureStream(fps)` | **New use of a native API** (no dependency) |
| Mux to mp4 (H.264/AAC) | WebCodecs `VideoEncoder`/`AudioEncoder` + `mp4-muxer` | **Already used** (`mp4.ts`, ADR-002) — consumes any `MediaStream` |
| WebM fallback | `MediaRecorder` | **Already used** (`mp4.ts`, `createMediaRecorderSession`) |
| Download locally | `chrome.downloads.download` (blob: URL) | **Already used** (`record.ts`, `background.ts`) |

## 2. Why the existing pipeline accepts the cropped stream unchanged

`createRecordingSession(stream)` and `createMediaRecorderSession(stream)` both
accept an arbitrary `MediaStream`. The canvas-crop compositor produces exactly
that — `canvas.captureStream(fps)` yields a standard video `MediaStreamTrack`,
and the granted audio track (if any) is added alongside it. The recorder reads
`stream.getVideoTracks()[0]` / `getAudioTracks()[0]` and binds its
`MediaStreamTrackProcessor` / `MediaRecorder` exactly as today. **No recorder
change is required** (component-boundaries §6).

`mp4.ts` already configures the encoder from the *video track's* settings
(`getSettings().width/height/frameRate`). For the cropped stream those settings
are the **canvas** dimensions (i.e. the crop output size), which is the desired
behavior — the encoder sizes to the cropped region automatically.

## 3. New native-API surface — maturity / risk notes

| API | License/Std | Maturity | Risk + mitigation |
|---|---|---|---|
| `canvas.drawImage` (sub-rect form) | Web standard | Universal, ancient | None |
| `HTMLCanvasElement.captureStream` | Web standard (Media Capture from DOM Elements) | Widely supported in Chromium + Firefox | Frame rate is best-effort; mitigate by driving `drawImage` from `requestAnimationFrame` (or a fixed `captureStream(fps)`) and validating fidelity in the headed/manual E2E gate |
| `getDisplayMedia({displaySurface:'window'})` | Web standard (Screen Capture) | Supported both targets | `displaySurface` is a **picker hint**, not a guarantee; if the user picks another surface the crop still applies to the granted stream. Verified by E2E/manual gate |

No proprietary technology. No SaaS. No telemetry. Consistent with the BroShow
vision (local-first / private) and prior-feature posture.

## 4. Reuse decisions (existing-system-first)

| Decision | Reused asset | Rationale |
|---|---|---|
| Host the gesture + preview in the **record page** | `record.html` / `record.ts` (shipped Firefox surface) | Already owns a getDisplayMedia gesture context with full `Window` privileges; the popup origin cannot call getDisplayMedia. No new surface invented. |
| Recorder pipeline | `mp4.ts` `createRecordingSession` / `createMediaRecorderSession` | Consumes any `MediaStream`; mp4 + WebM fallback already proven. |
| Filename + download | `formatRecordingFilename`, `chrome.downloads` blob: URL pattern | AC2.3 filename/path unchanged. |
| Target abstraction | `RecorderHost` port + `selectHost` | Untouched; mode is orthogonal to target. |
| Audio "include if shared" | `record.ts` track-composition pattern | Existing behavior; only the video track is swapped for the cropped one. |

## 5. Net-new modules (code, not dependencies)

| Module | Kind | License | Why net-new |
|---|---|---|---|
| `crop-geometry.ts` | PURE | project (MIT) | No existing module maps a preview drag-rect to a stream-space `CropRect`; this is the only non-trivial new logic and is unit + mutation tested. |
| `crop-compositor.ts` | effect | project (MIT) | No existing module does per-frame canvas cropping of a live stream. Thin: a `requestAnimationFrame` loop calling `drawImage` + `captureStream`. |

Both justified by "no existing alternative." The geometry is separated from the
compositor so the math is testable headlessly (QA-4).

## 6. Architecture-rule enforcement tooling

**dependency-cruiser** (MIT, JS/TS-native, actively maintained) — already named
in `firefox-recording-support/design/technology-stack.md`. Extend its
`no-chrome-in-pure-logic` rule to cover `crop-geometry.ts` (and any
`*-logic.ts` additions): the pure modules must not import
`chrome|browser|navigator` or DOM/canvas runtime. This is the import-graph
enforcement layer. The compositor's purity discipline (no geometry inside the
effectful loop) is enforced by keeping all math in `crop-geometry.ts` and
unit-testing it against fixed inputs.

## 7. Testability tooling (handed to DISTILL/DELIVER)

- **Headless unit + mutation** (no browser): Vitest (existing) + the project's
  per-feature mutation runner (≥80% kill gate per CLAUDE.md), scoped to
  `crop-geometry.ts` and the `popup-logic.ts` mode/message additions.
- **Effect/E2E** (real window pixels needed for crop fidelity + follow): the
  SPIKE flagged that **Chrome 148 blocks CLI/CDP unpacked-extension loading**.
  Recommend a **Puppeteer or Playwright persistent-context** harness (headed,
  `--load-extension` via the runner) OR a documented **human-in-loop manual
  gate**. Both are OSS (Apache-2.0 / Apache-2.0). Cost flagged for DISTILL/DELIVER.

## 8. Permissions / privacy

- **No new permission.** `getDisplayMedia` needs none; `chrome.downloads` is
  declared. `manifest.json` diff is empty.
- **No outbound network.** Capture, crop, mux, download are all local.
- **Residual caveat (documented, not a tooling item):** the active tab's content
  is still recorded on switch; cropping hides chrome only. Carried to DISTILL for
  the "honest indicator" scenario; PRIVACY.md touched if the listing copy needs
  it (DoD #6).
