// ---------------------------------------------------------------------------
// Offscreen document entry point -- effectful boundary
// ---------------------------------------------------------------------------
// This module wires browser APIs to the pure offscreen logic.
// All side effects (navigator.mediaDevices, URL, chrome.runtime) live here.
// ---------------------------------------------------------------------------

import type { SWToOffscreen } from './types';
import { createOffscreenMessageHandler } from './offscreen-logic';
import type { MediaAPIs } from './offscreen-logic';

// --- Browser API adapters --------------------------------------------------

const mediaAPIs: MediaAPIs = {
  getUserMedia: (constraints: MediaStreamConstraints) =>
    navigator.mediaDevices.getUserMedia(constraints),

  isTypeSupported: (mimeType: string) =>
    MediaRecorder.isTypeSupported(mimeType),

  createObjectURL: (blob: Blob) =>
    URL.createObjectURL(blob),

  sendMessage: (message) =>
    chrome.runtime.sendMessage(message),
};

// --- Message listener ------------------------------------------------------

const handleMessage = createOffscreenMessageHandler(mediaAPIs, MediaRecorder);

chrome.runtime.onMessage.addListener(
  (message: SWToOffscreen, _sender, _sendResponse) => {
    handleMessage(message).catch((error: unknown) => {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error('BroRecord offscreen error:', errorMessage);
    });

    // No async response needed -- results are sent via chrome.runtime.sendMessage
    return false;
  },
);

console.log('BroRecord offscreen document loaded');
