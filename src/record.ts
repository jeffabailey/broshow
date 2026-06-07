// ---------------------------------------------------------------------------
// Record tab entry point — Firefox-only recording host (ADR-003 Option B)
// ---------------------------------------------------------------------------
// The Firefox MV3 extension popup origin is not allowed to call
// getDisplayMedia (categorically forbidden, not a gesture issue), and the
// background event page can't carry the user gesture. The remaining viable
// host is a regular page (full DOM, full Window privileges) opened in a
// browser window. This file owns that page's lifecycle.
//
// Flow:
//   1. popup.ts opens this page via chrome.windows.create({ type: 'popup' })
//      when the user clicks Start (Firefox tab path, or the "Record all tabs
//      (window)" path which appends ?mode=window-cropped).
//   2. User clicks the button in this page → getDisplayMedia → user picks
//      surface → MediaRecorder begins via the shared createRecordingSession.
//   3. Same button toggles to Stop. User clicks Stop → MediaRecorder.stop →
//      mp4-mux + WebM fallback → chrome.downloads.download → status shows
//      saved filename → window can be closed.
//
// SIMPLIFICATION (simplify-window-record-no-crop): the window mode records the
// WHOLE window with NO cropping. Both modes share ONE record/stop/download
// lifecycle (createRecordLifecycle); the only difference is the requested
// displaySurface ('window' vs 'browser'). The recording includes the browser
// chrome — that is accepted. (The earlier crop machinery — crop-geometry,
// crop-compositor, the live preview/compositor wiring, drag-to-select, and the
// separate startWindowCroppedRecording path whose session was discarded and
// whose Stop was unwired — has been deleted in favour of this reuse.)
// ---------------------------------------------------------------------------

import { createMediaRecorderSession } from './mp4';
import { formatRecordingFilename } from './background-logic';
import {
  detectRecordingCapability,
  type CapabilityCheckResult,
  type ProbeGlobals,
} from './popup-logic';

/**
 * Whether the record page should show the mic / virtual-audio-device
 * ("BlackHole") audio options. They exist ONLY as a Firefox workaround:
 * Firefox + macOS cannot capture tab/window audio directly (Mozilla Bug
 * 1541425). On Chromium the getDisplayMedia path captures window/system audio
 * directly, so the block is irrelevant and is hidden. Pure predicate over the
 * capability probe; unsupported defaults to hidden.
 */
export const shouldShowMicAudioOptions = (
  capability: CapabilityCheckResult,
): boolean => capability.supported && capability.path === 'firefox-display-media';

type State = 'idle' | 'recording' | 'processing' | 'done';

// ---------------------------------------------------------------------------
// Record-page mode routing -- pure parse + pure surface choice
// ---------------------------------------------------------------------------
// The record page hosts ONE capture lifecycle whose requested display surface is
// decided by a single query flag the popup appends when it opens the page:
// `?mode=window-cropped` selects the whole-window surface; NO flag is the
// single-tab / Firefox tab path. recordPageModeFromSearch is the PURE/total seam
// that turns location.search into the routing decision, and
// displayMediaConstraintsForMode turns that decision into getDisplayMedia
// constraints -- both unit-testable without the DOM or the real picker.

/**
 * The two record-page capture modes the query flag selects between. The
 * 'window-cropped' value is kept as the mode/path discriminant for backwards
 * compatibility (types / popup routing / recorder-host); the behaviour is now
 * "record the whole window, no crop".
 */
export type RecordPageMode = 'window-cropped' | 'default';

/**
 * Parse the record page's mode from its `location.search`. Total: only the exact
 * `mode=window-cropped` flag selects the whole-window path; an empty search, a
 * missing/empty mode, or any other mode value falls back to 'default' (the
 * single-tab / Firefox tab path). PURE -- no DOM, no chrome.
 */
export const recordPageModeFromSearch = (search: string): RecordPageMode =>
  new URLSearchParams(search).get('mode') === 'window-cropped'
    ? 'window-cropped'
    : 'default';

