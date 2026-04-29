import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  RecordingState,
  PopupToSW,
  SWToPopup,
  SWToOffscreen,
  OffscreenToSW,
} from '../../src/types';
import {
  createInitialState,
  handleStartRecording,
  handleStopRecording,
  handleOffscreenResult,
  handleOffscreenError,
  handleOffscreenFallback,
  handleGetState,
  badgeFor,
  formatRecordingFilename,
} from '../../src/background-logic';

// ---------------------------------------------------------------------------
// Pure background logic -- state transitions and message handling
// ---------------------------------------------------------------------------

describe('background-logic', () => {
  describe('badgeFor', () => {
    it('returns empty text when idle', () => {
      const state: RecordingState = { status: 'idle' };
      const badge = badgeFor(state);
      expect(badge.text).toBe('');
    });

    it('returns REC text with red color when recording', () => {
      const state: RecordingState = { status: 'recording', tabId: 1, startTime: 1000 };
      const badge = badgeFor(state);
      expect(badge.text).toBe('REC');
      expect(badge.color).toBeDefined();
    });

    it('returns empty text when processing', () => {
      const state: RecordingState = { status: 'processing' };
      const badge = badgeFor(state);
      expect(badge.text).toBe('');
    });
  });

  describe('createInitialState', () => {
    it('returns idle state', () => {
      const state = createInitialState();
      expect(state).toEqual({ status: 'idle' });
    });
  });

  describe('handleGetState', () => {
    it('returns state-update response with current state', () => {
      const state: RecordingState = { status: 'idle' };
      const response = handleGetState(state);
      expect(response).toEqual({ type: 'state-update', state: { status: 'idle' } });
    });

    it('returns recording state when recording', () => {
      const state: RecordingState = { status: 'recording', tabId: 42, startTime: 1000 };
      const response = handleGetState(state);
      expect(response).toEqual({
        type: 'state-update',
        state: { status: 'recording', tabId: 42, startTime: 1000 },
      });
    });

    it('returns processing state when processing', () => {
      const state: RecordingState = { status: 'processing' };
      const response = handleGetState(state);
      expect(response).toEqual({ type: 'state-update', state: { status: 'processing' } });
    });
  });

  describe('handleStartRecording', () => {
    it('transitions from idle to recording with tabId and startTime', () => {
      const state: RecordingState = { status: 'idle' };
      const result = handleStartRecording(state, 42, 'stream-42', 5000);

      expect(result.newState).toEqual({
        status: 'recording',
        tabId: 42,
        startTime: 5000,
      });
    });

    it('returns state-update response', () => {
      const state: RecordingState = { status: 'idle' };
      const result = handleStartRecording(state, 42, 'stream-42', 5000);

      expect(result.response).toEqual({
        type: 'state-update',
        state: { status: 'recording', tabId: 42, startTime: 5000 },
      });
    });

    it('returns offscreen-start command with streamId', () => {
      const state: RecordingState = { status: 'idle' };
      const result = handleStartRecording(state, 42, 'stream-42', 5000);

      expect(result.offscreenMessage).toEqual({
        type: 'offscreen-start',
        streamId: 'stream-42',
      });
    });

    it('returns error when already recording', () => {
      const state: RecordingState = { status: 'recording', tabId: 1, startTime: 1000 };
      const result = handleStartRecording(state, 42, 'stream-42', 5000);

      expect(result.newState).toEqual(state); // unchanged
      expect(result.response).toEqual({
        type: 'error',
        message: 'Already recording',
      });
      expect(result.offscreenMessage).toBeNull();
    });

    it('returns error when processing', () => {
      const state: RecordingState = { status: 'processing' };
      const result = handleStartRecording(state, 42, 'stream-42', 5000);

      expect(result.newState).toEqual(state); // unchanged
      expect(result.response).toEqual({
        type: 'error',
        message: 'Already recording',
      });
      expect(result.offscreenMessage).toBeNull();
    });
  });

  describe('handleStopRecording', () => {
    it('transitions from recording to processing', () => {
      const state: RecordingState = { status: 'recording', tabId: 42, startTime: 1000 };
      const result = handleStopRecording(state);

      expect(result.newState).toEqual({ status: 'processing' });
    });

    it('returns state-update response', () => {
      const state: RecordingState = { status: 'recording', tabId: 42, startTime: 1000 };
      const result = handleStopRecording(state);

      expect(result.response).toEqual({
        type: 'state-update',
        state: { status: 'processing' },
      });
    });

    it('returns offscreen-stop command', () => {
      const state: RecordingState = { status: 'recording', tabId: 42, startTime: 1000 };
      const result = handleStopRecording(state);

      expect(result.offscreenMessage).toEqual({ type: 'offscreen-stop' });
    });

    it('returns error when not recording', () => {
      const state: RecordingState = { status: 'idle' };
      const result = handleStopRecording(state);

      expect(result.newState).toEqual(state); // unchanged
      expect(result.response).toEqual({
        type: 'error',
        message: 'Not recording',
      });
      expect(result.offscreenMessage).toBeNull();
    });
  });

  describe('handleOffscreenResult', () => {
    it('transitions from processing to idle', () => {
      const state: RecordingState = { status: 'processing' };
      const message: OffscreenToSW = {
        type: 'offscreen-result',
        format: 'mp4',
      };
      const result = handleOffscreenResult(state, message);

      expect(result.newState).toEqual({ status: 'idle' });
    });

    it('returns only newState (download handled by service worker via storage)', () => {
      const state: RecordingState = { status: 'processing' };
      const message: OffscreenToSW = {
        type: 'offscreen-result',
        format: 'webm',
      };
      const result = handleOffscreenResult(state, message);

      expect(result).toEqual({ newState: { status: 'idle' } });
    });
  });

  describe('handleOffscreenError', () => {
    it('transitions from processing to idle', () => {
      const state: RecordingState = { status: 'processing' };
      const message: OffscreenToSW = {
        type: 'offscreen-error',
        error: 'Encoding failed',
      };
      const result = handleOffscreenError(state, message);

      expect(result.newState).toEqual({ status: 'idle' });
    });

    it('returns error response with the error message', () => {
      const state: RecordingState = { status: 'processing' };
      const message: OffscreenToSW = {
        type: 'offscreen-error',
        error: 'Encoding failed',
      };
      const result = handleOffscreenError(state, message);

      expect(result.response).toEqual({
        type: 'error',
        message: 'Encoding failed',
      });
    });
  });

  describe('handleOffscreenFallback', () => {
    it('transitions from processing to idle', () => {
      const state: RecordingState = { status: 'processing' };
      const result = handleOffscreenFallback(state);

      expect(result.newState).toEqual({ status: 'idle' });
    });

    it('returns a fallback-notice with a human-readable message', () => {
      const state: RecordingState = { status: 'processing' };
      const result = handleOffscreenFallback(state);

      expect(result.fallbackNotice).toEqual({
        type: 'fallback-notice',
        message: 'Mp4 conversion failed; downloaded as WebM instead.',
      });
    });
  });

  describe('formatRecordingFilename', () => {
    it('formats a known date with mp4 extension correctly', () => {
      // 2026-03-22 14:30:52 local time
      const date = new Date(2026, 2, 22, 14, 30, 52); // month is 0-indexed
      expect(formatRecordingFilename(date, 'mp4')).toBe('broshow-2026-03-22-143052.mp4');
    });

    it('formats a known date with webm extension correctly', () => {
      const date = new Date(2026, 2, 22, 14, 30, 52);
      expect(formatRecordingFilename(date, 'webm')).toBe('broshow-2026-03-22-143052.webm');
    });

    it('zero-pads single-digit month', () => {
      // January = month 0, day 5, 09:07:03
      const date = new Date(2026, 0, 5, 9, 7, 3);
      expect(formatRecordingFilename(date, 'mp4')).toBe('broshow-2026-01-05-090703.mp4');
    });

    it('zero-pads single-digit day and time components', () => {
      // March 7, 09:07:03
      const date = new Date(2026, 2, 7, 9, 7, 3);
      expect(formatRecordingFilename(date, 'mp4')).toBe('broshow-2026-03-07-090703.mp4');
    });

    it('result always matches the broshow filename pattern', () => {
      const dates = [
        new Date(2024, 11, 31, 23, 59, 59), // Dec 31 edge
        new Date(2025, 0, 1, 0, 0, 0),       // Jan 1 midnight
        new Date(2026, 5, 15, 12, 30, 0),    // mid-year
      ];
      for (const date of dates) {
        for (const ext of ['mp4', 'webm'] as const) {
          expect(formatRecordingFilename(date, ext)).toMatch(
            /^broshow-\d{4}-\d{2}-\d{2}-\d{6}\.(mp4|webm)$/,
          );
        }
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Background wiring -- tests that verify chrome API integration
// Uses injected mock chrome APIs (no real browser needed)
// ---------------------------------------------------------------------------

describe('background wiring', () => {
  // Chrome API mocks as pure function stubs
  // Default: sendMessageToOffscreen returns a never-resolving promise so the
  // async sendResponse path doesn't fire during tests that don't test it.
  const neverResolves = () => new Promise<OffscreenToSW>(() => {});

  const createMockChromeAPIs = () => ({
    getActiveTab: vi.fn<() => Promise<{ id: number } | null>>(),
    createOffscreenDocument: vi.fn<(streamId: string) => Promise<void>>().mockResolvedValue(undefined),
    closeOffscreenDocument: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    sendMessageToOffscreen: vi.fn<(message: SWToOffscreen) => Promise<OffscreenToSW>>().mockImplementation(neverResolves),
    downloadFile: vi.fn<(url: string, filename: string) => Promise<void>>().mockResolvedValue(undefined),
    getRecordingData: vi.fn<() => Promise<string | null>>().mockResolvedValue(null),
    clearRecordingData: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    broadcastState: vi.fn(),
    broadcastFallbackNotice: vi.fn<(message: string) => void>(),
    broadcastError: vi.fn<(message: string) => void>(),
    setBadge: vi.fn<(text: string, color?: string) => void>(),
    now: vi.fn<() => number>(),
    setTimeout: vi.fn<(cb: () => void, ms: number) => number>().mockReturnValue(1),
    clearTimeout: vi.fn<(id: number) => void>(),
  });

  it('handles start-recording: gets tab, creates offscreen with streamId in URL', async () => {
    const apis = createMockChromeAPIs();
    apis.getActiveTab.mockResolvedValue({ id: 42 });
    apis.now.mockReturnValue(5000);

    const { createMessageHandler } = await import('../../src/background-logic');
    const handleMessage = createMessageHandler(apis);

    const response = await handleMessage({ type: 'start-recording', streamId: 'stream-42' });

    expect(apis.getActiveTab).toHaveBeenCalled();
    expect(response).toEqual({
      type: 'state-update',
      state: { status: 'recording', tabId: 42, startTime: 5000 },
    });

    // Offscreen creation runs asynchronously with streamId passed via URL
    await vi.waitFor(() => {
      expect(apis.createOffscreenDocument).toHaveBeenCalledWith('stream-42');
    });
  });

  it('handles start-recording error when no active tab', async () => {
    const apis = createMockChromeAPIs();
    apis.getActiveTab.mockResolvedValue(null);

    const { createMessageHandler } = await import('../../src/background-logic');
    const handleMessage = createMessageHandler(apis);

    const response = await handleMessage({ type: 'start-recording', streamId: 'stream-42' });

    expect(response).toEqual({
      type: 'error',
      message: 'No active tab found',
    });
  });

  it('handles stop-recording: sends stop to offscreen', async () => {
    const apis = createMockChromeAPIs();
    apis.getActiveTab.mockResolvedValue({ id: 42 });
    apis.sendMessageToOffscreen.mockResolvedValue(undefined);
    apis.now.mockReturnValue(5000);

    const { createMessageHandler } = await import('../../src/background-logic');
    const handleMessage = createMessageHandler(apis);

    // First start recording
    await handleMessage({ type: 'start-recording', streamId: 'stream-42' });

    // Then stop
    const response = await handleMessage({ type: 'stop-recording' });

    expect(apis.sendMessageToOffscreen).toHaveBeenCalledWith({
      type: 'offscreen-stop',
    });
    expect(response).toEqual({
      type: 'state-update',
      state: { status: 'processing' },
    });
  });

  it('handles get-state: returns current state', async () => {
    const apis = createMockChromeAPIs();

    const { createMessageHandler } = await import('../../src/background-logic');
    const handleMessage = createMessageHandler(apis);

    const response = await handleMessage({ type: 'get-state' });

    expect(response).toEqual({
      type: 'state-update',
      state: { status: 'idle' },
    });
  });

  it('handles offscreen-result: reads data from storage, downloads, cleans up, closes offscreen', async () => {
    const apis = createMockChromeAPIs();
    apis.getActiveTab.mockResolvedValue({ id: 42 });
    apis.sendMessageToOffscreen.mockResolvedValue(undefined);
    apis.closeOffscreenDocument.mockResolvedValue(undefined);
    apis.getRecordingData.mockResolvedValue('data:video/webm;base64,fakedata');
    apis.now.mockReturnValue(5000);

    const { createMessageHandler } = await import('../../src/background-logic');
    const handleMessage = createMessageHandler(apis);

    // Start and stop to reach processing state
    await handleMessage({ type: 'start-recording', streamId: 'stream-42' });
    await handleMessage({ type: 'stop-recording' });

    // Offscreen sends lightweight notification (no blob data)
    const response = await handleMessage({
      type: 'offscreen-result',
      format: 'webm',
    });

    expect(apis.getRecordingData).toHaveBeenCalled();
    expect(apis.downloadFile).toHaveBeenCalledWith(
      'data:video/webm;base64,fakedata',
      expect.stringMatching(/^broshow-\d{4}-\d{2}-\d{2}-\d{6}\.webm$/),
    );
    expect(apis.clearRecordingData).toHaveBeenCalled();
    expect(apis.closeOffscreenDocument).toHaveBeenCalled();

    // State should be idle now
    const stateResponse = await handleMessage({ type: 'get-state' });
    expect(stateResponse).toEqual({
      type: 'state-update',
      state: { status: 'idle' },
    });
  });

  it('handles offscreen-result with missing storage data: returns error', async () => {
    const apis = createMockChromeAPIs();
    apis.getActiveTab.mockResolvedValue({ id: 42 });
    apis.sendMessageToOffscreen.mockResolvedValue(undefined);
    apis.closeOffscreenDocument.mockResolvedValue(undefined);
    apis.getRecordingData.mockResolvedValue(null);
    apis.now.mockReturnValue(5000);

    const { createMessageHandler } = await import('../../src/background-logic');
    const handleMessage = createMessageHandler(apis);

    // Start and stop to reach processing state
    await handleMessage({ type: 'start-recording', streamId: 'stream-42' });
    await handleMessage({ type: 'stop-recording' });

    // Offscreen sends result but storage is empty (auto-close race)
    const response = await handleMessage({
      type: 'offscreen-result',
      format: 'webm',
    });

    expect(apis.closeOffscreenDocument).toHaveBeenCalled();
    expect(apis.downloadFile).not.toHaveBeenCalled();
    expect(response).toEqual({
      type: 'error',
      message: 'Recording data missing from storage',
    });
  });

  it('passes streamId to offscreen document via createOffscreenDocument', async () => {
    const apis = createMockChromeAPIs();
    apis.getActiveTab.mockResolvedValue({ id: 42 });
    apis.now.mockReturnValue(5000);

    const { createMessageHandler } = await import('../../src/background-logic');
    const handleMessage = createMessageHandler(apis);

    await handleMessage({ type: 'start-recording', streamId: 'stream-42' });

    // Offscreen creation runs asynchronously with streamId
    await vi.waitFor(() => {
      expect(apis.createOffscreenDocument).toHaveBeenCalledWith('stream-42');
    });
  });

  it('handles offscreen-error: closes offscreen and returns error', async () => {
    const apis = createMockChromeAPIs();
    apis.getActiveTab.mockResolvedValue({ id: 42 });
    apis.sendMessageToOffscreen.mockResolvedValue(undefined);
    apis.closeOffscreenDocument.mockResolvedValue(undefined);
    apis.now.mockReturnValue(5000);

    const { createMessageHandler } = await import('../../src/background-logic');
    const handleMessage = createMessageHandler(apis);

    // Reach processing state
    await handleMessage({ type: 'start-recording', streamId: 'stream-42' });
    await handleMessage({ type: 'stop-recording' });

    const response = await handleMessage({
      type: 'offscreen-error',
      error: 'Recording failed completely',
    });

    expect(apis.closeOffscreenDocument).toHaveBeenCalled();
    expect(response).toEqual({
      type: 'error',
      message: 'Recording failed completely',
    });
  });

  it('starts a processing timeout when stop-recording transitions to processing', async () => {
    const apis = createMockChromeAPIs();
    apis.getActiveTab.mockResolvedValue({ id: 42 });
    apis.now.mockReturnValue(5000);

    const { createMessageHandler, PROCESSING_TIMEOUT_MS } = await import('../../src/background-logic');
    const handleMessage = createMessageHandler(apis);

    await handleMessage({ type: 'start-recording', streamId: 'stream-42' });
    await handleMessage({ type: 'stop-recording' });

    expect(apis.setTimeout).toHaveBeenCalledWith(expect.any(Function), PROCESSING_TIMEOUT_MS);
  });

  it('clears processing timeout when offscreen-result arrives', async () => {
    const apis = createMockChromeAPIs();
    apis.getActiveTab.mockResolvedValue({ id: 42 });
    apis.getRecordingData.mockResolvedValue('data:video/webm;base64,fakedata');
    apis.now.mockReturnValue(5000);
    apis.setTimeout.mockReturnValue(42);

    const { createMessageHandler } = await import('../../src/background-logic');
    const handleMessage = createMessageHandler(apis);

    await handleMessage({ type: 'start-recording', streamId: 'stream-42' });
    await handleMessage({ type: 'stop-recording' });
    await handleMessage({ type: 'offscreen-result', format: 'webm' });

    expect(apis.clearTimeout).toHaveBeenCalledWith(42);
  });

  it('clears processing timeout when offscreen-error arrives', async () => {
    const apis = createMockChromeAPIs();
    apis.getActiveTab.mockResolvedValue({ id: 42 });
    apis.now.mockReturnValue(5000);
    apis.setTimeout.mockReturnValue(99);

    const { createMessageHandler } = await import('../../src/background-logic');
    const handleMessage = createMessageHandler(apis);

    await handleMessage({ type: 'start-recording', streamId: 'stream-42' });
    await handleMessage({ type: 'stop-recording' });
    await handleMessage({ type: 'offscreen-error', error: 'fail' });

    expect(apis.clearTimeout).toHaveBeenCalledWith(99);
  });

  it('timeout recovers to idle state, closes offscreen, and broadcasts', async () => {
    const apis = createMockChromeAPIs();
    apis.getActiveTab.mockResolvedValue({ id: 42 });
    apis.now.mockReturnValue(5000);

    // Capture the timeout callback
    let timeoutCallback: (() => void) | null = null;
    apis.setTimeout.mockImplementation((cb: () => void) => {
      timeoutCallback = cb;
      return 1;
    });

    const { createMessageHandler } = await import('../../src/background-logic');
    const handleMessage = createMessageHandler(apis);

    await handleMessage({ type: 'start-recording', streamId: 'stream-42' });
    await handleMessage({ type: 'stop-recording' });

    // Simulate timeout firing
    expect(timeoutCallback).not.toBeNull();
    await timeoutCallback!();

    expect(apis.closeOffscreenDocument).toHaveBeenCalled();
    expect(apis.broadcastState).toHaveBeenCalledWith({ status: 'idle' });

    // State should be idle now
    const stateResponse = await handleMessage({ type: 'get-state' });
    expect(stateResponse).toEqual({
      type: 'state-update',
      state: { status: 'idle' },
    });
  });

  it('processes offscreen sendResponse result via async delivery path', async () => {
    const apis = createMockChromeAPIs();
    apis.getActiveTab.mockResolvedValue({ id: 42 });
    apis.now.mockReturnValue(5000);
    apis.getRecordingData.mockResolvedValue('data:video/webm;base64,fakedata');

    // sendMessageToOffscreen resolves with the offscreen's sendResponse value
    apis.sendMessageToOffscreen.mockResolvedValue({
      type: 'offscreen-result',
      format: 'webm',
    });

    const { createMessageHandler } = await import('../../src/background-logic');
    const handleMessage = createMessageHandler(apis);

    await handleMessage({ type: 'start-recording', streamId: 'stream-42' });
    await handleMessage({ type: 'stop-recording' });

    // Wait for the async sendResponse path to process
    await vi.waitFor(() => {
      expect(apis.downloadFile).toHaveBeenCalledWith(
        'data:video/webm;base64,fakedata',
        expect.stringMatching(/^broshow-\d{4}-\d{2}-\d{2}-\d{6}\.webm$/),
      );
    });

    expect(apis.closeOffscreenDocument).toHaveBeenCalled();
    expect(apis.broadcastState).toHaveBeenCalledWith({ status: 'idle' });
  });

  it('ignores duplicate offscreen-result when already handled via sendResponse', async () => {
    const apis = createMockChromeAPIs();
    apis.getActiveTab.mockResolvedValue({ id: 42 });
    apis.now.mockReturnValue(5000);
    apis.getRecordingData.mockResolvedValue('data:video/webm;base64,fakedata');

    // sendResponse path delivers the result
    apis.sendMessageToOffscreen.mockResolvedValue({
      type: 'offscreen-result',
      format: 'webm',
    });

    const { createMessageHandler } = await import('../../src/background-logic');
    const handleMessage = createMessageHandler(apis);

    await handleMessage({ type: 'start-recording', streamId: 'stream-42' });
    await handleMessage({ type: 'stop-recording' });

    // Wait for sendResponse path to complete
    await vi.waitFor(() => {
      expect(apis.downloadFile).toHaveBeenCalled();
    });

    // Now a duplicate broadcast arrives -- should be ignored (state is idle, not processing)
    const response = await handleMessage({ type: 'offscreen-result', format: 'webm' });

    // downloadFile should still only have been called once
    expect(apis.downloadFile).toHaveBeenCalledTimes(1);
    expect(response).toEqual({
      type: 'state-update',
      state: { status: 'idle' },
    });
  });

  it('ignores duplicate offscreen-error when already handled', async () => {
    const apis = createMockChromeAPIs();
    apis.getActiveTab.mockResolvedValue({ id: 42 });
    apis.now.mockReturnValue(5000);

    apis.sendMessageToOffscreen.mockResolvedValue({
      type: 'offscreen-error',
      error: 'Encoding failed',
    });

    const { createMessageHandler } = await import('../../src/background-logic');
    const handleMessage = createMessageHandler(apis);

    await handleMessage({ type: 'start-recording', streamId: 'stream-42' });
    await handleMessage({ type: 'stop-recording' });

    // Wait for sendResponse path to process the error
    await vi.waitFor(() => {
      expect(apis.closeOffscreenDocument).toHaveBeenCalled();
    });

    // Duplicate broadcast arrives -- should be ignored
    const response = await handleMessage({ type: 'offscreen-error', error: 'Encoding failed' });

    expect(apis.closeOffscreenDocument).toHaveBeenCalledTimes(1);
    expect(response).toEqual({
      type: 'state-update',
      state: { status: 'idle' },
    });
  });

  it('handles offscreen-error with inline fallbackDataUrl: downloads WebM and broadcasts fallback-notice', async () => {
    const apis = createMockChromeAPIs();
    apis.getActiveTab.mockResolvedValue({ id: 42 });
    apis.now.mockReturnValue(5000);

    const { createMessageHandler } = await import('../../src/background-logic');
    const handleMessage = createMessageHandler(apis);

    await handleMessage({ type: 'start-recording', streamId: 'stream-42' });
    await handleMessage({ type: 'stop-recording' });

    // Offscreen sends error with a fallback WebM data URL (mp4 mux failed)
    const response = await handleMessage({
      type: 'offscreen-error',
      error: 'Simulated MP4 mux failure',
      fallbackDataUrl: 'data:video/webm;base64,fakewebm',
    });

    // Should download as .webm with timestamped filename
    expect(apis.downloadFile).toHaveBeenCalledWith(
      'data:video/webm;base64,fakewebm',
      expect.stringMatching(/^broshow-\d{4}-\d{2}-\d{2}-\d{6}\.webm$/),
    );
    expect(apis.clearRecordingData).toHaveBeenCalled();
    expect(apis.closeOffscreenDocument).toHaveBeenCalled();

    // Should broadcast fallback-notice (not error)
    expect(apis.broadcastFallbackNotice).toHaveBeenCalledWith(
      'Mp4 conversion failed; downloaded as WebM instead.',
    );

    // Response should be the fallback-notice
    expect(response).toEqual({
      type: 'fallback-notice',
      message: 'Mp4 conversion failed; downloaded as WebM instead.',
    });
  });

  it('handles offscreen-error with stored fallback (from chrome.storage): downloads WebM and broadcasts fallback-notice', async () => {
    const apis = createMockChromeAPIs();
    apis.getActiveTab.mockResolvedValue({ id: 42 });
    apis.now.mockReturnValue(5000);
    // Simulate storage having the fallback WebM data (offscreen stored it before sending error)
    apis.getRecordingData.mockResolvedValue('data:video/webm;base64,storedfallback');

    const { createMessageHandler } = await import('../../src/background-logic');
    const handleMessage = createMessageHandler(apis);

    await handleMessage({ type: 'start-recording', streamId: 'stream-42' });
    await handleMessage({ type: 'stop-recording' });

    // Offscreen sends error without inline fallback (stored in chrome.storage)
    const response = await handleMessage({
      type: 'offscreen-error',
      error: 'Simulated MP4 mux failure',
    });

    // Should download from storage as .webm with timestamped filename
    expect(apis.downloadFile).toHaveBeenCalledWith(
      'data:video/webm;base64,storedfallback',
      expect.stringMatching(/^broshow-\d{4}-\d{2}-\d{2}-\d{6}\.webm$/),
    );
    expect(apis.clearRecordingData).toHaveBeenCalled();
    expect(apis.closeOffscreenDocument).toHaveBeenCalled();
    expect(apis.broadcastFallbackNotice).toHaveBeenCalledWith(
      'Mp4 conversion failed; downloaded as WebM instead.',
    );
    expect(response).toEqual({
      type: 'fallback-notice',
      message: 'Mp4 conversion failed; downloaded as WebM instead.',
    });
  });
});
