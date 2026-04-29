// ---------------------------------------------------------------------------
// FirefoxBackgroundRecorderHost adapter
// ---------------------------------------------------------------------------
// Hosts MediaRecorder + mp4-mux directly inside the Firefox MV3 background
// event page. Composition over duplication: reuses createOffscreenMessageHandler
// from offscreen-logic.ts with a Firefox-flavored MediaAPIs adapter whose
// getUserMedia calls navigator.mediaDevices.getDisplayMedia({video,audio}).
//
// Design references:
//   - docs/feature/firefox-recording-support/design/component-boundaries.md §3-§4
//   - docs/feature/firefox-recording-support/design/data-models.md §3
//   - ADR-003-firefox-recording-host.md
//
// Picker cancellation (NotAllowedError) is mapped to a non-error variant
// { ok: false, cause: 'picker-cancelled' } per design D10. Other errors
// rethrow and surface through the existing offscreen-error path.
//
// track.ended (FR-FF-04): when the user clicks Firefox's "stop sharing"
// button the captured video track ends; the adapter triggers the same
// stop-and-download flow as an explicit stop().
// ---------------------------------------------------------------------------

import type { OffscreenToSW } from './types';
import {
  createOffscreenMessageHandler,
  type CreateRecorder,
  type MediaAPIs,
} from './offscreen-logic';
import type {
  HostStartInput,
  HostStartResult,
  HostStopResult,
  RecorderHost,
} from './recorder-host';

// --- Firefox adapter dependencies ------------------------------------------
// All effects are injected as plain functions so the adapter is unit-testable
// with stubs (no mock libraries beyond vi.fn() spies in tests). Default
// bindings to the real navigator/chrome globals are produced by
// createDefaultFirefoxDeps below.

export type FirefoxDeps = {
  readonly getDisplayMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  readonly storeRecording: (blob: Blob) => Promise<boolean>;
  readonly getRecordingData: () => Promise<string | null>;
  readonly blobToDataUrl: (blob: Blob) => Promise<string>;
  readonly sendMessage: (message: OffscreenToSW) => void;
  readonly createRecorder: CreateRecorder;
};

// --- Helpers ---------------------------------------------------------------

const isPickerCancellation = (error: unknown): boolean =>
  error instanceof Error && error.name === 'NotAllowedError';

const computeHadAudioTrack = (stream: MediaStream): boolean =>
  stream.getAudioTracks().length > 0;

// Firefox MediaAPIs adapter: only getUserMedia differs from the chromium
// offscreen adapter. The constraints argument is ignored because Firefox
// does not accept the chromium-style { mandatory: { chromeMediaSource } }
// constraints; it expects the simpler { video: true, audio: true } shape.
const buildFirefoxMediaAPIs = (
  deps: FirefoxDeps,
  onStreamCaptured: (stream: MediaStream) => void,
  onCaptureError: (error: unknown) => void,
): MediaAPIs => ({
  getUserMedia: async (_ignoredConstraints: MediaStreamConstraints) => {
    try {
      const stream = await deps.getDisplayMedia({ video: true, audio: true });
      onStreamCaptured(stream);
      return stream;
    } catch (error) {
      onCaptureError(error);
      throw error;
    }
  },
  storeRecording: deps.storeRecording,
  blobToDataUrl: deps.blobToDataUrl,
  sendMessage: deps.sendMessage,
});

// --- Default deps factory --------------------------------------------------
// Binds to the real navigator + chrome globals lazily so background.ts can
// construct the adapter once at startup without paying for the API lookup
// until start/stop is called. createRecorder is provided by the caller (it
// will be the real createRecordingSession from mp4.ts in production).

export const createDefaultFirefoxDeps = (
  createRecorder: CreateRecorder,
): FirefoxDeps => ({
  getDisplayMedia: (constraints: MediaStreamConstraints) =>
    navigator.mediaDevices.getDisplayMedia(constraints),

  storeRecording: async (blob: Blob) => {
    try {
      // Match the chromium adapter's storage contract so background-logic.ts
      // can read the dataUrl back from chrome.storage.local. Strip codec
      // params from the MIME type to keep the data URL syntactically valid.
      const simpleMime = blob.type.split(';')[0] || 'video/webm';
      const cleanBlob = new Blob([blob], { type: simpleMime });
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read blob'));
        reader.readAsDataURL(cleanBlob);
      });
      await chrome.storage.local.set({ recordingData: dataUrl });
      return true;
    } catch {
      return false;
    }
  },

  getRecordingData: async () => {
    const result = await chrome.storage.local.get('recordingData');
    return (result.recordingData as string) ?? null;
  },

  blobToDataUrl: (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read blob'));
      reader.readAsDataURL(blob);
    }),

  sendMessage: (message: OffscreenToSW) => {
    chrome.runtime.sendMessage(message).catch(() => {
      // Receiver may be absent (no popup open); the message is best-effort.
    });
  },

  createRecorder,
});

