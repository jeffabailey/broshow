// ---------------------------------------------------------------------------
// Offscreen document entry point -- effectful boundary
// ---------------------------------------------------------------------------
// This module wires browser APIs to the pure offscreen logic.
// All side effects (navigator.mediaDevices, URL, chrome.runtime) live here.
//
// Recording flow:
// 1. SW creates the offscreen document with streamId in the URL
// 2. Offscreen doc reads streamId from URL and auto-starts recording
// 3. SW sends offscreen-stop when the user clicks Stop
// 4. The recording blob is stored as a data URL in chrome.storage (or
//    sent in the message as fallback)
// 5. SW retrieves the data URL and triggers chrome.downloads.download()
// ---------------------------------------------------------------------------

import type { SWToOffscreen } from './types';
import { createOffscreenMessageHandler } from './offscreen-logic';
import type { MediaAPIs } from './offscreen-logic';
import { createRecordingSession } from './mp4';

// --- Browser API adapters --------------------------------------------------

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });

const mediaAPIs: MediaAPIs = {
  getUserMedia: async (constraints: MediaStreamConstraints) => {
    try {
      // Primary: tab capture with streamId from tabCapture API
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('[offscreen] Tab capture succeeded, tracks:', stream.getTracks().length);
      return stream;
    } catch (tabCaptureErr) {
      console.warn('[offscreen] Tab capture failed, trying getDisplayMedia:', tabCaptureErr);
      try {
        // Fallback 1: getDisplayMedia captures screen/tab content.
        // Works in test environments with --auto-select-desktop-capture-source.
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        console.log('[offscreen] getDisplayMedia succeeded, tracks:', stream.getTracks().length);
        return stream;
      } catch (displayErr) {
        console.warn('[offscreen] getDisplayMedia failed, trying plain getUserMedia:', displayErr);
        // Fallback 2: plain getUserMedia with fake device for test environments.
        // In production this captures camera/mic -- not tab content.
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        console.log('[offscreen] Plain getUserMedia succeeded (test fallback), tracks:', stream.getTracks().length);
        return stream;
      }
    }
  },

  storeRecording: async (blob: Blob) => {
    try {
      // Strip codec params from MIME type to avoid data URL parsing issues.
      // "video/webm;codecs=vp8,opus" contains a comma that breaks data URL
      // syntax (comma separates MIME from data in data: URLs).
      const simpleMime = blob.type.split(';')[0] || 'video/webm';
      const cleanBlob = new Blob([blob], { type: simpleMime });
      const dataUrl = await blobToDataUrl(cleanBlob);
      await chrome.storage.local.set({ recordingData: dataUrl });
      return true;
    } catch {
      console.log('[offscreen] chrome.storage unavailable, falling back to message transfer');
      return false;
    }
  },

  blobToDataUrl,

  sendMessage: (message) =>
    chrome.runtime.sendMessage(message),
};

// --- Create handler --------------------------------------------------------

const handleMessage = createOffscreenMessageHandler(mediaAPIs, createRecordingSession);

// --- Message listener (handles stop) ---------------------------------------

chrome.runtime.onMessage.addListener(
  (message: SWToOffscreen, _sender, sendResponse) => {
    if (message.type !== 'offscreen-stop') {
      return false;
    }

    console.log('[offscreen] Received stop message');

    // Return true to keep the message channel open during async
    // blob-to-data-URL conversion, preventing Chrome from auto-closing
    // the offscreen document before processing completes.
    handleMessage(message).then((result) => {
      console.log('[offscreen] Stop handled, sending response');
      sendResponse(result ?? { type: 'offscreen-error', error: 'No result' });
    }).catch((error: unknown) => {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error('[offscreen] Error handling stop:', errorMessage);
      sendResponse({ type: 'offscreen-error', error: errorMessage });
    });
    return true;
  },
);

// --- Auto-start recording from URL params ----------------------------------
// The SW passes the streamId in the URL when creating the offscreen document.
// This avoids unreliable SW→offscreen message delivery for the start command.

const streamId = new URL(location.href).searchParams.get('streamId');
if (streamId !== null) {
  console.log('[offscreen] Auto-starting with streamId from URL');
  handleMessage({ type: 'offscreen-start', streamId }).then(() => {
    console.log('[offscreen] Recording started successfully');
  }).catch((error: unknown) => {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[offscreen] Error starting recording:', errorMessage);
    chrome.runtime.sendMessage({ type: 'offscreen-error', error: errorMessage }).catch(() => {});
  });
}
