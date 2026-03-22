// ---------------------------------------------------------------------------
// Pure background logic -- no chrome APIs, no side effects
// ---------------------------------------------------------------------------
// This module contains the pure core of service worker behavior:
// - State transitions for recording lifecycle
// - Message handling logic
// - Wiring function that connects chrome APIs to pure logic
// ---------------------------------------------------------------------------

import type {
  RecordingState,
  PopupToSW,
  SWToPopup,
  SWToOffscreen,
  OffscreenToSW,
  Message,
} from './types';

// --- Result types for state transitions ------------------------------------

export type StartResult = {
  readonly newState: RecordingState;
  readonly response: SWToPopup;
  readonly offscreenMessage: SWToOffscreen | null;
};

export type StopResult = {
  readonly newState: RecordingState;
  readonly response: SWToPopup;
  readonly offscreenMessage: SWToOffscreen | null;
};

export type OffscreenResultOutcome = {
  readonly newState: RecordingState;
  readonly download: { readonly url: string; readonly filename: string } | null;
};

export type OffscreenErrorOutcome = {
  readonly newState: RecordingState;
  readonly response: SWToPopup;
  readonly download: { readonly url: string; readonly filename: string } | null;
};

// --- Port types for chrome API dependencies --------------------------------

export type ChromeAPIs = {
  readonly getActiveTab: () => Promise<{ id: number } | null>;
  readonly getMediaStreamId: (tabId: number) => Promise<string>;
  readonly createOffscreenDocument: () => Promise<void>;
  readonly closeOffscreenDocument: () => Promise<void>;
  readonly sendMessageToOffscreen: (message: SWToOffscreen) => Promise<void>;
  readonly downloadFile: (url: string, filename: string) => Promise<void>;
  readonly now: () => number;
};

// --- Pure functions --------------------------------------------------------

/** Create the initial idle state. */
export const createInitialState = (): RecordingState => ({ status: 'idle' });

/** Build a recording filename with format extension. */
const buildFilename = (format: 'mp4' | 'webm'): string =>
  `brorecord-recording.${format}`;

/** Respond to a get-state query with the current state. */
export const handleGetState = (state: RecordingState): SWToPopup => ({
  type: 'state-update',
  state,
});

/** Handle a start-recording request. Pure state transition. */
export const handleStartRecording = (
  state: RecordingState,
  tabId: number,
  streamId: string,
  startTime: number,
): StartResult => {
  if (state.status !== 'idle') {
    return {
      newState: state,
      response: { type: 'error', message: 'Already recording' },
      offscreenMessage: null,
    };
  }

  const newState: RecordingState = {
    status: 'recording',
    tabId,
    startTime,
  };

  return {
    newState,
    response: { type: 'state-update', state: newState },
    offscreenMessage: { type: 'offscreen-start', streamId },
  };
};

/** Handle a stop-recording request. Pure state transition. */
export const handleStopRecording = (state: RecordingState): StopResult => {
  if (state.status !== 'recording') {
    return {
      newState: state,
      response: { type: 'error', message: 'Not recording' },
      offscreenMessage: null,
    };
  }

  const newState: RecordingState = { status: 'processing' };

  return {
    newState,
    response: { type: 'state-update', state: newState },
    offscreenMessage: { type: 'offscreen-stop' },
  };
};

/** Handle an offscreen-result message. Pure state transition. */
export const handleOffscreenResult = (
  state: RecordingState,
  message: Extract<OffscreenToSW, { type: 'offscreen-result' }>,
): OffscreenResultOutcome => ({
  newState: { status: 'idle' },
  download: {
    url: message.blobUrl,
    filename: buildFilename(message.format),
  },
});

/** Handle an offscreen-error message. Pure state transition. */
export const handleOffscreenError = (
  state: RecordingState,
  message: Extract<OffscreenToSW, { type: 'offscreen-error' }>,
): OffscreenErrorOutcome => {
  if (message.fallbackBlobUrl) {
    return {
      newState: { status: 'idle' },
      response: {
        type: 'fallback-notice',
        message: 'MP4 encoding failed. Saved as WebM instead.',
      },
      download: {
        url: message.fallbackBlobUrl,
        filename: buildFilename('webm'),
      },
    };
  }

  return {
    newState: { status: 'idle' },
    response: { type: 'error', message: message.error },
    download: null,
  };
};

// --- Wiring function -------------------------------------------------------

/**
 * Create a message handler that wires chrome API effects to pure state logic.
 * Dependencies are injected as parameters for testability.
 */
export const createMessageHandler = (apis: ChromeAPIs) => {
  let state: RecordingState = createInitialState();

  const handleMessage = async (message: Message): Promise<SWToPopup> => {
    switch (message.type) {
      case 'get-state':
        return handleGetState(state);

      case 'start-recording': {
        // Effect: get active tab
        const tab = await apis.getActiveTab();
        if (!tab) {
          return { type: 'error', message: 'No active tab found' };
        }

        // Effect: get media stream ID
        const streamId = await apis.getMediaStreamId(tab.id);

        // Pure: compute state transition
        const result = handleStartRecording(state, tab.id, streamId, apis.now());
        state = result.newState;

        // Effect: create offscreen document and forward stream ID
        if (result.offscreenMessage) {
          await apis.createOffscreenDocument();
          await apis.sendMessageToOffscreen(result.offscreenMessage);
        }

        return result.response;
      }

      case 'stop-recording': {
        // Pure: compute state transition
        const result = handleStopRecording(state);
        state = result.newState;

        // Effect: send stop to offscreen
        if (result.offscreenMessage) {
          await apis.sendMessageToOffscreen(result.offscreenMessage);
        }

        return result.response;
      }

      case 'offscreen-result': {
        // Pure: compute state transition
        const result = handleOffscreenResult(state, message);
        state = result.newState;

        // Effect: trigger download and close offscreen
        if (result.download) {
          await apis.downloadFile(result.download.url, result.download.filename);
        }
        await apis.closeOffscreenDocument();

        return handleGetState(state);
      }

      case 'offscreen-error': {
        // Pure: compute state transition
        const result = handleOffscreenError(state, message);
        state = result.newState;

        // Effect: trigger fallback download if available, close offscreen
        if (result.download) {
          await apis.downloadFile(result.download.url, result.download.filename);
        }
        await apis.closeOffscreenDocument();

        return result.response;
      }

      // Messages that the SW sends (not receives) -- ignore
      case 'state-update':
      case 'error':
      case 'fallback-notice':
      case 'offscreen-start':
      case 'offscreen-stop':
        return handleGetState(state);
    }
  };

  return handleMessage;
};
