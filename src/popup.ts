// ---------------------------------------------------------------------------
// Popup entry point -- wires pure logic to DOM and chrome APIs
// ---------------------------------------------------------------------------
// Two distinct paths converge here:
//
// 1. Chromium offscreen: tabCapture streamId is acquired in the popup's
//    user-gesture window, then forwarded through start-recording to the SW
//    which orchestrates the offscreen document.
//
// 2. Firefox display-media: getDisplayMedia must be invoked from within the
//    popup's user-gesture click handler -- a Firefox MV3 background event
//    page does NOT carry the gesture across runtime.sendMessage. So the
//    popup hosts the entire recording lifecycle locally (getDisplayMedia +
//    MediaRecorder + mp4-muxer + chrome.downloads.download). The SW is
//    bypassed for Firefox. Trade-off: closing the popup terminates the
//    recording. Documented in popup status copy.
// ---------------------------------------------------------------------------

import {
  detectRecordingCapability,
  initializePopup,
  type CapabilityCheckResult,
  type ProbeGlobals,
} from './popup-logic';
import { createRecordingSession } from './mp4';
import { formatRecordingFilename } from './background-logic';
import type { PopupToSW, SWToPopup } from './types';

const checkRecordingCapability = (): CapabilityCheckResult =>
  detectRecordingCapability(globalThis as ProbeGlobals);

const button = document.getElementById('action-button') as HTMLButtonElement;
const status = document.getElementById('status') as HTMLParagraphElement;
const fallbackNotice = document.getElementById('fallback-notice') as HTMLParagraphElement;

// --- Firefox popup-hosted recorder ----------------------------------------
// Lives entirely inside the popup. Closing the popup ends the recording.

type FirefoxState = 'idle' | 'recording' | 'processing';

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });

const setupFirefoxPopupRecorder = (
  buttonEl: HTMLButtonElement,
  statusEl: HTMLParagraphElement,
): void => {
  let stream: MediaStream | null = null;
  let session: ReturnType<typeof createRecordingSession> | null = null;
  let state: FirefoxState = 'idle';

  const renderUI = (): void => {
    switch (state) {
      case 'idle':
        buttonEl.textContent = 'Start Recording';
        buttonEl.disabled = false;
        statusEl.textContent = 'Ready to record. Keep this popup open while recording.';
        break;
      case 'recording':
        buttonEl.textContent = 'Stop Recording';
        buttonEl.disabled = false;
        statusEl.textContent = 'Recording... Do not close this popup.';
        break;
      case 'processing':
        buttonEl.textContent = 'Processing...';
        buttonEl.disabled = true;
        statusEl.textContent = 'Processing recording...';
        break;
    }
  };

  const startRecording = async (): Promise<void> => {
    console.log('[ff-popup] startRecording: invoking getDisplayMedia');
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      console.log('[ff-popup] startRecording: stream acquired',
        stream.getVideoTracks().length, 'video tracks,',
        stream.getAudioTracks().length, 'audio tracks');
      session = createRecordingSession(stream);
      state = 'recording';
      renderUI();
    } catch (error) {
      const e = error as Error;
      console.log('[ff-popup] startRecording: REJECTED', { name: e?.name, message: e?.message, error: e });
      statusEl.textContent = `getDisplayMedia rejected: ${e?.name ?? 'UnknownError'} — ${e?.message ?? 'no message'}`;
      state = 'idle';
      buttonEl.disabled = false;
      buttonEl.textContent = 'Start Recording';
    }
  };

  const stopRecording = async (): Promise<void> => {
    if (!session || !stream) return;

    state = 'processing';
    renderUI();

    const currentSession = session;
    const currentStream = stream;
    session = null;
    stream = null;

    try {
      const blob = await currentSession.stop();
      const dataUrl = await blobToDataUrl(blob);
      const format = blob.type.includes('mp4') ? 'mp4' : 'webm';
      const filename = formatRecordingFilename(new Date(), format);
      await chrome.downloads.download({ url: dataUrl, filename });
      statusEl.textContent = `Saved ${filename}`;
    } catch (error) {
      const e = error as Error;
      statusEl.textContent = `Error: ${e?.message ?? 'failed to save recording'}`;
    } finally {
      currentStream.getTracks().forEach((t) => t.stop());
      state = 'idle';
      buttonEl.textContent = 'Start Recording';
      buttonEl.disabled = false;
    }
  };

  buttonEl.addEventListener('click', async () => {
    if (state === 'idle') {
      await startRecording();
    } else if (state === 'recording') {
      await stopRecording();
    }
  });

  renderUI();
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
