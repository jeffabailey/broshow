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
  handleGetState,
} from '../../src/background-logic';

// ---------------------------------------------------------------------------
// Pure background logic -- state transitions and message handling
// ---------------------------------------------------------------------------

describe('background-logic', () => {
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
      const result = handleStartRecording(state, 42, 'stream-abc', 5000);

      expect(result.newState).toEqual({
        status: 'recording',
        tabId: 42,
        startTime: 5000,
      });
    });

    it('returns state-update response', () => {
      const state: RecordingState = { status: 'idle' };
      const result = handleStartRecording(state, 42, 'stream-abc', 5000);

      expect(result.response).toEqual({
        type: 'state-update',
        state: { status: 'recording', tabId: 42, startTime: 5000 },
      });
    });

    it('returns offscreen-start command with streamId', () => {
      const state: RecordingState = { status: 'idle' };
      const result = handleStartRecording(state, 42, 'stream-abc', 5000);

      expect(result.offscreenMessage).toEqual({
        type: 'offscreen-start',
        streamId: 'stream-abc',
      });
    });

    it('returns error when already recording', () => {
      const state: RecordingState = { status: 'recording', tabId: 1, startTime: 1000 };
      const result = handleStartRecording(state, 42, 'stream-abc', 5000);

      expect(result.newState).toEqual(state); // unchanged
      expect(result.response).toEqual({
        type: 'error',
        message: 'Already recording',
      });
      expect(result.offscreenMessage).toBeNull();
    });

    it('returns error when processing', () => {
      const state: RecordingState = { status: 'processing' };
      const result = handleStartRecording(state, 42, 'stream-abc', 5000);

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
        blobUrl: 'blob://recording',
        format: 'mp4',
      };
      const result = handleOffscreenResult(state, message);

      expect(result.newState).toEqual({ status: 'idle' });
    });

    it('returns download info with filename containing format', () => {
      const state: RecordingState = { status: 'processing' };
      const message: OffscreenToSW = {
        type: 'offscreen-result',
        blobUrl: 'blob://recording',
        format: 'mp4',
      };
      const result = handleOffscreenResult(state, message);

      expect(result.download).toEqual({
        url: 'blob://recording',
        filename: expect.stringContaining('.mp4'),
      });
    });

    it('uses webm extension for webm format', () => {
      const state: RecordingState = { status: 'processing' };
      const message: OffscreenToSW = {
        type: 'offscreen-result',
        blobUrl: 'blob://recording',
        format: 'webm',
      };
      const result = handleOffscreenResult(state, message);

      expect(result.download?.filename).toContain('.webm');
    });

    it('includes recording filename prefix', () => {
      const state: RecordingState = { status: 'processing' };
      const message: OffscreenToSW = {
        type: 'offscreen-result',
        blobUrl: 'blob://recording',
        format: 'mp4',
      };
      const result = handleOffscreenResult(state, message);

      expect(result.download?.filename).toMatch(/^recording-/);
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

    it('returns download with fallback when fallbackBlobUrl is provided', () => {
      const state: RecordingState = { status: 'processing' };
      const message: OffscreenToSW = {
        type: 'offscreen-error',
        error: 'MP4 encoding failed',
        fallbackBlobUrl: 'blob://fallback',
      };
      const result = handleOffscreenError(state, message);

      expect(result.download).toEqual({
        url: 'blob://fallback',
        filename: expect.stringContaining('.webm'),
      });
    });

    it('returns fallback-notice when fallback is used', () => {
      const state: RecordingState = { status: 'processing' };
      const message: OffscreenToSW = {
        type: 'offscreen-error',
        error: 'MP4 encoding failed',
        fallbackBlobUrl: 'blob://fallback',
      };
      const result = handleOffscreenError(state, message);

      expect(result.response).toEqual({
        type: 'fallback-notice',
        message: expect.stringContaining('WebM'),
      });
    });

    it('returns no download when no fallback is available', () => {
      const state: RecordingState = { status: 'processing' };
      const message: OffscreenToSW = {
        type: 'offscreen-error',
        error: 'Encoding failed',
      };
      const result = handleOffscreenError(state, message);

      expect(result.download).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Background wiring -- tests that verify chrome API integration
// Uses injected mock chrome APIs (no real browser needed)
// ---------------------------------------------------------------------------

describe('background wiring', () => {
  // Chrome API mocks as pure function stubs
  const createMockChromeAPIs = () => ({
    getActiveTab: vi.fn<() => Promise<{ id: number } | null>>(),
    getMediaStreamId: vi.fn<(tabId: number) => Promise<string>>(),
    createOffscreenDocument: vi.fn<() => Promise<void>>(),
    closeOffscreenDocument: vi.fn<() => Promise<void>>(),
    sendMessageToOffscreen: vi.fn<(message: SWToOffscreen) => Promise<void>>(),
    downloadFile: vi.fn<(url: string, filename: string) => Promise<void>>(),
    now: vi.fn<() => number>(),
  });

  it('handles start-recording: gets tab, stream, creates offscreen, forwards streamId', async () => {
    const apis = createMockChromeAPIs();
    apis.getActiveTab.mockResolvedValue({ id: 42 });
    apis.getMediaStreamId.mockResolvedValue('stream-abc');
    apis.createOffscreenDocument.mockResolvedValue(undefined);
    apis.sendMessageToOffscreen.mockResolvedValue(undefined);
    apis.now.mockReturnValue(5000);

    const { createMessageHandler } = await import('../../src/background-logic');
    const handleMessage = createMessageHandler(apis);

    const response = await handleMessage({ type: 'start-recording' });

    expect(apis.getActiveTab).toHaveBeenCalled();
    expect(apis.getMediaStreamId).toHaveBeenCalledWith(42);
    expect(apis.createOffscreenDocument).toHaveBeenCalled();
    expect(apis.sendMessageToOffscreen).toHaveBeenCalledWith({
      type: 'offscreen-start',
      streamId: 'stream-abc',
    });
    expect(response).toEqual({
      type: 'state-update',
      state: { status: 'recording', tabId: 42, startTime: 5000 },
    });
  });

  it('handles start-recording error when no active tab', async () => {
    const apis = createMockChromeAPIs();
    apis.getActiveTab.mockResolvedValue(null);

    const { createMessageHandler } = await import('../../src/background-logic');
    const handleMessage = createMessageHandler(apis);

    const response = await handleMessage({ type: 'start-recording' });

    expect(response).toEqual({
      type: 'error',
      message: 'No active tab found',
    });
  });

  it('handles stop-recording: sends stop to offscreen', async () => {
    const apis = createMockChromeAPIs();
    apis.getActiveTab.mockResolvedValue({ id: 42 });
    apis.getMediaStreamId.mockResolvedValue('stream-abc');
    apis.createOffscreenDocument.mockResolvedValue(undefined);
    apis.sendMessageToOffscreen.mockResolvedValue(undefined);
    apis.now.mockReturnValue(5000);

    const { createMessageHandler } = await import('../../src/background-logic');
    const handleMessage = createMessageHandler(apis);

    // First start recording
    await handleMessage({ type: 'start-recording' });

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

  it('handles offscreen-result: triggers download and resets to idle', async () => {
    const apis = createMockChromeAPIs();
    apis.getActiveTab.mockResolvedValue({ id: 42 });
    apis.getMediaStreamId.mockResolvedValue('stream-abc');
    apis.createOffscreenDocument.mockResolvedValue(undefined);
    apis.sendMessageToOffscreen.mockResolvedValue(undefined);
    apis.closeOffscreenDocument.mockResolvedValue(undefined);
    apis.downloadFile.mockResolvedValue(undefined);
    apis.now.mockReturnValue(5000);

    const { createMessageHandler } = await import('../../src/background-logic');
    const handleMessage = createMessageHandler(apis);

    // Start and stop to reach processing state
    await handleMessage({ type: 'start-recording' });
    await handleMessage({ type: 'stop-recording' });

    // Offscreen sends result
    const response = await handleMessage({
      type: 'offscreen-result',
      blobUrl: 'blob://recording',
      format: 'mp4',
    });

    expect(apis.downloadFile).toHaveBeenCalledWith(
      'blob://recording',
      expect.stringContaining('.mp4'),
    );
    expect(apis.closeOffscreenDocument).toHaveBeenCalled();

    // State should be idle now
    const stateResponse = await handleMessage({ type: 'get-state' });
    expect(stateResponse).toEqual({
      type: 'state-update',
      state: { status: 'idle' },
    });
  });

  it('handles offscreen-error with fallback: downloads fallback webm', async () => {
    const apis = createMockChromeAPIs();
    apis.getActiveTab.mockResolvedValue({ id: 42 });
    apis.getMediaStreamId.mockResolvedValue('stream-abc');
    apis.createOffscreenDocument.mockResolvedValue(undefined);
    apis.sendMessageToOffscreen.mockResolvedValue(undefined);
    apis.closeOffscreenDocument.mockResolvedValue(undefined);
    apis.downloadFile.mockResolvedValue(undefined);
    apis.now.mockReturnValue(5000);

    const { createMessageHandler } = await import('../../src/background-logic');
    const handleMessage = createMessageHandler(apis);

    // Reach processing state
    await handleMessage({ type: 'start-recording' });
    await handleMessage({ type: 'stop-recording' });

    const response = await handleMessage({
      type: 'offscreen-error',
      error: 'MP4 failed',
      fallbackBlobUrl: 'blob://fallback',
    });

    expect(apis.downloadFile).toHaveBeenCalledWith(
      'blob://fallback',
      expect.stringContaining('.webm'),
    );
    expect(apis.closeOffscreenDocument).toHaveBeenCalled();
    expect(response).toEqual({
      type: 'fallback-notice',
      message: expect.stringContaining('WebM'),
    });
  });

  it('handles offscreen-error without fallback: returns error', async () => {
    const apis = createMockChromeAPIs();
    apis.getActiveTab.mockResolvedValue({ id: 42 });
    apis.getMediaStreamId.mockResolvedValue('stream-abc');
    apis.createOffscreenDocument.mockResolvedValue(undefined);
    apis.sendMessageToOffscreen.mockResolvedValue(undefined);
    apis.closeOffscreenDocument.mockResolvedValue(undefined);
    apis.now.mockReturnValue(5000);

    const { createMessageHandler } = await import('../../src/background-logic');
    const handleMessage = createMessageHandler(apis);

    // Reach processing state
    await handleMessage({ type: 'start-recording' });
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
});
