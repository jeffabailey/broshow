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
  RecordingPath,
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

export type OffscreenFallbackOutcome = {
  readonly newState: RecordingState;
  readonly fallbackNotice: SWToPopup;
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
  readonly broadcastFallbackNotice: (message: string) => void;
  readonly broadcastError: (message: string) => void;
  readonly setBadge: (text: string, color?: string) => void;
  readonly now: () => number;
  readonly setTimeout: (callback: () => void, ms: number) => number;
  readonly clearTimeout: (id: number) => void;
};

/** How long (ms) the SW waits for offscreen-result/error before recovering. */
export const PROCESSING_TIMEOUT_MS = 30_000;

/** Recording badge color — visible red on the Chrome toolbar. */
export const BADGE_RECORDING_COLOR = '#D32F2F';

// --- Pure functions --------------------------------------------------------

/** Pad a number to two digits with a leading zero if needed. */
const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * Format a recording filename using the user's local time.
 * Pattern: broshow-YYYY-MM-DD-HHmmss.{ext}
 * Pure function — no side effects, fully deterministic given the same Date.
 */
export const formatRecordingFilename = (
  date: Date,
  extension: 'mp4' | 'webm',
): string => {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1); // getMonth() is 0-indexed
  const day = pad2(date.getDate());
  const hours = pad2(date.getHours());
  const minutes = pad2(date.getMinutes());
  const seconds = pad2(date.getSeconds());
  return `broshow-${year}-${month}-${day}-${hours}${minutes}${seconds}.${extension}`;
};

/** Map a RecordingState to the badge text and optional background color.
 *  Recording → 'REC' with red background; all other states → '' (cleared). */
export const badgeFor = (state: RecordingState): { text: string; color?: string } => {
  switch (state.status) {
    case 'recording':
      return { text: 'REC', color: BADGE_RECORDING_COLOR };
    case 'idle':
    case 'processing':
      return { text: '' };
  }
};

/** Create the initial idle state. */
export const createInitialState = (): RecordingState => ({ status: 'idle' });

/** Respond to a get-state query with the current state. */
export const handleGetState = (state: RecordingState): SWToPopup => ({
  type: 'state-update',
  state,
});

/**
 * Handle a start-recording request. Pure state transition.
 *
 * The `path` discriminant is carried through (record-all-tabs R1-cropped,
 * data-models.md §5) so the SW stays target-blind while distinguishing which
 * pipeline owns the recorder:
 *   - 'chromium-offscreen' (and any target-bearing path): the SW orchestrates an
 *     offscreen document, so it emits an `offscreen-start` message.
 *   - 'window-cropped': the RECORD PAGE owns the recorder (it acquired the
 *     stream in its own gesture). The SW only flips state + badge; it mints NO
 *     offscreen document. Same RecordingState graph -- no new node, no
 *     tabs.onActivated handler.
 */
