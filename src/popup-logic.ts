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

// --- Port type for sending messages ----------------------------------------

type SendMessage = (message: PopupToSW) => Promise<SWToPopup>;

// --- Minimal element interfaces for testability ----------------------------

interface ButtonElement {
  textContent: string;
  disabled: boolean;
  addEventListener(event: string, handler: () => void): void;
}

interface StatusElement {
  textContent: string;
}

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

/** Map a PopupAction to the corresponding message for the service worker. */
export const messageForAction = (action: PopupAction): PopupToSW => {
  switch (action) {
    case 'start':
      return { type: 'start-recording' };
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
      return null;
  }
};

// --- Wiring function -------------------------------------------------------

/**
 * Initialize the popup by querying state and wiring button clicks.
 * Dependencies are injected as parameters for testability.
 */
export const initializePopup = async (
  button: ButtonElement,
  status: StatusElement,
  sendMessage: SendMessage,
): Promise<void> => {
  // Query current state from service worker
  const response = await sendMessage({ type: 'get-state' });
  let currentAction = handleResponse(button, status, response);

  // Wire button click to send appropriate message
  button.addEventListener('click', async () => {
    if (currentAction === null) return;

    const message = messageForAction(currentAction);
    const clickResponse = await sendMessage(message);
    currentAction = handleResponse(button, status, clickResponse);
  });
};
