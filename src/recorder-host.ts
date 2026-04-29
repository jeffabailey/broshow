// ---------------------------------------------------------------------------
// RecorderHost port + factory shape (RED scaffold -- DELIVER wave)
// ---------------------------------------------------------------------------
// This is the platform abstraction described in
//   docs/feature/firefox-recording-support/design/component-boundaries.md §3
// and
//   docs/feature/firefox-recording-support/design/data-models.md §4
//
// Software-crafter implements `selectHost` and the two adapter factories.
// The shapes below are stable inputs from DESIGN; do not widen without
// revisiting the design wave.
// ---------------------------------------------------------------------------

export const __SCAFFOLD__ = true;

export type Target = 'chromium' | 'firefox';

export type HostStartInput =
  | { readonly target: 'chromium'; readonly streamId: string }
  | { readonly target: 'firefox' };

export type HostStartResult =
  | { readonly ok: true; readonly hadAudioTrack: boolean }
  | { readonly ok: false; readonly cause: 'picker-cancelled' };

export type HostStopResult =
  | { readonly ok: true; readonly format: 'mp4' | 'webm'; readonly dataUrl: string }
  | { readonly ok: false; readonly cause: 'mux-error'; readonly fallbackDataUrl?: string };

export type RecorderHost = {
  readonly start: (input: HostStartInput) => Promise<HostStartResult>;
  readonly stop: () => Promise<HostStopResult>;
};

/**
 * Factory: pick the recorder-host adapter for the runtime target.
 * Implemented in DELIVER (software-crafter). The branch on `Target` is the
 * single platform branch in the codebase per component-boundaries.md §3.3.
 */
export const selectHost = (_target: Target): RecorderHost => {
  throw new Error('Not yet implemented -- RED scaffold (selectHost)');
};