export const handleStartRecording = (
  state: RecordingState,
  tabId: number,
  streamId: string,
  startTime: number,
  path: RecordingPath = 'chromium-offscreen',
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

  // The window-cropped pipeline runs its recorder in the record page; the SW
  // must not orchestrate an offscreen document for it.
  const offscreenMessage: SWToOffscreen | null =
    path === 'window-cropped' ? null : { type: 'offscreen-start', streamId };

  return {
    newState,
    response: { type: 'state-update', state: newState },
    offscreenMessage,
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

/** Handle an offscreen-error message that carries a WebM fallback blob.
 *  Pure state transition — returns the fallback-notice to broadcast. */
export const handleOffscreenFallback = (
  _state: RecordingState,
): OffscreenFallbackOutcome => ({
  newState: { status: 'idle' },
  fallbackNotice: {
    type: 'fallback-notice',
    message: 'Mp4 conversion failed; downloaded as WebM instead.',
  },
});

// --- Wiring function -------------------------------------------------------

/**
 * Create a message handler that wires chrome API effects to pure state logic.
 * Dependencies are injected as parameters for testability.
 */
export const createMessageHandler = (apis: ChromeAPIs) => {
  let state: RecordingState = createInitialState();
  let processingTimeoutId: number | null = null;

  // Single seam for the recurring badge effect: project the state to its badge
  // (pure badgeFor) and push it through the chrome API. Collapses the repeated
  // `const b = badgeFor(state); apis.setBadge(b.text, b.color)` pairs below.
  const applyBadge = (current: RecordingState): void => {
    const badge = badgeFor(current);
    apis.setBadge(badge.text, badge.color);
  };

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
      applyBadge(state);
      await apis.closeOffscreenDocument();
      apis.broadcastError(
        'Recording timed out: the recorder did not finish within the expected time. This commonly happens on browsers that do not support the offscreen API (e.g., Firefox).',
      );
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

        // streamId is provided by the popup on the Chromium path only
        // (it has the user-gesture context for chrome.tabCapture). On the
        // Firefox path the message has no streamId; the host runs
        // getDisplayMedia internally. Use empty string as the wire-level
        // sentinel; the recorder-host adapter discards streamId on Firefox.
        // background-logic stays target-blind: it just forwards whatever
        // streamId arrives (or '') through the existing offscreen-start
        // contract.
        const streamId = 'streamId' in message ? message.streamId : '';

        // Carry the path discriminant so the window-cropped pipeline (recorder
        // owned by the record page) flips state + badge WITHOUT the SW minting
        // an offscreen document. Target-bearing paths keep the offscreen flow.
        const path: RecordingPath = 'path' in message ? message.path : 'chromium-offscreen';

        // Pure: compute state transition
        const result = handleStartRecording(state, tab.id, streamId, apis.now(), path);
        state = result.newState;

        // Effect: update badge to reflect new recording state
        applyBadge(state);

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

        // Effect: update badge to reflect new processing/idle state
        applyBadge(state);

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

        // Effect: clear badge now that recording is done
        applyBadge(state);

        // Effect: get recording data (from message fallback or storage), download, clean up
        const dataUrl = message.dataUrl ?? await apis.getRecordingData();
        if (!dataUrl) {
          await apis.closeOffscreenDocument();
          apis.broadcastState(state);
          return { type: 'error', message: 'Recording data missing from storage' };
        }
        const filename = formatRecordingFilename(new Date(apis.now()), message.format);
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

        // Resolve the WebM fallback data URL: either inline in the message (when
        // chrome.storage was unavailable in the offscreen doc) or from storage
        // (the normal path when offscreen-logic stored the fallback blob).
        const inlineFallbackUrl = message.fallbackDataUrl;
        const storedFallbackUrl = inlineFallbackUrl === undefined
          ? await apis.getRecordingData()
          : null;
        const fallbackDataUrl = inlineFallbackUrl ?? storedFallbackUrl;

        // If the offscreen doc provides a WebM fallback (mp4 mux failed but WebM
        // was captured), download the WebM and notify the popup with a fallback-notice
        // instead of a hard error.
        if (fallbackDataUrl !== null) {
          const fallbackResult = handleOffscreenFallback(state);
          state = fallbackResult.newState;

          // Effect: clear badge on transition to idle via fallback path
          applyBadge(state);

          await apis.downloadFile(fallbackDataUrl, formatRecordingFilename(new Date(apis.now()), 'webm'));
          await apis.clearRecordingData();
          await apis.closeOffscreenDocument();
          apis.broadcastState(state);
          apis.broadcastFallbackNotice(fallbackResult.fallbackNotice.message);
          return fallbackResult.fallbackNotice;
        }

        // Pure: compute state transition for a hard error (no fallback available)
        const result = handleOffscreenError(state, message);
        state = result.newState;

        // Effect: clear badge on transition to idle via error path
        applyBadge(state);

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
