// ---------------------------------------------------------------------------
// Pure popup logic — no DOM, no chrome APIs
// ---------------------------------------------------------------------------
// This module contains the pure core of popup behavior:
// - Mapping RecordingState to UI descriptions
// - Mapping user actions to messages
// - Wiring function that connects DOM elements to pure logic
// ---------------------------------------------------------------------------

import type { RecordingState, PopupToSW, SWToPopup } from './types';

// --- Types -----------------------------------------------------------------

export type PopupAction = 'start' | 'stop';

export type UIDescription = {
  readonly buttonLabel: string;
  readonly buttonAction: PopupAction | null;
  readonly statusText: string;
  readonly buttonDisabled: boolean;
};

// --- Port types for injected dependencies ----------------------------------

type SendMessage = (message: PopupToSW) => Promise<SWToPopup>;
type GetStreamId = () => Promise<string>;
type OnMessage = (handler: (message: SWToPopup) => void) => void;

/**
 * The recording path selected by the runtime feature-detect probe.
 *
 * - `chromium-offscreen`: Chromium pipeline using chrome.offscreen +
 *   chrome.tabCapture (the original BroShow path).
 * - `firefox-display-media`: Firefox pipeline using
 *   navigator.mediaDevices.getDisplayMedia + MediaRecorder hosted in the
 *   background page.
 *
 * See `docs/feature/firefox-recording-support/design/data-models.md` §2.
 */
export type RecordingPath = 'chromium-offscreen' | 'firefox-display-media';

export type CapabilityCheckResult =
  | { readonly supported: true; readonly path: 'chromium-offscreen' }
  | { readonly supported: true; readonly path: 'firefox-display-media' }
  | { readonly supported: false; readonly reason: string };

type CapabilityCheck = () => CapabilityCheckResult;

// --- Probe globals shape ---------------------------------------------------

/**
 * Minimal shape of the global environment the capability probe inspects.
 * Injected as a parameter so the probe is a pure function over its inputs --
 * no `globalThis` reference inside, fully testable with fake globals.
 */
export interface ProbeGlobals {
  readonly chrome?: {
    readonly offscreen?: { readonly createDocument?: unknown };
    readonly tabCapture?: { readonly getMediaStreamId?: unknown };
  };
  readonly navigator?: {
    readonly mediaDevices?: { readonly getDisplayMedia?: unknown };
  };
}

const isFunction = (value: unknown): boolean => typeof value === 'function';

/**
 * Pure feature-detect probe. Order matters: Chromium first (preserves the
 * original BroShow behavior on Chromium), then Firefox getDisplayMedia,
 * otherwise unsupported.
 *
 * No I/O, no global access -- the only inputs are the injected `globals`
 * argument. This is the inner wheel of the popup capability check; the
 * outer adapter in `src/popup.ts` calls this with the real globalThis.
 */
export const detectRecordingCapability = (
  globals: ProbeGlobals,
): CapabilityCheckResult => {
  const offscreenCreate = globals.chrome?.offscreen?.createDocument;
  const tabCaptureGetId = globals.chrome?.tabCapture?.getMediaStreamId;
  if (isFunction(offscreenCreate) && isFunction(tabCaptureGetId)) {
    return { supported: true, path: 'chromium-offscreen' };
  }

  const getDisplayMedia = globals.navigator?.mediaDevices?.getDisplayMedia;
  if (isFunction(getDisplayMedia)) {
    return { supported: true, path: 'firefox-display-media' };
  }

  return {
    supported: false,
    reason:
      'Recording is not supported in this browser. BroShow needs either Chromium offscreen + tab-capture APIs or Firefox screen-sharing. Use Chrome, Edge, Brave, Firefox 121+, or another supported browser.',
  };
};

// --- Minimal element interfaces for testability ----------------------------

interface ButtonElement {
  textContent: string;
  disabled: boolean;
  addEventListener(event: string, handler: () => void): void;
}

interface StatusElement {
  textContent: string;
}

interface FallbackNoticeElement {
  textContent: string;
  hidden: boolean;
}

interface FirefoxHintElement {
  textContent: string;
  hidden: boolean;
}

/**
 * Exact AC-FF-04 hint copy. The popup surfaces this when the probe
 * reports the firefox-display-media path so the user knows the
 * surface picker (tab/window/screen) is about to open.
 */
const FIREFOX_HINT_TEXT =
  'Firefox will ask you to choose a tab, window, or screen';

// --- Pure functions --------------------------------------------------------

