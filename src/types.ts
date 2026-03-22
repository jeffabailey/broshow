// --------------------------------------------------------------------------
// BroRecord shared message and state types
// --------------------------------------------------------------------------
// This module contains ONLY type definitions and a module marker constant.
// No runtime logic, no side effects, no imports.
// --------------------------------------------------------------------------

/** Module marker for import verification in tests. */
export const TYPES_MODULE_MARKER = 'brorecord-types' as const;

// --- Recording State (discriminated union) --------------------------------

export type RecordingState =
  | { readonly status: 'idle' }
  | { readonly status: 'recording'; readonly tabId: number; readonly startTime: number }
  | { readonly status: 'processing' };

// --- Popup -> Service Worker messages -------------------------------------

export type PopupToSW =
  | { readonly type: 'start-recording' }
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
  | { readonly type: 'offscreen-result'; readonly blobUrl: string; readonly format: 'mp4' | 'webm' }
  | { readonly type: 'offscreen-error'; readonly error: string; readonly fallbackBlobUrl?: string };

// --- Unified Message type -------------------------------------------------

export type Message = PopupToSW | SWToPopup | SWToOffscreen | OffscreenToSW;
