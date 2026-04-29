// ---------------------------------------------------------------------------
// Regression: clicking Stop on Firefox does not produce a download.
//
// Reported empirically against v0.2.1 (signed AMO build): user clicks Start
// → picks a tab via getDisplayMedia → clicks Stop → popup returns to idle but
// no broshow-*.mp4 / .webm appears in Downloads.
//
// This test wires the full Firefox path (createMessageHandler ↔ ChromeAPIs
// ↔ FirefoxBackgroundRecorderHost ↔ in-memory chrome.storage.local fakes)
// and asserts that a complete start → stop sequence calls downloadFile
// exactly once with a non-empty dataUrl. The unit-level recorder-host
// contract test passes today; if THIS integration test fails, the bug
// lives at the SW-to-host wiring or in the message routing.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { createMessageHandler, type ChromeAPIs } from '../../src/background-logic';
import {
  createFirefoxBackgroundRecorderHost,
  type FirefoxDeps,
} from '../../src/recorder-host-firefox';
import type {
  HostStopResult,
  RecorderHost,
  SelectedHost,
} from '../../src/recorder-host';
import type {
  Message,
  OffscreenToSW,
  RecordingState,
  SWToOffscreen,
} from '../../src/types';
import type {
  CreateRecorder,
  RecorderSession,
} from '../../src/offscreen-logic';

// --- Test doubles that match real Firefox runtime semantics ---------------

const createInMemoryStorage = (): {
  set: (kv: Record<string, unknown>) => Promise<void>;
  get: (key: string) => Promise<Record<string, unknown>>;
  remove: (key: string) => Promise<void>;
  data: Record<string, unknown>;
} => {
  const data: Record<string, unknown> = {};
  return {
    data,
    set: async (kv) => {
      Object.assign(data, kv);
    },
    get: async (key) => (data[key] !== undefined ? { [key]: data[key] } : {}),
    remove: async (key) => {
      delete data[key];
    },
  };
};

const createMockMediaStream = (): MediaStream => {
  const audioTracks = [{ kind: 'audio' }];
  const videoTracks = [
    {
      kind: 'video',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      stop: vi.fn(),
    },
  ];
  return {
    getAudioTracks: () => audioTracks,
    getVideoTracks: () => videoTracks,
    getTracks: () => [...audioTracks, ...videoTracks],
  } as unknown as MediaStream;
};

const FAKE_DATA_URL = 'data:video/mp4;base64,fake-mp4-payload';
const FAKE_BLOB_TYPE = 'video/mp4';

const createMp4Recorder: CreateRecorder = (_stream): RecorderSession => ({
  stop: async () => new Blob(['fake-mp4-bytes'], { type: FAKE_BLOB_TYPE }),
});

// --- Test ------------------------------------------------------------------