/**
 * The getDisplayMedia constraints for a mode. PURE: window mode requests the
 * whole-window surface (displaySurface:'window'); default mode biases toward the
 * tab/browser surface (displaySurface:'browser', the surface that ever exposes
 * "Share audio" on Firefox+macOS). Both request audio on the first attempt; the
 * no-audio retry derives from this constraint by dropping audio only.
 */
export const displayMediaConstraintsForMode = (
  mode: RecordPageMode,
): MediaStreamConstraints => ({
  video: { displaySurface: mode === 'window-cropped' ? 'window' : 'browser' },
  audio: true,
});

/**
 * Derive the no-audio retry constraint from an audio-bearing constraint, keeping
 * the SAME video surface and dropping ONLY audio. PURE -- a surface that cannot
 * supply audio leaves the picker's Share button disabled (or rejects the
 * request), so we re-request the identical surface with audio:false rather than
 * surfacing a cancel notice (audio is kept when available, dropped only when it
 * cannot be supplied).
 */
const withoutAudio = (constraints: MediaStreamConstraints): MediaStreamConstraints => ({
  ...constraints,
  audio: false,
});

// ---------------------------------------------------------------------------
// Honest "Recording window region" indicator
// ---------------------------------------------------------------------------
// The whole-window stream captures whatever the active window is showing and
// FOLLOWS tab switches within that window (one uninterrupted window stream -- no
// re-acquire, no tabs.onActivated). An always-visible scope signal on the record
// page answers the privacy caveat honestly: the operator always SEES that the
// active window's region is what's being recorded. This is a pure PROJECTION of
// the active/idle distinction -- it introduces NO new state node.

/** The honest scope copy: the meaning pinned for the indicator. */
export const RECORDING_REGION_INDICATOR_TEXT = 'Recording window region' as const;

/**
 * Render the honest "Recording window region" indicator onto a single element.
 * When the record page is acting as the window-region capture host (`active`),
 * the indicator shows the honest scope copy and is visible so the operator always
 * knows the capture scope -- it never disappears or goes stale mid-session, across
 * any number of in-window tab switches (one stream, one indicator). When the
 * surface is NOT the window-region host (`active` false), the indicator is hidden
 * so the page never lies about an inactive scope. PURE over the element surface
 * -- no state machine, no chrome APIs.
 */
export const renderRecordingRegionIndicator = (
  indicator: HTMLElement,
  active: boolean,
): void => {
  if (active) {
    indicator.textContent = RECORDING_REGION_INDICATOR_TEXT;
    indicator.hidden = false;
    return;
  }
  indicator.hidden = true;
};

// ---------------------------------------------------------------------------
// Shared record / stop / download lifecycle -- the proven path, surface-aware
// ---------------------------------------------------------------------------
// Both the whole-window mode and the single-tab / Firefox tab mode run THIS
// lifecycle. The surface is chosen by displayMediaConstraintsForMode(mode); the
// no-audio retry, the recorder construction, the stop, and the download are
// identical for both. Dependencies (getDisplayMedia, recorder factory, download,
// status sink, state callback) are injected so start→stop→download is unit
// testable headlessly -- the real picker / whole-window pixels stay @human-gate
// (Chrome 148 blocks headless getDisplayMedia).

export interface RecordLifecycleDeps {
  /** getDisplayMedia bound to navigator.mediaDevices (injected for testing). */
  readonly getDisplayMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  /** Recorder-session factory -- the UNCHANGED createMediaRecorderSession (mp4.ts). */
  readonly createRecordingSession: (stream: MediaStream) => { stop: () => Promise<Blob> };
  /** chrome.downloads.download-style sink (only ever called on the stop/success path). */
  readonly download: (args: { url: string; filename: string }) => Promise<unknown>;
  /** Render a visible status / notice line. */
  readonly setStatus: (text: string) => void;
  /** Report the record-page state transitions. */
  readonly onStateChange: (state: State) => void;
}

