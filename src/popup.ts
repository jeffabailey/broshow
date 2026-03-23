// ---------------------------------------------------------------------------
// Popup entry point -- wires pure logic to DOM and chrome APIs
// ---------------------------------------------------------------------------
// This is the "effects at boundaries" adapter. All logic lives in popup-logic.
//
// The popup holds the user gesture context required by
// chrome.tabCapture.getMediaStreamId(). The streamId is obtained here when
// the user clicks Start, then passed through the message to the service worker.
// ---------------------------------------------------------------------------

import { initializePopup } from './popup-logic';
import type { PopupToSW, SWToPopup } from './types';

const button = document.getElementById('action-button') as HTMLButtonElement;
const status = document.getElementById('status') as HTMLParagraphElement;

const sendMessage = (message: PopupToSW): Promise<SWToPopup> =>
  chrome.runtime.sendMessage(message);

/**
 * Find the target tab to capture. In the real popup overlay, the active tab
 * in the current window is the one to capture. In test mode (popup loaded
 * as a page), we look for the active non-extension tab.
 */
const getTargetTabId = async (): Promise<number> => {
  // First try: active tab in current window (works in real popup overlay)
  const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = activeTabs[0];

  // If active tab is a content page, use it directly
  if (activeTab?.id != null && activeTab.url && !activeTab.url.startsWith('chrome')) {
    return activeTab.id;
  }

  // Fallback (test mode): popup is a tab, so find the most recent content tab
  const allTabs = await chrome.tabs.query({ currentWindow: true });
  const contentTab = allTabs.find(
    (t) => t.id != null && t.url && !t.url.startsWith('chrome'),
  );
  if (contentTab?.id == null) throw new Error('No active tab found');
  return contentTab.id;
};

const getStreamId = async (): Promise<string> => {
  try {
    const targetTabId = await getTargetTabId();
    return await chrome.tabCapture.getMediaStreamId({ targetTabId });
  } catch {
    // In test environments, tabCapture may not be available.
    // Return empty streamId; the offscreen doc will fall back to getDisplayMedia.
    return '';
  }
};

const onMessage = (handler: (message: import('./types').SWToPopup) => void) => {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'state-update' || message.type === 'error' || message.type === 'fallback-notice') {
      handler(message);
    }
  });
};

initializePopup(button, status, sendMessage, getStreamId, onMessage);
