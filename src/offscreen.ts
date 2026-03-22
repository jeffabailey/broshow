// ---------------------------------------------------------------------------
// Offscreen document entry point -- effectful boundary
// ---------------------------------------------------------------------------
// This module wires browser APIs to the pure offscreen logic.
// All side effects (navigator.mediaDevices, URL, chrome.runtime) live here.
//
// Recording starts when the service worker sends an offscreen-start message
// containing the streamId obtained via tabCapture.getMediaStreamId().
//
// The offscreen document converts the recording blob to a data URL and sends
// it back to the service worker, which uses chrome.downloads.download() to
// save the file. Data URLs survive offscreen document closure.
// ---------------------------------------------------------------------------

import type { SWToOffscreen } from './types';
import { createOffscreenMessageHandler } from './offscreen-logic';
import type { MediaAPIs } from './offscreen-logic';
import { createMediaRecorderSession } from './mp4';

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
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('[offscreen] getUserMedia succeeded');
      return stream;
    } catch (err) {
      console.log('[offscreen] getUserMedia failed, trying getDisplayMedia fallback:', err);
      // Fallback: getDisplayMedia works in test environments where
      // tabCapture streamId is not available
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      console.log('[offscreen] getDisplayMedia succeeded, tracks:', stream.getTracks().length);
      return stream;
    }
  },

  storeRecording: async (blob: Blob) => {
    const dataUrl = await blobToDataUrl(blob);
    await chrome.storage.local.set({ recordingData: dataUrl });
  },

  sendMessage: (message) =>
    chrome.runtime.sendMessage(message),
};

// --- Create handler (recording starts when offscreen-start message arrives) -

const handleMessage = createOffscreenMessageHandler(mediaAPIs, createMediaRecorderSession);

// --- Message listener (handles stop and any late start messages) -----------
// Returns true for offscreen-stop to keep the message channel open during
// async blob-to-data-URL conversion, preventing Chrome from auto-closing
// the offscreen document before processing completes.

chrome.runtime.onMessage.addListener(
  (message: SWToOffscreen, _sender, sendResponse) => {
    // Only handle offscreen-targeted messages; ignore popup/SW messages
    // to avoid intercepting responses meant for other listeners.
    if (message.type !== 'offscreen-start' && message.type !== 'offscreen-stop') {
      return false;
    }

    console.log('[offscreen] Received message:', JSON.stringify(message));

    if (message.type === 'offscreen-stop') {
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
    }

    // offscreen-start: fire-and-forget, don't block the sender
    handleMessage(message).then(() => {
      console.log('[offscreen] Start handled successfully');
    }).catch((error: unknown) => {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error('[offscreen] Error handling start:', errorMessage);
    });
    return false;
  },
);

// Offscreen document loaded and ready for messages
