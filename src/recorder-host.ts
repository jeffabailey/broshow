// ---------------------------------------------------------------------------
// RecorderHost port + factory
// ---------------------------------------------------------------------------
// Platform abstraction described in
//   docs/feature/firefox-recording-support/design/component-boundaries.md §3
// and
//   docs/feature/firefox-recording-support/design/data-models.md §4
//
// The port shape is target-blind. `selectHost` is the ONE platform branch
// in the codebase (component-boundaries.md §3.3). All callers depend on the
// port shape, never on a target.
// ---------------------------------------------------------------------------

import {
  createChromiumOffscreenRecorderHost,
  createDefaultChromiumDeps,
} from './recorder-host-chromium';

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
 * Stub host returned for targets whose adapter is not yet implemented
 * (Firefox lands in step 02-01). Honors the port shape so callers can
 * still pattern-match on results -- start/stop yield port-shaped values
 * rather than crashing the caller chain.
 */
const createNotImplementedHost = (target: Target): RecorderHost => ({
  start: async () => {
    throw new Error(`RecorderHost not yet implemented for target: ${target}`);
  },
  stop: async () => {
    throw new Error(`RecorderHost not yet implemented for target: ${target}`);
  },
});

/**
 * Pick the recorder-host adapter for the runtime target.
 * The single platform branch in the codebase (component-boundaries.md §3.3).
 */
export const selectHost = (target: Target): RecorderHost => {
  switch (target) {
    case 'chromium':
      return createChromiumOffscreenRecorderHost(createDefaultChromiumDeps());
    case 'firefox':
      return createNotImplementedHost('firefox');
  }
};
