// ---------------------------------------------------------------------------
// Background service worker entry point -- effectful boundary
// ---------------------------------------------------------------------------
// This module wires chrome APIs to the pure background logic.
// All side effects (chrome.*, console.*) live here at the edge.
//
// Per docs/feature/firefox-recording-support/design/component-boundaries.md §3
// the recorder-host lifecycle (create/start/stop/close) is encapsulated by
// the RecorderHost port. selectHost(target) is the SINGLE target-branching
// site in the project (D16). The state-machine logic in
// createMessageHandler stays target-blind; only the host-effect calls are
// routed through the selected adapter, so the Firefox adapter can plug in
// without touching the pure core.
//
// On the first start-recording message of a session, background.ts reads
// the path discriminant from the popup, calls selectHost(targetForPath(path))
// once, and reuses the returned host for the subsequent stop. Re-selection
// happens only when the path changes between sessions (e.g., extension
// reload on a different browser).
// ---------------------------------------------------------------------------

import type { OffscreenToSW, SWToOffscreen, Message, RecordingPath } from './types';
import { createMessageHandler } from './background-logic';
import type { ChromeAPIs } from './background-logic';
import {
  createDefaultChromiumDeps,
} from './recorder-host-chromium';
import {
  selectHost,
  targetForPath,
  type HostStopResult,
  type RecorderHost,
  type SelectedHost,
  type Target,
} from './recorder-host';

// --- Selected host (port-routed effects, picked on first start-recording) ----

// Default to chromium so the first stop-before-start path doesn't crash.
// The path-derived selection runs in the chrome.runtime.onMessage listener.
let selectedHost: RecorderHost & SelectedHost = selectHost('chromium');

// Chromium-only deps reused for offscreen-doc lifecycle (close + raw
// sendMessageToOffscreen pass-through). The Firefox host owns its own
// internal lifecycle and never touches these.
const chromiumDeps = createDefaultChromiumDeps();

/**
 * Convert a HostStopResult back to the OffscreenToSW shape that
 * createMessageHandler already knows how to handle. Keeps the SW state
 * machine target-blind.
 */
const hostResultToOffscreenMessage = (result: HostStopResult): OffscreenToSW => {
  if (result.ok) {
    return { type: 'offscreen-result', format: result.format, dataUrl: result.dataUrl };
  }
  return result.fallbackDataUrl !== undefined
    ? { type: 'offscreen-error', error: 'Mp4 conversion failed', fallbackDataUrl: result.fallbackDataUrl }
    : { type: 'offscreen-error', error: 'Mp4 conversion failed' };
};

// --- Chrome API adapters ---------------------------------------------------

const chromeAPIs: ChromeAPIs = {
  getActiveTab: async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    return tab?.id != null ? { id: tab.id } : null;
  },

  // start-recording effect routed through selectedHost.start so the SW
  // state machine stays target-blind. The bundle's buildStartInput()
  // produces the correct HostStartInput variant -- on Chromium the
  // streamId is forwarded; on Firefox the streamId is discarded because
  // the host runs getDisplayMedia internally. Returns void to match the
  // existing port shape.
  createOffscreenDocument: async (streamId: string) => {
    const input = selectedHost.buildStartInput(streamId);
    const result = await selectedHost.host.start(input);
    if (!result.ok) {
      // picker-cancelled on Firefox is a normal user choice. We swallow
      // it here and let the SW state-machine's stop/timeout handlers
      // bring the popup back to idle. Other failures are logged but not
      // rethrown (the offscreen-error / timeout paths surface them).
      console.log('[sw] host.start non-ok result:', result.cause);
    }
  },

  closeOffscreenDocument: chromiumDeps.closeOffscreenDocument,

  // stop-recording effect routed through selectedHost.stop, which
  // encapsulates the target-specific stop pipeline. Other SW->offscreen
  // messages bypass the host (none today; offscreen-stop is the only
  // message in SWToOffscreen besides offscreen-start, which the offscreen
  // doc auto-receives via URL on Chromium and is irrelevant on Firefox).
  sendMessageToOffscreen: async (message: SWToOffscreen) => {
    if (message.type === 'offscreen-stop') {
      console.log('[sw] sendMessageToOffscreen: routing offscreen-stop to host', selectedHost.target);
      const hostResult = await selectedHost.host.stop();
      const offscreenMsg = hostResultToOffscreenMessage(hostResult);
      console.log('[sw] sendMessageToOffscreen: host returned', JSON.stringify({ ok: hostResult.ok, cause: !hostResult.ok ? hostResult.cause : undefined }), '-> offscreen msg type', offscreenMsg.type);
      return offscreenMsg;
    }
    return chromiumDeps.sendMessageToOffscreen(message);
  },

  downloadFile: async (url: string, filename: string) => {
    console.log('[sw] downloadFile called:', url.slice(0, 80), filename);
    await chrome.downloads.download({ url, filename });
  },

  getRecordingData: chromiumDeps.getRecordingData,

  clearRecordingData: () => chrome.storage.local.remove('recordingData'),

  broadcastState: (state) => {
    chrome.runtime.sendMessage({ type: 'state-update', state }).catch(() => {
      // Popup may be closed — ignore
    });
  },

  broadcastFallbackNotice: (message) => {
    chrome.runtime.sendMessage({ type: 'fallback-notice', message }).catch(() => {
      // Popup may be closed — ignore
    });
  },

  broadcastError: (message) => {
    chrome.runtime.sendMessage({ type: 'error', message }).catch(() => {
      // Popup may be closed — ignore
    });
  },

  setBadge: (text, color) => {
    chrome.action.setBadgeText({ text });
    if (color) {
      chrome.action.setBadgeBackgroundColor({ color });
    }
  },

  now: () => Date.now(),

  setTimeout: (callback: () => void, ms: number) => self.setTimeout(callback, ms),
  clearTimeout: (id: number) => self.clearTimeout(id),
};

// --- Message listener ------------------------------------------------------

const handleMessage = createMessageHandler(chromeAPIs);

/**
 * Re-select the host adapter for an incoming start-recording message.
 * Re-selection only happens when the target actually changes, so each
 * Chromium-only or Firefox-only session reuses a single host instance.
 * This is the consumption side of selectHost being the SINGLE
 * target-branching site -- no further `target ===` reasoning lives here.
 */
const ensureHostForPath = (path: RecordingPath): void => {
  const nextTarget: Target = targetForPath(path);
  if (nextTarget !== selectedHost.target) {
    selectedHost = selectHost(nextTarget);
  }
};

chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse) => {
    console.log('[sw] Received message:', JSON.stringify(message));

    // Route start-recording through the path-derived host BEFORE the
    // target-blind state machine consumes the message. The streamId (if
    // any) flows through the existing ChromeAPIs.createOffscreenDocument
    // contract; the host's buildStartInput discards it on Firefox.
    if (message.type === 'start-recording') {
      ensureHostForPath(message.path);
    }

    handleMessage(message)
      .then((response) => {
        console.log('[sw] Handled message:', message.type, '-> response:', response?.type);
        sendResponse(response);
      })
      .catch((error: unknown) => {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        console.error('[sw] Error handling message:', message.type, errorMessage);
        sendResponse({ type: 'error', message: errorMessage });
      });

    // Return true to indicate async response
    return true;
  },
);

console.log('BroShow service worker loaded');
