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
});

// ---------------------------------------------------------------------------
// Background wiring -- tests that verify chrome API integration
// Uses injected mock chrome APIs (no real browser needed)
// ---------------------------------------------------------------------------

describe('background wiring', () => {
  // Chrome API mocks as pure function stubs
  const createMockChromeAPIs = () => ({
    getActiveTab: vi.fn<() => Promise<{ id: number } | null>>(),
    createOffscreenDocument: vi.fn<() => Promise<void>>(),
    closeOffscreenDocument: vi.fn<() => Promise<void>>(),
    sendMessageToOffscreen: vi.fn<(message: SWToOffscreen) => Promise<void>>(),
    downloadFile: vi.fn<(url: string, filename: string) => Promise<void>>().mockResolvedValue(undefined),
    getRecordingData: vi.fn<() => Promise<string | null>>().mockResolvedValue(null),
    clearRecordingData: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    now: vi.fn<() => number>(),
  });

  it('handles start-recording: gets tab, creates offscreen, sends start with streamId from message', async () => {
    const apis = createMockChromeAPIs();
    apis.getActiveTab.mockResolvedValue({ id: 42 });
    apis.createOffscreenDocument.mockResolvedValue(undefined);
    apis.sendMessageToOffscreen.mockResolvedValue(undefined);
    apis.now.mockReturnValue(5000);

    const { createMessageHandler } = await import('../../src/background-logic');
    const handleMessage = createMessageHandler(apis);

    const response = await handleMessage({ type: 'start-recording', streamId: 'stream-42' });

    expect(apis.getActiveTab).toHaveBeenCalled();
    expect(apis.createOffscreenDocument).toHaveBeenCalled();
    expect(apis.sendMessageToOffscreen).toHaveBeenCalledWith({
      type: 'offscreen-start',
      streamId: 'stream-42',
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

    const response = await handleMessage({ type: 'start-recording', streamId: 'stream-42' });

    expect(response).toEqual({
      type: 'error',
      message: 'No active tab found',
    });
  });

  it('handles stop-recording: sends stop to offscreen', async () => {
    const apis = createMockChromeAPIs();
    apis.getActiveTab.mockResolvedValue({ id: 42 });
    apis.createOffscreenDocument.mockResolvedValue(undefined);
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
    apis.createOffscreenDocument.mockResolvedValue(undefined);
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
    expect(apis.downloadFile).toHaveBeenCalledWith('data:video/webm;base64,fakedata', 'brorecord-recording.webm');
    expect(apis.clearRecordingData).toHaveBeenCalled();
    expect(apis.closeOffscreenDocument).toHaveBeenCalled();

    // State should be idle now
    const stateResponse = await handleMessage({ type: 'get-state' });
    expect(stateResponse).toEqual({
      type: 'state-update',
      state: { status: 'idle' },
    });
  });

  it('handles offscreen-error: closes offscreen and returns error', async () => {
    const apis = createMockChromeAPIs();
    apis.getActiveTab.mockResolvedValue({ id: 42 });
    apis.createOffscreenDocument.mockResolvedValue(undefined);
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
});