// --- Adapter factory -------------------------------------------------------

/**
 * Factory for the Firefox MV3 background event page recorder host.
 *
 * Composes createOffscreenMessageHandler from offscreen-logic.ts with a
 * Firefox-flavored MediaAPIs whose getUserMedia calls getDisplayMedia.
 * Picker cancellation (NotAllowedError) is captured at the boundary and
 * mapped to { ok: false, cause: 'picker-cancelled' }; other errors rethrow.
 *
 * track.ended on the captured video track triggers the same stop flow as
 * an explicit stop() call, satisfying FR-FF-04 ("user stops sharing via
 * the browser-native control").
 */
export const createFirefoxBackgroundRecorderHost = (
  deps: FirefoxDeps,
): RecorderHost => {
  // Closed-over state -- single recording session at a time. The handler
  // also tracks its own session/stream internally; we mirror the stream
  // reference here so we can compute hadAudioTrack and attach the
  // track.ended listener at the port boundary.
  let capturedStream: MediaStream | null = null;
  let captureError: unknown = null;
  let stopFlowInProgress = false;

  // Build the handler ONCE so its closed-over session/stream survives across
  // start->stop. Re-building per-call would lose the session reference.
  const mediaAPIs = buildFirefoxMediaAPIs(
    deps,
    (stream) => {
      capturedStream = stream;
      captureError = null;
    },
    (error) => {
      captureError = error;
    },
  );
  const handleMessage = createOffscreenMessageHandler(mediaAPIs, deps.createRecorder);

  // --- stop ---------------------------------------------------------------
  // Maps the OffscreenToSW response from the handler to the RecorderHost
  // port shape. Parity with createChromiumOffscreenRecorderHost.stop.
  const stop = async (): Promise<HostStopResult> => {
    try {
      const response = await handleMessage({ type: 'offscreen-stop' });
      if (response === undefined) {
        return { ok: false, cause: 'mux-error' };
      }
      if (response.type === 'offscreen-result') {
        // The handler omits dataUrl when storeRecording succeeds (chrome.storage
        // path) and inlines it on the message when storage fails. Mirror the
        // chromium adapter's fallback: prefer message → storage → empty.
        const dataUrl =
          response.dataUrl ?? (await deps.getRecordingData()) ?? '';
        return { ok: true, format: response.format, dataUrl };
      }
      if (response.type === 'offscreen-error') {
        return response.fallbackDataUrl !== undefined
          ? { ok: false, cause: 'mux-error', fallbackDataUrl: response.fallbackDataUrl }
          : { ok: false, cause: 'mux-error' };
      }
      return { ok: false, cause: 'mux-error' };
    } catch {
      return { ok: false, cause: 'mux-error' };
    }
  };

  // --- track.ended handler ------------------------------------------------
  // FR-FF-04: when the user clicks Firefox's "stop sharing" UI, the video
  // track ends. Run the same stop-and-download flow as an explicit stop().
  // We discard the result here; the host owns the download dispatch (added
  // in a later step). For now, simply running stop() finalizes the recorder
  // session and clears the handler's internal state.
  const onTrackEnded = (): void => {
    if (stopFlowInProgress) return;
    stopFlowInProgress = true;
    void stop().finally(() => {
      stopFlowInProgress = false;
    });
  };

  const attachTrackEndedListeners = (stream: MediaStream): void => {
    for (const track of stream.getVideoTracks()) {
      track.addEventListener('ended', onTrackEnded);
    }
  };

  // --- start --------------------------------------------------------------
  const start = async (input: HostStartInput): Promise<HostStartResult> => {
    if (input.target !== 'firefox') {
      throw new Error(
        `FirefoxBackgroundRecorderHost received non-firefox input: ${input.target}`,
      );
    }

    capturedStream = null;
    captureError = null;

    // The handler swallows getUserMedia errors and emits offscreen-error.
    // Our wrapper captures the original error in `captureError` so we can
    // discriminate NotAllowedError (picker-cancelled) from other failures.
    await handleMessage({ type: 'offscreen-start', streamId: 'firefox-getDisplayMedia' });

    if (captureError !== null) {
      if (isPickerCancellation(captureError)) {
        return { ok: false, cause: 'picker-cancelled' };
      }
      throw captureError;
    }

    if (capturedStream === null) {
      // Defensive -- handler succeeded but stream not captured.
      throw new Error('FirefoxBackgroundRecorderHost: stream not captured after start');
    }

    attachTrackEndedListeners(capturedStream);
    return { ok: true, hadAudioTrack: computeHadAudioTrack(capturedStream) };
  };

  return { start, stop };
};
