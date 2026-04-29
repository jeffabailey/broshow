// ---------------------------------------------------------------------------
// Popup entry point -- wires pure logic to DOM and chrome APIs
// ---------------------------------------------------------------------------
// Two distinct paths converge here:
//
// 1. Chromium offscreen: tabCapture streamId is acquired in the popup's
//    user-gesture window, then forwarded through start-recording to the SW
//    which orchestrates the offscreen document.
//
// 2. Firefox display-media: the popup origin (moz-extension://...) is not
//    allowed to call getDisplayMedia ("not allowed in the current context")
//    and the background event page can't carry the user gesture either.
//    Per ADR-003 Option B, the popup opens record.html in a new browser
//    window where getDisplayMedia is permitted; that window owns the
//    recording lifecycle. See src/record.ts.
// ---------------------------------------------------------------------------

import {
  detectRecordingCapability,
  initializePopup,
  type CapabilityCheckResult,
  type ProbeGlobals,
} from './popup-logic';
import type { PopupToSW, SWToPopup } from './types';

const checkRecordingCapability = (): CapabilityCheckResult =>
  detectRecordingCapability(globalThis as ProbeGlobals);

const button = document.getElementById('action-button') as HTMLButtonElement;
const status = document.getElementById('status') as HTMLParagraphElement;
const fallbackNotice = document.getElementById('fallback-notice') as HTMLParagraphElement;

const setupFirefoxPopupRecorder = (
  buttonEl: HTMLButtonElement,
  statusEl: HTMLParagraphElement,
): void => {
  buttonEl.textContent = 'Open Recorder';
  statusEl.textContent =
    'Firefox requires a tab context for recording. Click to open the recorder.';
  buttonEl.addEventListener('click', () => {
    chrome.windows
      .create({
        url: chrome.runtime.getURL('record.html'),
        type: 'popup',
        width: 520,
        height: 280,
      })
      .then(() => {
        // Closing the toolbar popup gives the new window full focus.
        window.close();
      })
      .catch((e: unknown) => {
        const err = e as Error;
        statusEl.textContent = `Failed to open recorder: ${err?.message ?? 'unknown error'}`;
      });
  });
};

// --- Chromium path adapters (existing) ------------------------------------

const sendMessage = (message: PopupToSW): Promise<SWToPopup> =>
  chrome.runtime.sendMessage(message);

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
    return '';
  }
};

const onMessage = (handler: (message: SWToPopup) => void) => {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'state-update' || message.type === 'error' || message.type === 'fallback-notice') {
      handler(message);
    }
  });
};

// --- Path dispatch ---------------------------------------------------------

const capability = checkRecordingCapability();

if (capability.supported && capability.path === 'firefox-display-media') {
  setupFirefoxPopupRecorder(button, status);
} else {
  initializePopup(
    button,
    status,
    sendMessage,
    getStreamId,
    onMessage,
    fallbackNotice,
    () => capability,
  );
}
