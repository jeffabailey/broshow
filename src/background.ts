// ---------------------------------------------------------------------------
// Background service worker entry point -- effectful boundary
// ---------------------------------------------------------------------------
// This module wires chrome APIs to the pure background logic.
// All side effects (chrome.*, console.*) live here at the edge.
// ---------------------------------------------------------------------------

import type { SWToOffscreen, Message } from './types';
import { createMessageHandler } from './background-logic';
import type { ChromeAPIs } from './background-logic';

// --- Chrome API adapters ---------------------------------------------------

const chromeAPIs: ChromeAPIs = {
  getActiveTab: async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    return tab?.id != null ? { id: tab.id } : null;
  },

  createOffscreenDocument: async (streamId: string) => {
    const stored = await chrome.storage.local.get('forceWebmFallback');
    const forceFlag = stored.forceWebmFallback === true ? '&forceWebmFallback=1' : '';
    if (forceFlag) {
      // Clear the flag so it only applies once per test.
      await chrome.storage.local.remove('forceWebmFallback');
    }
    return chrome.offscreen.createDocument({
      url: `offscreen.html?streamId=${encodeURIComponent(streamId)}${forceFlag}`,
      reasons: [chrome.offscreen.Reason.USER_MEDIA, chrome.offscreen.Reason.DISPLAY_MEDIA, chrome.offscreen.Reason.BLOBS],
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
    chrome.runtime.sendMessage(message),

  downloadFile: async (url: string, filename: string) => {
    console.log('[sw] downloadFile called:', url.slice(0, 80), filename);
    await chrome.downloads.download({ url, filename });
  },

  getRecordingData: async () => {
    const result = await chrome.storage.local.get('recordingData');
    return (result.recordingData as string) ?? null;
  },

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
