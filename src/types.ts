// --------------------------------------------------------------------------
// BroShow shared message and state types
// --------------------------------------------------------------------------
// This module contains ONLY type definitions and a module marker constant.
// No runtime logic, no side effects, no imports.
// --------------------------------------------------------------------------

/** Module marker for import verification in tests. */
export const TYPES_MODULE_MARKER = 'broshow-types' as const;

// --- Recording State (discriminated union) --------------------------------

export type RecordingState =
  | { readonly status: 'idle' }
  | { readonly status: 'recording'; readonly tabId: number; readonly startTime: number }
  | { readonly status: 'processing' };

// --- Recording-path discriminant -------------------------------------------
// Per docs/feature/firefox-recording-support/design/data-models.md §3, the
// popup's start-recording message carries the runtime witness of the
// capability probe: 'chromium-offscreen' (chrome.offscreen + tabCapture)
// or 'firefox-display-media' (navigator.mediaDevices.getDisplayMedia).
//
// record-all-tabs (R1-cropped) widens this union with 'window-cropped' (ADDITIVE).
// Per docs/feature/record-all-tabs/design/data-models.md §2, 'window-cropped' is a
// pipeline/mode discriminant that is TARGET-BLIND -- both Chromium and Firefox
// resolve it to the record-page recorder. targetForPath keeps mapping only the
// two target-bearing paths (no new platform branch).
export type RecordingPath =
  | 'chromium-offscreen'
  | 'firefox-display-media'
  | 'window-cropped';

// --- Recording mode (popup user-facing selector) ---------------------------
// record-all-tabs (R1-cropped), data-models.md §3. Distinct from RecordingPath
// (wire) so UI vocabulary and wire format evolve independently. Default is
// 'single-tab' -- existing behavior byte-for-byte unchanged (AC1.1).
export type RecordingMode =
  | 'single-tab'
  | 'desktop-screen'
  | 'window-cropped';

// --- Crop rectangle (stream coordinates) -----------------------------------
// record-all-tabs (R1-cropped), data-models.md §4. Coordinates are in STREAM
// pixel space (the source window stream's intrinsic size), NOT preview CSS px.
// The pure crop-geometry.ts owns the preview->stream mapping and the clamping
// invariants (0<=x, 0<=y, x+w<=streamWidth, y+h<=streamHeight, w>0, h>0).
export type CropRect = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};

// --- Popup -> Service Worker messages -------------------------------------

export type PopupToSW =
  | { readonly type: 'start-recording'; readonly path: 'chromium-offscreen'; readonly streamId: string }
  | { readonly type: 'start-recording'; readonly path: 'firefox-display-media' }
  // record-all-tabs (R1-cropped), data-models.md §5: no streamId, no CropRect on
  // the wire -- the CropRect is consumed locally in the record page. The SW only
  // needs to know a window-cropped recording is starting (flip state, badge,
  // "Recording window region" indicator).
  | { readonly type: 'start-recording'; readonly path: 'window-cropped' }
  | { readonly type: 'stop-recording' }
  | { readonly type: 'get-state' };

// --- Service Worker -> Popup messages -------------------------------------

export type SWToPopup =
  | { readonly type: 'state-update'; readonly state: RecordingState }
  | { readonly type: 'error'; readonly message: string }
  | { readonly type: 'fallback-notice'; readonly message: string };

// --- Service Worker -> Offscreen messages ---------------------------------

export type SWToOffscreen =
  | { readonly type: 'offscreen-start'; readonly streamId: string }
  | { readonly type: 'offscreen-stop' };

// --- Offscreen -> Service Worker messages ---------------------------------

export type OffscreenToSW =
  | { readonly type: 'offscreen-ready' }
  | { readonly type: 'offscreen-result'; readonly format: 'mp4' | 'webm'; readonly dataUrl?: string }
  | { readonly type: 'offscreen-error'; readonly error: string; readonly fallbackDataUrl?: string };

// --- Unified Message type -------------------------------------------------

export type Message = PopupToSW | SWToPopup | SWToOffscreen | OffscreenToSW;
