// ---------------------------------------------------------------------------
// Regression: Firefox gets stuck on "Processing recording..." and never
// downloads the recording.
//
// Root cause (see RCA): chrome.offscreen and chrome.tabCapture do not exist in
// Firefox at all, so the offscreen-document path silently rejects and the SW
// never broadcasts anything that lets the popup leave 'processing'. The only
// timeout that does fire transitions to 'idle' silently with no error message.
//
// These tests pin two invariants that prevent the stuck-spinner symptom:
//   1. The popup MUST detect missing recording capabilities and surface a
//      clear error instead of attempting to record.
//   2. When the SW's processing timeout fires (offscreen never responded), it
//      MUST broadcast an error to the popup, not silently drop to idle.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { initializePopup } from '../../src/popup-logic';
import type { OffscreenToSW, SWToOffscreen, SWToPopup } from '../../src/types';

const makeButton = () => ({
  textContent: '',
  disabled: false,
  addEventListener: vi.fn<(event: string, handler: () => void) => void>(),
});

const makeStatus = () => ({ textContent: '' });

describe('Regression: Firefox stuck on "Processing recording..."', () => {
  describe('popup capability check', () => {
    it('surfaces a clear error and disables the button when recording APIs are unavailable', async () => {
      const button = makeButton();
      const status = makeStatus();
      const sendMessage = vi.fn();
      const getStreamId = vi.fn();

      await initializePopup(
        button,
        status,
        sendMessage,
        getStreamId,
        undefined,
        undefined,
        () => ({
          supported: false,
          reason: 'Recording is not yet supported on Firefox.',
        }),
      );

      expect(button.disabled).toBe(true);
      expect(status.textContent).toMatch(/Firefox/i);
      expect(sendMessage).not.toHaveBeenCalled();
      expect(getStreamId).not.toHaveBeenCalled();
      expect(button.addEventListener).not.toHaveBeenCalled();
    });

    it('proceeds to normal initialization when capabilities are supported', async () => {
      const button = makeButton();
      const status = makeStatus();
      const sendMessage = vi
        .fn()
        .mockResolvedValue({
          type: 'state-update',
          state: { status: 'idle' },
        } satisfies SWToPopup);
      const getStreamId = vi.fn();

      await initializePopup(
        button,
        status,
        sendMessage,
        getStreamId,
        undefined,
        undefined,
        () => ({ supported: true }),
      );

      expect(sendMessage).toHaveBeenCalledWith({ type: 'get-state' });
      expect(button.disabled).toBe(false);
    });

    it('proceeds to normal initialization when no capability check is provided (backwards compatible)', async () => {
      const button = makeButton();
      const status = makeStatus();
      const sendMessage = vi
        .fn()
        .mockResolvedValue({
          type: 'state-update',
          state: { status: 'idle' },
        } satisfies SWToPopup);
      const getStreamId = vi.fn();

      await initializePopup(button, status, sendMessage, getStreamId);

      expect(sendMessage).toHaveBeenCalledWith({ type: 'get-state' });
    });
  });

  describe('SW processing timeout broadcasts an error', () => {
    const neverResolves = () => new Promise<OffscreenToSW>(() => {});

    const createMockChromeAPIs = () => ({
      getActiveTab: vi.fn<() => Promise<{ id: number } | null>>().mockResolvedValue({ id: 42 }),
      createOffscreenDocument: vi.fn<(streamId: string) => Promise<void>>().mockResolvedValue(undefined),
      closeOffscreenDocument: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      sendMessageToOffscreen: vi
        .fn<(message: SWToOffscreen) => Promise<OffscreenToSW>>()
        .mockImplementation(neverResolves),
      downloadFile: vi.fn<(url: string, filename: string) => Promise<void>>().mockResolvedValue(undefined),
      getRecordingData: vi.fn<() => Promise<string | null>>().mockResolvedValue(null),
      clearRecordingData: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      broadcastState: vi.fn(),
      broadcastFallbackNotice: vi.fn<(message: string) => void>(),
      broadcastError: vi.fn<(message: string) => void>(),
      setBadge: vi.fn<(text: string, color?: string) => void>(),
      now: vi.fn<() => number>().mockReturnValue(5000),
      setTimeout: vi.fn<(cb: () => void, ms: number) => number>().mockReturnValue(1),
      clearTimeout: vi.fn<(id: number) => void>(),
    });

    it('broadcasts an error to the popup when the offscreen document never responds', async () => {
      const apis = createMockChromeAPIs();
      let timeoutCallback: (() => void) | null = null;
      apis.setTimeout.mockImplementation((cb: () => void) => {
        timeoutCallback = cb;
        return 1;
      });

      const { createMessageHandler } = await import('../../src/background-logic');
      const handleMessage = createMessageHandler(apis);

      await handleMessage({ type: 'start-recording', streamId: 'stream-42' });
      await handleMessage({ type: 'stop-recording' });

      expect(timeoutCallback).not.toBeNull();
      await timeoutCallback!();

      expect(apis.broadcastError).toHaveBeenCalled();
      const errMsg = apis.broadcastError.mock.calls[0]?.[0] ?? '';
      expect(errMsg).toMatch(/timed out|no response|did not finish/i);
      expect(apis.broadcastState).toHaveBeenCalledWith({ status: 'idle' });
    });
  });
});
