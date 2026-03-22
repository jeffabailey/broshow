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
};

export type OffscreenErrorOutcome = {
  readonly newState: RecordingState;
  readonly response: SWToPopup;
};

// --- Port types for chrome API dependencies --------------------------------

export type ChromeAPIs = {
  readonly getActiveTab: () => Promise<{ id: number } | null>;
  readonly createOffscreenDocument: () => Promise<void>;
  readonly closeOffscreenDocument: () => Promise<void>;
  readonly sendMessageToOffscreen: (message: SWToOffscreen) => Promise<void>;
  readonly downloadFile: (url: string, filename: string) => Promise<void>;
  readonly getRecordingData: () => Promise<string | null>;
  readonly clearRecordingData: () => Promise<void>;
  readonly now: () => number;
};

// --- Pure functions --------------------------------------------------------

/** Create the initial idle state. */
export const createInitialState = (): RecordingState => ({ status: 'idle' });

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

/** Handle an offscreen-result message. Pure state transition.
 *  The offscreen document handles the download directly -- no blob data in the message. */
export const handleOffscreenResult = (
  _state: RecordingState,
  _message: Extract<OffscreenToSW, { type: 'offscreen-result' }>,
): OffscreenResultOutcome => ({
  newState: { status: 'idle' },
});

/** Handle an offscreen-error message. Pure state transition. */
export const handleOffscreenError = (
  _state: RecordingState,
  message: Extract<OffscreenToSW, { type: 'offscreen-error' }>,
): OffscreenErrorOutcome => ({
  newState: { status: 'idle' },
  response: { type: 'error', message: message.error },
});

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
        // Effect: get active tab (for recording metadata)
        const tab = await apis.getActiveTab();
        if (!tab) {
          return { type: 'error', message: 'No active tab found' };
        }

        // streamId is provided by the popup (which has the user gesture context)
        const { streamId } = message;

        // Pure: compute state transition
        const result = handleStartRecording(state, tab.id, streamId, apis.now());
        state = result.newState;

        // Effect: create offscreen document and tell it to start capturing
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

        // Effect: read recording data from storage, download, clean up, close offscreen
        const dataUrl = await apis.getRecordingData();
        if (dataUrl) {
          const filename = `brorecord-recording.${message.format}`;
          await apis.downloadFile(dataUrl, filename);
          await apis.clearRecordingData();
        }
        await apis.closeOffscreenDocument();

        return handleGetState(state);
      }

      case 'offscreen-error': {
        // Pure: compute state transition
        const result = handleOffscreenError(state, message);
        state = result.newState;

        // Effect: close offscreen document
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