/** A started record-page lifecycle: the action button toggles start↔stop. */
export interface RecordLifecycle {
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<void>;
}

/**
 * Acquire the display stream in the gesture for the given mode and start a
 * recording. The audio:true request is tried first; if it rejects (a surface that
 * cannot supply audio leaves Share greyed / rejects), the SAME surface is retried
 * with audio:false BEFORE any cancel notice. Only if BOTH requests reject is a
 * visible notice surfaced and the page returned to idle without downloading.
 * Returns the granted stream on success, or null if acquisition was rejected on
 * both attempts.
 */
const acquireStream = async (
  mode: RecordPageMode,
  deps: RecordLifecycleDeps,
): Promise<MediaStream | null> => {
  const constraints = displayMediaConstraintsForMode(mode);
  try {
    return await deps.getDisplayMedia(constraints);
  } catch (audioError) {
    // The audio:true request failed -- a surface that cannot supply audio leaves
    // Share disabled / rejects. Retry the SAME surface with no audio BEFORE
    // surfacing any cancel notice.
    try {
      return await deps.getDisplayMedia(withoutAudio(constraints));
    } catch (noAudioError) {
      const e = noAudioError as Error;
      deps.setStatus(
        `Screen-share cancelled: ${e?.name ?? 'UnknownError'} — ${e?.message ?? 'no message'}`,
      );
      deps.onStateChange('idle');
      return null;
    }
  }
};

/**
 * Build the record page's shared start/stop/download lifecycle for a mode. Both
 * the whole-window mode ('window-cropped') and the single-tab / Firefox mode
 * ('default') use THIS lifecycle; the only difference is the requested surface.
 * `start` acquires the stream (with the no-audio retry) and begins recording;
 * `stop` finalizes the recorder, derives the filename, downloads the blob, and
 * returns the page to done/idle. Holding the session in the closure (not module
 * state) is what makes the SAME stop fire the session's stop + download for BOTH
 * modes -- the window session is never discarded and Stop is never hardwired to
 * the tab path.
 */
export const createRecordLifecycle = (
  mode: RecordPageMode,
  deps: RecordLifecycleDeps,
): RecordLifecycle => {
  let stream: MediaStream | null = null;
  let session: { stop: () => Promise<Blob> } | null = null;

  const start = async (): Promise<void> => {
    const granted = await acquireStream(mode, deps);
    if (granted === null) return;

    stream = granted;
    session = deps.createRecordingSession(granted);
    deps.onStateChange('recording');
    deps.setStatus(
      granted.getAudioTracks().length > 0
        ? 'Recording (with shared audio)...'
        : 'Recording (video only)...',
    );

    // If the user stops sharing via the browser's native control, treat it as a
    // Stop click so the recording is finalized and downloaded.
    for (const track of granted.getVideoTracks()) {
      track.addEventListener?.('ended', () => {
        void stop();
      });
    }
  };

  const stop = async (): Promise<void> => {
    if (!session || !stream) return;

    deps.onStateChange('processing');
    deps.setStatus('Processing recording...');

    const currentSession = session;
    const currentStream = stream;
    session = null;
    stream = null;

    try {
      const blob = await currentSession.stop();
      const format: 'mp4' | 'webm' = blob.type.includes('mp4') ? 'mp4' : 'webm';
      const filename = formatRecordingFilename(new Date(), format);
      // Firefox's chrome.downloads.download REJECTS data: URLs; it only accepts
      // http(s) and blob: schemes. blob: works on Chrome too, so it is the
      // cross-target choice. Revoke after a delay so the download has time to be
      // consumed -- revoking immediately can race with the download dispatch.
      const blobUrl = URL.createObjectURL(blob);
      try {
        await deps.download({ url: blobUrl, filename });
      } finally {
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      }
      deps.setStatus(`Saved ${filename}. You can close this tab.`);
      deps.onStateChange('done');
    } catch (error) {
      const e = error as Error;
      deps.setStatus(`Failed to save: ${e?.message ?? 'unknown error'}`);
      deps.onStateChange('idle');
    } finally {
      currentStream.getTracks().forEach((t) => t.stop());
    }
  };

  return { start, stop };
};

