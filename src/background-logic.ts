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
  readonly createOffscreenDocument: (streamId: string) => Promise<void>;
  readonly closeOffscreenDocument: () => Promise<void>;
  readonly sendMessageToOffscreen: (message: SWToOffscreen) => Promise<OffscreenToSW>;
  readonly downloadFile: (url: string, filename: string) => Promise<void>;
  readonly getRecordingData: () => Promise<string | null>;
  readonly clearRecordingData: () => Promise<void>;
  readonly broadcastState: (state: RecordingState) => void;
  readonly now: () => number;
  readonly setTimeout: (callback: () => void, ms: number) => number;
  readonly clearTimeout: (id: number) => void;
};

/** How long (ms) the SW waits for offscreen-result/error before recovering. */
export const PROCESSING_TIMEOUT_MS = 30_000;

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
  let processingTimeoutId: number | null = null;

  const clearProcessingTimeout = () => {
    if (processingTimeoutId !== null) {
      apis.clearTimeout(processingTimeoutId);
      processingTimeoutId = null;
    }
  };

  const startProcessingTimeout = () => {
    clearProcessingTimeout();
    processingTimeoutId = apis.setTimeout(async () => {
      processingTimeoutId = null;
      if (state.status !== 'processing') return;
      state = { status: 'idle' };
      await apis.closeOffscreenDocument();
      apis.broadcastState(state);
    }, PROCESSING_TIMEOUT_MS);
  };

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

        // Effect: create offscreen document with streamId in URL.
        // The offscreen document self-starts recording on load, avoiding
        // unreliable SW→offscreen message delivery for the start command.
        if (result.offscreenMessage && result.offscreenMessage.type === 'offscreen-start') {
          apis.createOffscreenDocument(result.offscreenMessage.streamId).catch(() => {
            // Offscreen creation failed; handled by offscreen-error
          });
        }

        return result.response;
      }

      case 'stop-recording': {
        // Pure: compute state transition
        const result = handleStopRecording(state);
        state = result.newState;

        // Effect: start timeout to recover if offscreen never responds
        if (state.status === 'processing') {
          startProcessingTimeout();
        }

        // Effect: send stop to offscreen. The offscreen's sendResponse callback
        // is the guaranteed delivery path. Process the response asynchronously
        // so the popup gets 'processing' immediately.
        if (result.offscreenMessage) {
          apis.sendMessageToOffscreen(result.offscreenMessage)
            .then((response) => {
              // Guard: skip if already handled (timeout fired or broadcast arrived first)
              if (state.status !== 'processing') return;
              return handleMessage(response as Message);
            })
            .catch(() => {
              // Offscreen messaging failure handled by timeout recovery
            });
        }

        return result.response;
      }

      case 'offscreen-result': {
        // Guard: ignore if already idle (duplicate from broadcast + sendResponse)
        if (state.status === 'idle') return handleGetState(state);

        clearProcessingTimeout();
        // Pure: compute state transition
        const result = handleOffscreenResult(state, message);
        state = result.newState;

        // Effect: get recording data (from message fallback or storage), download, clean up
        const dataUrl = message.dataUrl ?? await apis.getRecordingData();
        if (!dataUrl) {
          await apis.closeOffscreenDocument();
          apis.broadcastState(state);
          return { type: 'error', message: 'Recording data missing from storage' };
        }
        const filename = `brorecord-recording.${message.format}`;
        await apis.downloadFile(dataUrl, filename);
        await apis.clearRecordingData();
        await apis.closeOffscreenDocument();

        // Push idle state to popup (it can't poll for this)
        apis.broadcastState(state);

        return handleGetState(state);
      }

      case 'offscreen-error': {
        // Guard: ignore if already idle (duplicate from broadcast + sendResponse)
        if (state.status === 'idle') return handleGetState(state);

        clearProcessingTimeout();
        // Pure: compute state transition
        const result = handleOffscreenError(state, message);
        state = result.newState;

        // Effect: close offscreen document
        await apis.closeOffscreenDocument();

        // Push idle state to popup
        apis.broadcastState(state);

        return result.response;
      }

      // Messages that the SW sends or offscreen handshake -- ignore
      case 'state-update':
      case 'error':
      case 'fallback-notice':
      case 'offscreen-start':
      case 'offscreen-stop':
      case 'offscreen-ready':
        return handleGetState(state);
    }
  };

  return handleMessage;
};
