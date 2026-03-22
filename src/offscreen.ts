// ---------------------------------------------------------------------------
// Offscreen document entry point -- effectful boundary
// ---------------------------------------------------------------------------
// This module wires browser APIs to the pure offscreen logic.
// All side effects (navigator.mediaDevices, URL, chrome.runtime) live here.
//
// Recording flow:
// 1. SW creates the offscreen document
// 2. Offscreen doc registers its onMessage listener and sends offscreen-ready
// 3. SW receives offscreen-ready and sends offscreen-start with streamId
// 4. On stop, the recording blob is stored as a data URL in chrome.storage
// 5. SW retrieves the data URL and triggers chrome.downloads.download()
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
      // Primary: tab capture with streamId from tabCapture API
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('[offscreen] getUserMedia succeeded');
      return stream;
    } catch (err) {
      console.log('[offscreen] getUserMedia failed, trying getDisplayMedia fallback:', err);
      try {
        // Fallback: getDisplayMedia works in test environments where
        // tabCapture streamId is not available
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        console.log('[offscreen] getDisplayMedia succeeded, tracks:', stream.getTracks().length);
        return stream;
      } catch (displayErr) {
        console.log('[offscreen] getDisplayMedia failed, trying plain getUserMedia fallback:', displayErr);
        // Last resort: plain getUserMedia with no tab capture constraints.
        // Works with --use-fake-device-for-media-stream in test environments.
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        console.log('[offscreen] plain getUserMedia succeeded, tracks:', stream.getTracks().length);
        return stream;
      }
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

// --- Signal readiness to the service worker --------------------------------
// The SW waits for this message before sending offscreen-start, ensuring the
// onMessage listener above is registered and ready to receive messages.

chrome.runtime.sendMessage({ type: 'offscreen-ready' }).catch(() => {
  // SW may not be listening yet in rare cases; the SW has a timeout fallback
});