/** Map a RecordingState to a description of what the UI should show. */
export const describeUI = (state: RecordingState): UIDescription => {
  switch (state.status) {
    case 'idle':
      return {
        buttonLabel: 'Start Recording',
        buttonAction: 'start',
        statusText: 'Ready to record',
        buttonDisabled: false,
      };
    case 'recording':
      return {
        buttonLabel: 'Stop Recording',
        buttonAction: 'stop',
        statusText: 'Recording...',
        buttonDisabled: false,
      };
    case 'processing':
      return {
        buttonLabel: 'Processing...',
        buttonAction: null,
        statusText: 'Processing recording...',
        buttonDisabled: true,
      };
  }
};

/** Map a PopupAction to the corresponding message for the service worker.
 *  The 'start' action requires a streamId obtained from tabCapture. */
export const messageForAction = (action: PopupAction, streamId?: string): PopupToSW => {
  switch (action) {
    case 'start':
      return { type: 'start-recording', streamId: streamId ?? '' };
    case 'stop':
      return { type: 'stop-recording' };
  }
};

/** Apply a UIDescription to DOM elements. */
const applyUI = (
  button: ButtonElement,
  status: StatusElement,
  ui: UIDescription,
): void => {
  button.textContent = ui.buttonLabel;
  button.disabled = ui.buttonDisabled;
  status.textContent = ui.statusText;
};

/** Interpret a SWToPopup response, updating DOM elements accordingly. */
const handleResponse = (
  button: ButtonElement,
  status: StatusElement,
  fallbackNotice: FallbackNoticeElement,
  response: SWToPopup,
): PopupAction | null => {
  switch (response.type) {
    case 'state-update': {
      const ui = describeUI(response.state);
      applyUI(button, status, ui);
      return ui.buttonAction;
    }
    case 'error':
      status.textContent = `Error: ${response.message}`;
      return null;
    case 'fallback-notice':
      status.textContent = `Note: ${response.message}`;
      fallbackNotice.textContent = response.message;
      fallbackNotice.hidden = false;
      return null;
  }
};

// --- Wiring function -------------------------------------------------------

/**
 * Initialize the popup by querying state and wiring button clicks.
 * Dependencies are injected as parameters for testability.
 *
 * getStreamId is called when the user clicks Start -- the popup has the user
 * gesture context required by chrome.tabCapture.getMediaStreamId().
 */
export const initializePopup = async (
  button: ButtonElement,
  status: StatusElement,
  sendMessage: SendMessage,
  getStreamId: GetStreamId,
  onMessage?: OnMessage,
  fallbackNoticeElement?: FallbackNoticeElement,
  capabilityCheck?: CapabilityCheck,
  firefoxHintElement?: FirefoxHintElement,
): Promise<void> => {
  // Bail before any wiring if the runtime lacks the APIs the recorder needs
  // (e.g., Firefox has no chrome.offscreen / chrome.tabCapture). Shows the
  // user a clear message instead of letting the SW path get stuck on the
  // never-resolving offscreen handshake.
  if (capabilityCheck) {
    const capability = capabilityCheck();
    if (!capability.supported) {
      button.disabled = true;
      button.textContent = 'Not supported';
      status.textContent = `Error: ${capability.reason}`;
      return;
    }
    // On the Firefox path, surface the AC-FF-04 hint so the user knows the
    // surface picker (tab/window/screen) is about to appear. Chromium path
    // leaves the hint untouched (hidden by default).
    if (capability.path === 'firefox-display-media' && firefoxHintElement) {
      firefoxHintElement.textContent = FIREFOX_HINT_TEXT;
      firefoxHintElement.hidden = false;
    }
  }

  // Provide a no-op fallback notice element when none is supplied (backwards-compatible).
  const fallbackNotice: FallbackNoticeElement = fallbackNoticeElement ?? {
    textContent: '',
    hidden: true,
  };

  // Query current state from service worker
  const response = await sendMessage({ type: 'get-state' });
  let currentAction = handleResponse(button, status, fallbackNotice, response);

  // Wire button click to send appropriate message
  button.addEventListener('click', async () => {
    if (currentAction === null) return;

    try {
      // For start action, obtain the streamId from the popup's user gesture context
      let streamId: string | undefined;
      if (currentAction === 'start') {
        streamId = await getStreamId();
      }

      const message = messageForAction(currentAction, streamId);
      const clickResponse = await sendMessage(message);
      currentAction = handleResponse(button, status, fallbackNotice, clickResponse);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      status.textContent = `Error: ${errorMessage}`;
    }
  });

  // Listen for pushed state updates from the service worker
  // (e.g., when processing completes after stop-recording)
  onMessage?.((message) => {
    currentAction = handleResponse(button, status, fallbackNotice, message);
  });
};
