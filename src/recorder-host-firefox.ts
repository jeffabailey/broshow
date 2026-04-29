// ---------------------------------------------------------------------------
// FirefoxBackgroundRecorderHost adapter (RED scaffold -- DELIVER wave)
// ---------------------------------------------------------------------------
// Hosts MediaRecorder + mp4-mux directly inside the Firefox MV3 background
// event page. Reuses createOffscreenMessageHandler from offscreen-logic.ts
// with a Firefox-flavored MediaAPIs adapter (only getUserMedia differs --
// it calls navigator.mediaDevices.getDisplayMedia({video:true, audio:true})).
//
// See: ADR-003-firefox-recording-host.md and component-boundaries.md §4.
// Spike obligation S-1: validate the user-gesture chain on Firefox 121 ESR
// before declaring US-FF-02 done (architecture-design.md §6.1).
// ---------------------------------------------------------------------------

import type { RecorderHost } from './recorder-host';

export const __SCAFFOLD__ = true;

/**
 * Factory for the Firefox MV3 background event page recorder host.
 * Software-crafter implements with a swapped MediaAPIs.getUserMedia adapter
 * that calls navigator.mediaDevices.getDisplayMedia.
 */
export const createFirefoxBackgroundRecorderHost = (): RecorderHost => {
  throw new Error(
    'Not yet implemented -- RED scaffold (createFirefoxBackgroundRecorderHost)',
  );
};
