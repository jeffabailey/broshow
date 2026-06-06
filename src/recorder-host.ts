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

import type { RecordingPath } from './types';
import { detectRecordingCapability, type ProbeGlobals } from './popup-logic';
import {
  createChromiumOffscreenRecorderHost,
  createDefaultChromiumDeps,
} from './recorder-host-chromium';
import {
  createFirefoxBackgroundRecorderHost,
  createDefaultFirefoxDeps,
} from './recorder-host-firefox';
import { createRecordingSession } from './mp4';

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
 * The selected host bundle returned by selectHostForPath. Bundles the
 * RecorderHost with a target-aware HostStartInput builder so the caller
 * can dispatch start/stop without any further branch on Target.
 *
 * This is what makes selectHost the SINGLE target-branching site in the
 * project: the path->target->input dispatch happens here, once, and the
 * caller (background.ts) consumes only the bundle's polymorphic operations.
 */
export type SelectedHost = {
  readonly target: Target;
  readonly host: RecorderHost;
  readonly buildStartInput: (streamId: string) => HostStartInput;
};

/**
 * Pick the recorder-host adapter AND its Target-aware HostStartInput
 * builder in one switch. This is the SINGLE target-branching site in the
 * codebase (component-boundaries.md §3.3, design D16). All callers depend
 * on the returned port shape -- never on Target.
 *
 * Backwards-compatible shape: the returned value is BOTH a RecorderHost
 * (start, stop) AND a SelectedHost bundle (target, host, buildStartInput).
 * Existing callers using `selectHost(target).start(...)` continue to work;
 * new callers can use selectHost(target).buildStartInput(streamId) to
 * obtain a Target-aware HostStartInput without re-branching.
 */
export const selectHost = (target: Target): RecorderHost & SelectedHost => {
  switch (target) {
    case 'chromium': {
      const host = createChromiumOffscreenRecorderHost(createDefaultChromiumDeps());
      return {
        target: 'chromium',
        host,
        start: host.start,
        stop: host.stop,
        buildStartInput: (streamId: string) => ({ target: 'chromium', streamId }),
      };
    }
    case 'firefox': {
      const host = createFirefoxBackgroundRecorderHost(
        createDefaultFirefoxDeps(createRecordingSession),
      );
      return {
        target: 'firefox',
        host,
        start: host.start,
        stop: host.stop,
        buildStartInput: () => ({ target: 'firefox' }),
      };
    }
  }
};

/**
 * Pure mapping from the popup's RecordingPath wire-discriminant to the
 * adapter Target. Path-narrowing only -- no Target reasoning.
 *
 * 'chromium-offscreen'   -> 'chromium'
 * 'firefox-display-media'-> 'firefox'
 *
 * record-all-tabs (R1-cropped), data-models.md §2 + ADR-012: 'window-cropped'
 * is a TARGET-BLIND pipeline discriminant. It does not name its own target;
 * instead it resolves to the *running* target detected by the capability probe.
 * We therefore recurse onto the probe-detected target-bearing path -- reusing
 * the two existing cases -- rather than introducing a third Target or a new
 * `target ===` platform branch. `selectHost` remains the single platform branch.
 */
export const targetForPath = (
  path: RecordingPath,
  globals: ProbeGlobals = globalThis as ProbeGlobals,
): Target => {
  switch (path) {
    case 'chromium-offscreen':
      return 'chromium';
    case 'firefox-display-media':
      return 'firefox';
    case 'window-cropped': {
      const capability = detectRecordingCapability(globals);
      const runningPath: RecordingPath = capability.supported
        ? capability.path
        : 'chromium-offscreen';
      return targetForPath(runningPath, globals);
    }
  }
};

/**
 * Convenience composition: resolve the host bundle directly from the
 * popup's start-recording wire-discriminant. background.ts uses this
 * on the first start-recording message of a session.
 */
export const selectHostForPath = (path: RecordingPath): RecorderHost & SelectedHost =>
  selectHost(targetForPath(path));
