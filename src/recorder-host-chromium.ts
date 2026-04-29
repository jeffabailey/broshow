// ---------------------------------------------------------------------------
// ChromiumOffscreenRecorderHost adapter
// ---------------------------------------------------------------------------
// Wraps the existing chrome.offscreen.createDocument + offscreen.ts MediaAPIs
// pipeline behind the RecorderHost port (see ./recorder-host.ts).
// Per component-boundaries.md §3.2, this is a refactor of existing behavior
// -- no new business logic. hadAudioTrack is always true on Chromium because
// chrome.tabCapture currently always includes audio (data-models.md §4.1).
// ---------------------------------------------------------------------------

import type { OffscreenToSW, SWToOffscreen } from './types';
import type { HostStartInput, HostStartResult, HostStopResult, RecorderHost } from './recorder-host';

/**
 * Effectful dependencies required by the Chromium offscreen recorder host.
 * These are the raw chrome.* effects extracted from background.ts so the
 * adapter can be unit-tested with stubs.
 */
export type ChromiumDeps = {
  readonly createOffscreenDocument: (streamId: string) => Promise<void>;
  readonly closeOffscreenDocument: () => Promise<void>;
  readonly sendMessageToOffscreen: (message: SWToOffscreen) => Promise<OffscreenToSW>;
  readonly getRecordingData: () => Promise<string | null>;
};

/**
 * Default dependencies that bind to the real chrome.* globals lazily.
 * Exists so background.ts can construct the adapter once at module load
 * without paying for the chrome lookup until start/stop is called.
 */
export const createDefaultChromiumDeps = (): ChromiumDeps => ({
  createOffscreenDocument: async (streamId: string) => {
    const stored = await chrome.storage.local.get('forceWebmFallback');
    const forceFlag = stored.forceWebmFallback === true ? '&forceWebmFallback=1' : '';
    if (forceFlag) {
      // Clear the flag so it only applies once per test.
      await chrome.storage.local.remove('forceWebmFallback');
    }
    return chrome.offscreen.createDocument({
      url: `offscreen.html?streamId=${encodeURIComponent(streamId)}${forceFlag}`,
      reasons: [
        chrome.offscreen.Reason.USER_MEDIA,
        chrome.offscreen.Reason.DISPLAY_MEDIA,
        chrome.offscreen.Reason.BLOBS,
      ],
      justification: 'Recording tab audio/video and converting blob to data URL',
    });
  },

  closeOffscreenDocument: async () => {
    try {
      await chrome.offscreen.closeDocument();
    } catch {
      // Document may have been auto-closed by Chrome already
    }
  },

  sendMessageToOffscreen: (message: SWToOffscreen) =>
    chrome.runtime.sendMessage(message) as Promise<OffscreenToSW>,

  getRecordingData: async () => {
    const result = await chrome.storage.local.get('recordingData');
    return (result.recordingData as string) ?? null;
  },
});

/**
 * Factory for the Chromium offscreen-document recorder host.
 *
 * `start` is fire-and-forget on the offscreen-document creation effect,
 * mirroring the existing behavior in background.ts where errors propagate
 * via the offscreen-error message path rather than the start return value.
 *
 * `stop` sends `offscreen-stop` to the offscreen document, awaits the
 * response, and shapes the result for the RecorderHost port. It does NOT
 * close the offscreen document -- the SW handler still owns the close
 * lifecycle to preserve close-once semantics.
 */
export const createChromiumOffscreenRecorderHost = (
  deps: ChromiumDeps,
): RecorderHost => {
  const start = async (input: HostStartInput): Promise<HostStartResult> => {
    if (input.target !== 'chromium') {
      throw new Error(
        `ChromiumOffscreenRecorderHost received non-chromium input: ${input.target}`,
      );
    }
    // Fire-and-forget: createOffscreenDocument failures surface through the
    // offscreen-error message path, matching the existing background.ts flow.
    Promise.resolve()
      .then(() => deps.createOffscreenDocument(input.streamId))
      .catch(() => {
        // Offscreen creation failed; handled by offscreen-error message path
      });
    // chrome.tabCapture currently always provides an audio track on Chromium.
    return { ok: true, hadAudioTrack: true };
  };

  const stop = async (): Promise<HostStopResult> => {
    try {
      const response = await deps.sendMessageToOffscreen({ type: 'offscreen-stop' });
      if (response.type === 'offscreen-result') {
        const dataUrl = response.dataUrl ?? (await deps.getRecordingData()) ?? '';
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

  return { start, stop };
};
