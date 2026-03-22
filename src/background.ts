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

  getMediaStreamId: (tabId: number) =>
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }),

  createOffscreenDocument: () =>
    chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: [chrome.offscreen.Reason.USER_MEDIA],
      justification: 'Recording tab audio and video',
    }),

  closeOffscreenDocument: () => chrome.offscreen.closeDocument(),

  sendMessageToOffscreen: (message: SWToOffscreen) =>
    chrome.runtime.sendMessage(message),

  downloadFile: async (url: string, filename: string) => {
    await chrome.downloads.download({ url, filename });
  },

  now: () => Date.now(),
};

// --- Message listener ------------------------------------------------------

const handleMessage = createMessageHandler(chromeAPIs);

chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse) => {
    handleMessage(message)
      .then(sendResponse)
      .catch((error: unknown) => {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        console.error('BroRecord service worker error:', errorMessage);
        sendResponse({ type: 'error', message: errorMessage });
      });

    // Return true to indicate async response
    return true;
  },
);

console.log('BroRecord service worker loaded');