describe('Regression: Firefox start→stop must trigger a download', () => {
  it('full SW message flow (start-recording → stop-recording) calls apis.downloadFile exactly once with a non-empty dataUrl', async () => {
    const storage = createInMemoryStorage();

    // Wire a Firefox host whose storeRecording writes to the fake
    // chrome.storage.local, so the offscreen-result message omits dataUrl
    // and the SW-side handleOffscreenResult must fall back to
    // apis.getRecordingData (which is the same fake storage).
    const firefoxDeps: FirefoxDeps = {
      getDisplayMedia: vi.fn().mockResolvedValue(createMockMediaStream()),
      storeRecording: vi.fn().mockImplementation(async (_blob: Blob) => {
        // Emulate the production storeRecording: write the data URL into
        // chrome.storage.local under 'recordingData'. Returning true tells
        // the offscreen handler "skip blobToDataUrl, the SW will read
        // from storage."
        await storage.set({ recordingData: FAKE_DATA_URL });
        return true;
      }),
      getRecordingData: async () => {
        const result = await storage.get('recordingData');
        return (result.recordingData as string) ?? null;
      },
      blobToDataUrl: vi.fn().mockResolvedValue(FAKE_DATA_URL),
      sendMessage: vi.fn(),
      createRecorder: createMp4Recorder,
    };

    const firefoxHost: RecorderHost = createFirefoxBackgroundRecorderHost(firefoxDeps);

    // SelectedHost wrapper as background.ts uses
    const selectedHost: RecorderHost & SelectedHost = {
      ...firefoxHost,
      target: 'firefox',
      host: firefoxHost,
      buildStartInput: () => ({ target: 'firefox' }),
    };

    // The hostResultToOffscreenMessage function lives in background.ts;
    // mirror its logic here so the integration mirrors production wiring.
    const hostResultToOffscreenMessage = (result: HostStopResult): OffscreenToSW => {
      if (result.ok) {
        return { type: 'offscreen-result', format: result.format, dataUrl: result.dataUrl };
      }
      return result.fallbackDataUrl !== undefined
        ? { type: 'offscreen-error', error: 'Mp4 conversion failed', fallbackDataUrl: result.fallbackDataUrl }
        : { type: 'offscreen-error', error: 'Mp4 conversion failed' };
    };

    const downloadFile = vi.fn<(url: string, filename: string) => Promise<void>>().mockResolvedValue(undefined);

    const apis: ChromeAPIs = {
      getActiveTab: async () => ({ id: 42 }),
      createOffscreenDocument: async (streamId: string) => {
        const input = selectedHost.buildStartInput(streamId);
        const result = await selectedHost.host.start(input);
        if (!result.ok) {
          throw new Error(`host.start returned not-ok: ${result.cause}`);
        }
      },
      closeOffscreenDocument: vi.fn().mockResolvedValue(undefined),
      sendMessageToOffscreen: async (message: SWToOffscreen) => {
        if (message.type === 'offscreen-stop') {
          const hostResult = await selectedHost.host.stop();
          return hostResultToOffscreenMessage(hostResult);
        }
        // No other SWToOffscreen message types are sent on the Firefox path.
        throw new Error(`Unexpected SWToOffscreen: ${message.type}`);
      },
      downloadFile,
      getRecordingData: async () => {
        const result = await storage.get('recordingData');
        return (result.recordingData as string) ?? null;
      },
      clearRecordingData: async () => {
        await storage.remove('recordingData');
      },
      broadcastState: vi.fn<(state: RecordingState) => void>(),
      broadcastFallbackNotice: vi.fn<(message: string) => void>(),
      broadcastError: vi.fn<(message: string) => void>(),
      setBadge: vi.fn<(text: string, color?: string) => void>(),
      now: () => Date.UTC(2026, 3, 29, 12, 0, 0),
      setTimeout: ((cb: () => void, _ms: number) => globalThis.setTimeout(cb, 0)) as ChromeAPIs['setTimeout'],
      clearTimeout: ((id: number) => globalThis.clearTimeout(id)) as ChromeAPIs['clearTimeout'],
    };

    const handleMessage = createMessageHandler(apis);

    // 1. start-recording (Firefox path -- no streamId)
    const startMessage: Message = { type: 'start-recording', path: 'firefox-display-media' };
    const startResponse = await handleMessage(startMessage);
    expect(startResponse).toEqual({
      type: 'state-update',
      state: { status: 'recording', tabId: 42, startTime: apis.now() },
    });

    // Allow the fire-and-forget createOffscreenDocument promise chain to settle.
    await new Promise((resolve) => setTimeout(resolve, 10));

    // 2. stop-recording -- this must drive host.stop, propagate the
    // dataUrl, and call apis.downloadFile.
    const stopMessage: Message = { type: 'stop-recording' };
    const stopResponse = await handleMessage(stopMessage);
    expect(stopResponse).toEqual({
      type: 'state-update',
      state: { status: 'processing' },
    });

    // Wait for the .then() chain inside the stop-recording case to drive
    // host.stop -> handleOffscreenResult -> downloadFile.
    await new Promise((resolve) => setTimeout(resolve, 50));

    // The whole point of the test: the user must see a download.
    expect(downloadFile).toHaveBeenCalledTimes(1);
    const [downloadUrl, filename] = downloadFile.mock.calls[0]!;
    expect(downloadUrl).toBe(FAKE_DATA_URL);
    expect(filename).toMatch(/^broshow-\d{4}-\d{2}-\d{2}-\d{6}\.(mp4|webm)$/);
  });
});
