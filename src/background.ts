// ---------------------------------------------------------------------------
// Background service worker entry point -- effectful boundary
// ---------------------------------------------------------------------------
// This module wires chrome APIs to the pure background logic.
// All side effects (chrome.*, console.*) live here at the edge.
//
// Per docs/feature/firefox-recording-support/design/component-boundaries.md §3
// the offscreen-document lifecycle (create/stop/close) is encapsulated by the
// ChromiumOffscreenRecorderHost adapter. The state-machine logic stays in
// createMessageHandler; only the offscreen-effect calls are routed through
// the adapter so a sibling adapter (FirefoxBackgroundRecorderHost, step 02-01)
// can plug in without touching the pure core.
// ---------------------------------------------------------------------------

import type { OffscreenToSW, SWToOffscreen, Message } from './types';
import { createMessageHandler } from './background-logic';
import type { ChromeAPIs } from './background-logic';
import {
  createChromiumOffscreenRecorderHost,
  createDefaultChromiumDeps,
} from './recorder-host-chromium';
import type { HostStopResult } from './recorder-host';

// --- Chromium offscreen recorder host (port-routed effects) ---------------

const chromiumDeps = createDefaultChromiumDeps();
const chromiumHost = createChromiumOffscreenRecorderHost(chromiumDeps);

/**
 * Convert a HostStopResult back to the OffscreenToSW shape that
 * createMessageHandler already knows how to handle. Keeps the SW state
 * machine target-blind.
 */
const hostResultToOffscreenMessage = (result: HostStopResult): OffscreenToSW => {
  if (result.ok) {
    return { type: 'offscreen-result', format: result.format, dataUrl: result.dataUrl };
  }
  return result.fallbackDataUrl !== undefined
    ? { type: 'offscreen-error', error: 'Mp4 conversion failed', fallbackDataUrl: result.fallbackDataUrl }
    : { type: 'offscreen-error', error: 'Mp4 conversion failed' };
};

// --- Chrome API adapters ---------------------------------------------------

const chromeAPIs: ChromeAPIs = {
  getActiveTab: async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    return tab?.id != null ? { id: tab.id } : null;
  },

  // start-recording effect routed through chromiumHost.start so the SW state
  // machine stays target-blind. Returns void to match the existing port shape.
  createOffscreenDocument: async (streamId: string) => {
    const result = await chromiumHost.start({ target: 'chromium', streamId });
    if (!result.ok) {
      // Picker-cancelled is a Firefox concern; on Chromium start always
      // resolves with ok:true. Defensive throw if a future change breaks
      // that invariant.
      throw new Error(`ChromiumOffscreenRecorderHost.start failed: ${result.cause}`);
    }
  },

  closeOffscreenDocument: chromiumDeps.closeOffscreenDocument,

  // stop-recording effect routed through chromiumHost.stop, which encapsulates
  // sendMessage + response shaping. Other SW->offscreen messages bypass the
  // host (none today; offscreen-stop is the only message in SWToOffscreen
  // besides offscreen-start, which the offscreen doc auto-receives via URL).
  sendMessageToOffscreen: async (message: SWToOffscreen) => {
    if (message.type === 'offscreen-stop') {
      const hostResult = await chromiumHost.stop();
      return hostResultToOffscreenMessage(hostResult);
    }
    return chromiumDeps.sendMessageToOffscreen(message);
  },

  downloadFile: async (url: string, filename: string) => {
    console.log('[sw] downloadFile called:', url.slice(0, 80), filename);
    await chrome.downloads.download({ url, filename });
  },

  getRecordingData: chromiumDeps.getRecordingData,

  clearRecordingData: () => chrome.storage.local.remove('recordingData'),

  broadcastState: (state) => {
    chrome.runtime.sendMessage({ type: 'state-update', state }).catch(() => {
      // Popup may be closed — ignore
    });
  },

  broadcastFallbackNotice: (message) => {
    chrome.runtime.sendMessage({ type: 'fallback-notice', message }).catch(() => {
      // Popup may be closed — ignore
    });
  },

  broadcastError: (message) => {
    chrome.runtime.sendMessage({ type: 'error', message }).catch(() => {
      // Popup may be closed — ignore
    });
  },

  setBadge: (text, color) => {
    chrome.action.setBadgeText({ text });
    if (color) {
      chrome.action.setBadgeBackgroundColor({ color });
    }
  },

  now: () => Date.now(),

  setTimeout: (callback: () => void, ms: number) => self.setTimeout(callback, ms),
  clearTimeout: (id: number) => self.clearTimeout(id),
};

// --- Message listener ------------------------------------------------------

const handleMessage = createMessageHandler(chromeAPIs);

chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse) => {
    console.log('[sw] Received message:', JSON.stringify(message));
    handleMessage(message)
      .then((response) => {
        console.log('[sw] Handled message:', message.type, '-> response:', response?.type);
        sendResponse(response);
      })
      .catch((error: unknown) => {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        console.error('[sw] Error handling message:', message.type, errorMessage);
        sendResponse({ type: 'error', message: errorMessage });
      });

    // Return true to indicate async response
    return true;
  },
);

console.log('BroShow service worker loaded');
