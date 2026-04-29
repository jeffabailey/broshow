// ---------------------------------------------------------------------------
// Popup entry point -- wires pure logic to DOM and chrome APIs
// ---------------------------------------------------------------------------
// This is the "effects at boundaries" adapter. All logic lives in popup-logic.
//
// The popup holds the user gesture context required by
// chrome.tabCapture.getMediaStreamId(). The streamId is obtained here when
// the user clicks Start, then passed through the message to the service worker.
// ---------------------------------------------------------------------------

import { initializePopup, type CapabilityCheckResult } from './popup-logic';
import type { PopupToSW, SWToPopup } from './types';

/**
 * Probe for the chromium-only APIs the recorder pipeline depends on.
 * Firefox accepts the manifest's `tabCapture`/`offscreen` permissions as
 * warnings only and ships the extension without the corresponding APIs, so a
 * runtime probe is the only honest signal that recording will actually work.
 */
const checkRecordingCapability = (): CapabilityCheckResult => {
  const offscreenAPI = (chrome as unknown as { offscreen?: { createDocument?: unknown } }).offscreen;
  if (typeof offscreenAPI?.createDocument !== 'function') {
    return {
      supported: false,
      reason:
        'Recording is not supported in this browser. BroShow uses the Chromium-only offscreen and tab-capture APIs. Use Chrome, Edge, Brave, or another Chromium-based browser.',
    };
  }
  if (typeof chrome.tabCapture?.getMediaStreamId !== 'function') {
    return { supported: false, reason: 'Tab capture is not available in this browser.' };
  }
  return { supported: true };
};

const button = document.getElementById('action-button') as HTMLButtonElement;
const status = document.getElementById('status') as HTMLParagraphElement;
const fallbackNotice = document.getElementById('fallback-notice') as HTMLParagraphElement;

const sendMessage = (message: PopupToSW): Promise<SWToPopup> =>
  chrome.runtime.sendMessage(message);

/**
 * Find the target tab to capture. The active tab in the current window is the
 * tab the user has focused; in the real popup overlay this is the content tab.
 * If `chrome.tabCapture.getMediaStreamId` is later called against an
 * uncapturable target (e.g., a chrome:// page), Chrome rejects with a clear
 * error that the caller surfaces to the user — we don't filter URLs here, and
 * we don't request the `tabs` or `activeTab` permission to read tab metadata
 * (per `design/technology-stack.md` Permissions section).
 */
const getTargetTabId = async (): Promise<number> => {
  const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = activeTabs[0];
  if (activeTab?.id == null) throw new Error('No active tab found');
  return activeTab.id;
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

initializePopup(
  button,
  status,
  sendMessage,
  getStreamId,
  onMessage,
  fallbackNotice,
  checkRecordingCapability,
);
