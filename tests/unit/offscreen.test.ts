import { describe, it, expect, vi } from 'vitest';
import type { OffscreenToSW } from '../../src/types';

// ---------------------------------------------------------------------------
// Pure offscreen logic -- message handling and media constraints
// ---------------------------------------------------------------------------

describe('offscreen-logic', () => {
  describe('buildMediaConstraints', () => {
    it('creates getUserMedia constraints for tab capture with streamId', async () => {
      const { buildMediaConstraints } = await import('../../src/offscreen-logic');
      const constraints = buildMediaConstraints('stream-id-123');

      expect(constraints).toEqual({
        audio: {
          mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: 'stream-id-123' },
        },
        video: {
          mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: 'stream-id-123' },
        },
      });
    });
  });

  describe('buildResultMessage', () => {
    it('creates offscreen-result message with mp4 format (no blob data)', async () => {
      const { buildResultMessage } = await import('../../src/offscreen-logic');
      const message = buildResultMessage('mp4');

      expect(message).toEqual({
        type: 'offscreen-result',
        format: 'mp4',
      });
    });

    it('creates offscreen-result message with webm format (no blob data)', async () => {
      const { buildResultMessage } = await import('../../src/offscreen-logic');
      const message = buildResultMessage('webm');

      expect(message).toEqual({
        type: 'offscreen-result',
        format: 'webm',
      });
    });
  });

  describe('buildErrorMessage', () => {
    it('creates offscreen-error message from error string', async () => {
      const { buildErrorMessage } = await import('../../src/offscreen-logic');
      const message = buildErrorMessage('MediaRecorder failed');

      expect(message).toEqual({
        type: 'offscreen-error',
        error: 'MediaRecorder failed',
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Offscreen wiring -- tests verifying recorder session integration
// Uses injected mock browser APIs (no real browser needed)
// ---------------------------------------------------------------------------

describe('offscreen wiring', () => {
  const createMockMediaAPIs = () => ({
    getUserMedia: vi.fn<(constraints: MediaStreamConstraints) => Promise<MediaStream>>(),
    storeRecording: vi.fn<(blob: Blob) => Promise<void>>().mockResolvedValue(undefined),
    sendMessage: vi.fn<(message: OffscreenToSW) => void>(),
  });

  // Minimal mock MediaStream
  const createMockStream = (): MediaStream => {
    const tracks = [{ stop: vi.fn(), kind: 'video' }] as unknown as MediaStreamTrack[];
    return {
      getTracks: () => tracks,
      getAudioTracks: () => [],
      getVideoTracks: () => tracks,
    } as unknown as MediaStream;
  };

  // Mock recorder session factory
  const createMockRecorderFactory = () => {
    const webmBlob = new Blob(['fake-webm-data'], { type: 'video/webm' });
    const stopFn = vi.fn<() => Promise<Blob>>().mockResolvedValue(webmBlob);
    const factory = vi.fn().mockReturnValue({ stop: stopFn });
    return { factory, stopFn, webmBlob };
  };

  it('handles offscreen-start: acquires user media with streamId and creates recorder session', async () => {
    const apis = createMockMediaAPIs();
    const mockStream = createMockStream();
    apis.getUserMedia.mockResolvedValue(mockStream);

    const { factory } = createMockRecorderFactory();

    const { createOffscreenMessageHandler } = await import('../../src/offscreen-logic');
    const handleMessage = createOffscreenMessageHandler(apis, factory);

    await handleMessage({ type: 'offscreen-start', streamId: 'test-stream-id' });

    expect(apis.getUserMedia).toHaveBeenCalledWith({
      audio: {
        mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: 'test-stream-id' },
      },
      video: {
        mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: 'test-stream-id' },
      },
    });
    expect(factory).toHaveBeenCalledWith(mockStream);
  });

  it('handles offscreen-stop: stops session, stores recording in storage, sends lightweight notification', async () => {
    const apis = createMockMediaAPIs();
    const mockStream = createMockStream();
    apis.getUserMedia.mockResolvedValue(mockStream);

    const { factory, stopFn, webmBlob } = createMockRecorderFactory();

    const { createOffscreenMessageHandler } = await import('../../src/offscreen-logic');
    const handleMessage = createOffscreenMessageHandler(apis, factory);

    await handleMessage({ type: 'offscreen-start', streamId: 'test-stream-id' });
    await handleMessage({ type: 'offscreen-stop' });

    expect(stopFn).toHaveBeenCalledOnce();
    expect(apis.storeRecording).toHaveBeenCalledWith(webmBlob);
    expect(apis.sendMessage).toHaveBeenCalledWith({
      type: 'offscreen-result',
      format: 'webm',
    });
  });

  it('sends error message when getUserMedia fails', async () => {
    const apis = createMockMediaAPIs();
    apis.getUserMedia.mockRejectedValue(new Error('Permission denied'));

    const { factory } = createMockRecorderFactory();

    const { createOffscreenMessageHandler } = await import('../../src/offscreen-logic');
    const handleMessage = createOffscreenMessageHandler(apis, factory);

    await handleMessage({ type: 'offscreen-start', streamId: 'test-stream-id' });

    expect(apis.sendMessage).toHaveBeenCalledWith({
      type: 'offscreen-error',
      error: 'Permission denied',
    });
  });

  it('sends error message when recorder session stop fails', async () => {
    const apis = createMockMediaAPIs();
    const mockStream = createMockStream();
    apis.getUserMedia.mockResolvedValue(mockStream);

    const stopFn = vi.fn<() => Promise<Blob>>().mockRejectedValue(new Error('Encoding failed'));
    const factory = vi.fn().mockReturnValue({ stop: stopFn });

    const { createOffscreenMessageHandler } = await import('../../src/offscreen-logic');
    const handleMessage = createOffscreenMessageHandler(apis, factory);

    await handleMessage({ type: 'offscreen-start', streamId: 'test-stream-id' });
    await handleMessage({ type: 'offscreen-stop' });

    expect(apis.sendMessage).toHaveBeenCalledWith({
      type: 'offscreen-error',
      error: 'Encoding failed',
    });
  });

  it('does not stop stream tracks when recording stops (deferred to offscreen doc closure)', async () => {
    const apis = createMockMediaAPIs();
    const mockStream = createMockStream();
    apis.getUserMedia.mockResolvedValue(mockStream);

    const { factory } = createMockRecorderFactory();

    const { createOffscreenMessageHandler } = await import('../../src/offscreen-logic');
    const handleMessage = createOffscreenMessageHandler(apis, factory);

    await handleMessage({ type: 'offscreen-start', streamId: 'test-stream-id' });
    await handleMessage({ type: 'offscreen-stop' });

    // Tracks must NOT be stopped here -- Chrome auto-closes offscreen docs
    // when USER_MEDIA has no active tracks, invalidating blob URLs.
    // Cleanup happens when the service worker calls closeOffscreenDocument().
    const tracks = mockStream.getTracks();
    for (const track of tracks) {
      expect(track.stop).not.toHaveBeenCalled();
    }
  });

  it('does not stop stream tracks even when recorder session fails (deferred to doc closure)', async () => {
    const apis = createMockMediaAPIs();
    const mockStream = createMockStream();
    apis.getUserMedia.mockResolvedValue(mockStream);

    const stopFn = vi.fn<() => Promise<Blob>>().mockRejectedValue(new Error('Encoding failed'));
    const factory = vi.fn().mockReturnValue({ stop: stopFn });

    const { createOffscreenMessageHandler } = await import('../../src/offscreen-logic');
    const handleMessage = createOffscreenMessageHandler(apis, factory);

    await handleMessage({ type: 'offscreen-start', streamId: 'test-stream-id' });
    await handleMessage({ type: 'offscreen-stop' });

    // Same as above -- tracks are NOT stopped in handleStop.
    const tracks = mockStream.getTracks();
    for (const track of tracks) {
      expect(track.stop).not.toHaveBeenCalled();
    }
  });

  it('sends error when offscreen-stop received without active session', async () => {
    const apis = createMockMediaAPIs();
    const { factory } = createMockRecorderFactory();

    const { createOffscreenMessageHandler } = await import('../../src/offscreen-logic');
    const handleMessage = createOffscreenMessageHandler(apis, factory);

    await handleMessage({ type: 'offscreen-stop' });

    expect(apis.sendMessage).toHaveBeenCalledWith({
      type: 'offscreen-error',
      error: 'No active recording session',
    });
  });

  it('ignores duplicate offscreen-start when session already active', async () => {
    const apis = createMockMediaAPIs();
    const mockStream = createMockStream();
    apis.getUserMedia.mockResolvedValue(mockStream);

    const { factory } = createMockRecorderFactory();

    const { createOffscreenMessageHandler } = await import('../../src/offscreen-logic');
    const handleMessage = createOffscreenMessageHandler(apis, factory);

    await handleMessage({ type: 'offscreen-start', streamId: 'test-stream-id' });
    await handleMessage({ type: 'offscreen-start', streamId: 'test-stream-id-2' });

    // getUserMedia should only be called once
    expect(apis.getUserMedia).toHaveBeenCalledOnce();
    expect(factory).toHaveBeenCalledOnce();
  });
});