// ---------------------------------------------------------------------------
// DOM composition root (only runs in the real record page)
// ---------------------------------------------------------------------------

// Resolved by bootstrapRecordPage() when running inside the real record page.
// Left unbound when the module is imported in a non-DOM context (unit tests
// exercise the exported seams directly, never the DOM composition root).
let button!: HTMLButtonElement;
let status!: HTMLParagraphElement;

let state: State = 'idle';

// renderButton ONLY updates the button. Status text is owned by the lifecycle so
// a notice/error message survives the state -> idle transition.
const renderButton = (): void => {
  switch (state) {
    case 'idle':
      button.textContent = 'Pick & Start Recording';
      button.disabled = false;
      break;
    case 'recording':
      button.textContent = 'Stop Recording';
      button.disabled = false;
      break;
    case 'processing':
      button.textContent = 'Processing...';
      button.disabled = true;
      break;
    case 'done':
      button.disabled = true;
      break;
  }
};

/**
 * Wire the record page's DOM composition root. Runs only inside the real record
 * page (a document with the expected elements). Guarded so importing this module
 * in a non-DOM unit-test context is side-effect free -- the exported seams
 * (createRecordLifecycle, displayMediaConstraintsForMode) are tested directly.
 */
const bootstrapRecordPage = (): void => {
  if (typeof document === 'undefined') return;
  const buttonEl = document.getElementById('action-button') as HTMLButtonElement | null;
  const statusEl = document.getElementById('status') as HTMLParagraphElement | null;
  if (buttonEl === null || statusEl === null) return;

  button = buttonEl;
  status = statusEl;

  // Honest scope banner: the record page is the window-region capture host for
  // the whole session, so the indicator is shown for as long as this surface is
  // open. It stays present/accurate across every in-window tab switch because
  // there is ONE window stream and ONE indicator. Absence of the element is
  // tolerated so importing this module never hard-fails on an unexpected DOM.
  const indicatorEl = document.getElementById('recording-region-indicator');
  if (indicatorEl !== null) {
    renderRecordingRegionIndicator(indicatorEl, true);
  }

  // The mic / virtual-audio-device (BlackHole) options are a Firefox-only
  // workaround (Mozilla Bug 1541425). On Chromium, getDisplayMedia captures
  // window/system audio directly, so hide the whole block. Absence of the element
  // is tolerated so importing this module never hard-fails on an unexpected DOM.
  const audioOptionsEl = document.getElementById('audio-options');
  if (audioOptionsEl !== null) {
    const capability = detectRecordingCapability(
      globalThis as unknown as ProbeGlobals,
    );
    audioOptionsEl.hidden = !shouldShowMicAudioOptions(capability);
  }

  // Route on the mode the popup flagged via ?mode=. With no flag this is the
  // single-tab / Firefox tab path (displaySurface:'browser'); with
  // mode=window-cropped the SAME lifecycle records the whole window
  // (displaySurface:'window'). Both share ONE stop/download path.
  const mode = recordPageModeFromSearch(
    typeof location === 'undefined' ? '' : location.search,
  );
  const lifecycle = createRecordLifecycle(mode, {
    getDisplayMedia: (constraints) => navigator.mediaDevices.getDisplayMedia(constraints),
    createRecordingSession: createMediaRecorderSession,
    download: (args) => chrome.downloads.download(args),
    setStatus: (text) => { status.textContent = text; },
    onStateChange: (next) => {
      state = next;
      renderButton();
    },
  });

  button.addEventListener('click', () => {
    if (state === 'idle') {
      void lifecycle.start();
    } else if (state === 'recording') {
      void lifecycle.stop();
    }
  });

  status.textContent = 'Ready';
  renderButton();
};

bootstrapRecordPage();
