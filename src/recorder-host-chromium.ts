// ---------------------------------------------------------------------------
// ChromiumOffscreenRecorderHost adapter (RED scaffold -- DELIVER wave)
// ---------------------------------------------------------------------------
// Wraps the existing chrome.offscreen.createDocument + offscreen.ts MediaAPIs
// pipeline behind the RecorderHost port (see ./recorder-host.ts).
// Per component-boundaries.md §3.2, this is a refactor of existing behavior
// -- no new business logic. hadAudioTrack is always true on Chromium because
// chrome.tabCapture currently always includes audio.
// ---------------------------------------------------------------------------

import type { RecorderHost } from './recorder-host';

export const __SCAFFOLD__ = true;

/**
 * Factory for the Chromium offscreen-document recorder host.
 * Software-crafter wires the existing chrome.offscreen + chrome.tabCapture
 * adapters from background.ts into this factory.
 */
export const createChromiumOffscreenRecorderHost = (): RecorderHost => {
  throw new Error(
    'Not yet implemented -- RED scaffold (createChromiumOffscreenRecorderHost)',
  );
};
