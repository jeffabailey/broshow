// ---------------------------------------------------------------------------
// Popup entry point -- wires pure logic to DOM and chrome APIs
// ---------------------------------------------------------------------------
// Two distinct paths converge here:
//
// 1. Chromium offscreen: tabCapture streamId is acquired in the popup's
//    user-gesture window, then forwarded through start-recording to the SW
//    which orchestrates the offscreen document.
//
// 2. Firefox display-media: the popup origin (moz-extension://...) is not
//    allowed to call getDisplayMedia ("not allowed in the current context")
//    and the background event page can't carry the user gesture either.
//    Per ADR-003 Option B, the popup opens record.html in a new browser
//    window where getDisplayMedia is permitted; that window owns the
//    recording lifecycle. See src/record.ts.
// ---------------------------------------------------------------------------

import {
  detectRecordingCapability,
  initializePopup,
  modeToPath,
  type CapabilityCheckResult,
  type ProbeGlobals,
} from './popup-logic';
import type { PopupToSW, RecordingMode, RecordingPath, SWToPopup } from './types';

const checkRecordingCapability = (): CapabilityCheckResult =>
  detectRecordingCapability(globalThis as ProbeGlobals);

const button = document.getElementById('action-button') as HTMLButtonElement;
const status = document.getElementById('status') as HTMLParagraphElement;
const fallbackNotice = document.getElementById('fallback-notice') as HTMLParagraphElement;

// --- Mode selector (record-all-tabs, ADR-012) ------------------------------
// The popup offers a top-level recording mode. Default selection is
// 'single-tab' so the existing single-tab pipeline stays byte-for-byte
// unchanged until the user opts in (AC1.1). This reader is the edge adapter;
// the user-facing RecordingMode is routed to a wire-level RecordingPath by the
// already-tested pure seam modeToPath (popup-logic.ts, 01-02).

const isRecordingMode = (value: string): value is RecordingMode =>
  value === 'single-tab' || value === 'desktop-screen' || value === 'window-cropped';

const readSelectedMode = (): RecordingMode => {
  const checked = document.querySelector<HTMLInputElement>(
    'input[name="recording-mode"]:checked',
  );
  const value = checked?.value ?? 'single-tab';
  return isRecordingMode(value) ? value : 'single-tab';
};

/** Resolve the user's chosen mode to its wire-level path via the pure seam. */
const selectedPath = (): RecordingPath => modeToPath(readSelectedMode());

/**
 * Shipped launcher path: open record.html in its own browser window so the
 * record page carries the user gesture that getDisplayMedia requires. The popup
 * origin (chrome-extension://... / moz-extension://...) is not allowed to call
 * getDisplayMedia, so the record page is the gesture + preview owner. This is
 * the SAME launcher the Firefox path uses (ADR-003 Option B); the cropped-window
 * mode reuses it (component-boundaries.md §5).
 */
const launchRecordPageWindow = (
  statusEl: HTMLParagraphElement,
  recordPagePath = 'record.html',
): Promise<void> =>
  chrome.windows
    .create({
      url: chrome.runtime.getURL(recordPagePath),
      type: 'popup',
      width: 520,
      height: 280,
    })
    .then(() => {
      // Closing the toolbar popup gives the new window full focus.
      window.close();
    })
    .catch((e: unknown) => {
      const err = e as Error;
      statusEl.textContent = `Failed to open recorder: ${err?.message ?? 'unknown error'}`;
    });

const setupFirefoxPopupRecorder = (
  buttonEl: HTMLButtonElement,
  statusEl: HTMLParagraphElement,
): void => {
  // popup.html ships the button with `disabled` so the chromium path can
  // wait for the SW's get-state response before letting the user click.
  // The Firefox path has no SW round-trip; clear the initial disabled state
  // immediately so the user can click "Open Recorder".
  buttonEl.disabled = false;
  buttonEl.textContent = 'Open Recorder';
  statusEl.textContent =
    'Firefox requires a tab context for recording. Click to open the recorder.';
  buttonEl.addEventListener('click', () => {
    void launchRecordPageWindow(statusEl);
  });
};

// --- Chromium path adapters (existing) ------------------------------------

const sendMessage = (message: PopupToSW): Promise<SWToPopup> =>
  chrome.runtime.sendMessage(message);

const getTargetTabId = async (): Promise<number> => {
  const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = activeTabs[0];
  if (activeTab?.id == null) throw new Error('No active tab found');
  return activeTab.id;
};

const getStreamId = async (): Promise<string> => {
  // The window-cropped mode does not capture a single tab; its stream is
  // acquired in the record page (no popup-side streamId). For every other mode
  // the single-tab pipeline is byte-for-byte unchanged (AC1.1): acquire the
  // tabCapture streamId in the popup's user-gesture window.
  if (selectedPath() === 'window-cropped') {
    return '';
  }
  try {
    const targetTabId = await getTargetTabId();
    return await chrome.tabCapture.getMediaStreamId({ targetTabId });
  } catch {
    return '';
  }
};

const onMessage = (handler: (message: SWToPopup) => void) => {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'state-update' || message.type === 'error' || message.type === 'fallback-notice') {
      handler(message);
    }
  });
};

// --- Window-cropped mode routing (record-all-tabs, ADR-012) ----------------
// When the user selects "Record all tabs (window, cropped)" and clicks Start,
// the popup must route to the record page rather than the single-tab pipeline.
// The record page owns the getDisplayMedia(window) gesture + crop preview; the
// popup origin NEVER calls getDisplayMedia. This routing is TARGET-BLIND -- it
// fires whenever window-cropped is the selected mode, regardless of the
// capability probe's target (component-boundaries.md §4, data-models.md §5).
//
// Registered with `capture: true` so it runs before initializePopup's bubble-
// phase click handler; on the window-cropped path it stops that handler and the
// single-tab/desktop pipelines stay byte-for-byte unchanged (AC1.1).

const setupWindowCroppedRouting = (buttonEl: HTMLButtonElement): void => {
  buttonEl.addEventListener(
    'click',
    (event) => {
      if (readSelectedMode() !== 'window-cropped') return;

      // Window-cropped is selected: take over from the single-tab handler.
      event.stopImmediatePropagation();

      // Tell the SW a window-cropped recording is starting (flip state + REC
      // badge). No streamId, no CropRect on the wire (data-models.md §5).
      void sendMessage({ type: 'start-recording', path: 'window-cropped' });

      // Open the record page (the gesture owner) WITH the window mode flag so
      // bootstrapRecordPage runs the shared record/stop/download lifecycle with
      // the whole-window surface (displaySurface:'window'), not the single-tab
      // surface. The popup origin never calls getDisplayMedia -- the record page
      // does, in its own gesture. Single-tab/Firefox open record.html with NO
      // flag (unchanged).
      void launchRecordPageWindow(status, 'record.html?mode=window-cropped');
    },
    { capture: true },
  );
};

// --- Path dispatch ---------------------------------------------------------

const capability = checkRecordingCapability();

if (capability.supported && capability.path === 'firefox-display-media') {
  setupFirefoxPopupRecorder(button, status);
} else {
  // Wire the window-cropped interceptor first so it runs before the single-tab
  // click handler that initializePopup registers (capture vs bubble phase).
  setupWindowCroppedRouting(button);
  initializePopup(
    button,
    status,
    sendMessage,
    getStreamId,
    onMessage,
    fallbackNotice,
    () => capability,
  );
}
