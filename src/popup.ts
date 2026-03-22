// ---------------------------------------------------------------------------
// Popup entry point -- wires pure logic to DOM and chrome APIs
// ---------------------------------------------------------------------------
// This is the "effects at boundaries" adapter. All logic lives in popup-logic.
// ---------------------------------------------------------------------------

import { initializePopup } from './popup-logic';
import type { PopupToSW, SWToPopup } from './types';

const button = document.getElementById('action-button') as HTMLButtonElement;
const status = document.getElementById('status') as HTMLParagraphElement;

const sendMessage = (message: PopupToSW): Promise<SWToPopup> =>
  chrome.runtime.sendMessage(message);

initializePopup(button, status, sendMessage);
