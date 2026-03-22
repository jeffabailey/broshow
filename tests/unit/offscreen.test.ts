import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SWToOffscreen, OffscreenToSW } from '../../src/types';

// ---------------------------------------------------------------------------
// Pure offscreen logic -- message handling and media constraints
// ---------------------------------------------------------------------------

describe('offscreen-logic', () => {
  describe('buildMediaConstraints', () => {
    it('creates getUserMedia constraints from streamId', async () => {
      const { buildMediaConstraints } = await import('../../src/offscreen-logic');
      const constraints = buildMediaConstraints('stream-abc');

      expect(constraints).toEqual({
        audio: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: 'stream-abc',
          },
        },
        video: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: 'stream-abc',
          },
        },
      });
    });
  });

  describe('selectMimeType', () => {
    it('returns preferred codec when supported', async () => {
      const { selectMimeType } = await import('../../src/offscreen-logic');
      const isSupported = (mime: string) => mime === 'video/webm;codecs=vp8,opus';

      expect(selectMimeType(isSupported)).toBe('video/webm;codecs=vp8,opus');
    });

    it('falls back to video/webm when preferred not supported', async () => {
      const { selectMimeType } = await import('../../src/offscreen-logic');
      const isSupported = (mime: string) => mime === 'video/webm';

      expect(selectMimeType(isSupported)).toBe('video/webm');
    });

    it('returns video/webm as last resort when nothing supported', async () => {
      const { selectMimeType } = await import('../../src/offscreen-logic');
      const isSupported = (_mime: string) => false;

      expect(selectMimeType(isSupported)).toBe('video/webm');
    });
  });

  describe('buildResultMessage', () => {
    it('creates offscreen-result message with mp4 format from blob URL', async () => {
      const { buildResultMessage } = await import('../../src/offscreen-logic');
      const message = buildResultMessage('blob://recording-123', 'mp4');

      expect(message).toEqual({
        type: 'offscreen-result',
        blobUrl: 'blob://recording-123',
        format: 'mp4',
      });
    });

    it('creates offscreen-result message with webm format when specified', async () => {
      const { buildResultMessage } = await import('../../src/offscreen-logic');
      const message = buildResultMessage('blob://recording-123', 'webm');

      expect(message).toEqual({
        type: 'offscreen-result',
        blobUrl: 'blob://recording-123',
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

  describe('assembleBlob', () => {
    it('creates a Blob from chunks with webm mime type', async () => {
      const { assembleBlob } = await import('../../src/offscreen-logic');
      const chunk1 = new Blob(['data1']);
      const chunk2 = new Blob(['data2']);

      const result = assembleBlob([chunk1, chunk2]);

      expect(result.type).toBe('video/webm');
      expect(result.size).toBeGreaterThan(0);
    });

    it('creates an empty blob from no chunks', async () => {
      const { assembleBlob } = await import('../../src/offscreen-logic');
      const result = assembleBlob([]);

      expect(result.type).toBe('video/webm');
      expect(result.size).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Offscreen wiring -- tests verifying MediaRecorder integration
// Uses injected mock browser APIs (no real browser needed)
// ---------------------------------------------------------------------------

describe('offscreen wiring', () => {
  const createMockMediaAPIs = () => ({
    getUserMedia: vi.fn<(constraints: MediaStreamConstraints) => Promise<MediaStream>>(),
    isTypeSupported: vi.fn<(mimeType: string) => boolean>(),
    createObjectURL: vi.fn<(blob: Blob) => string>(),
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

  // Minimal mock MediaRecorder that fires events synchronously for testing
  const createMockMediaRecorderClass = () => {
    let instance: {
      start: () => void;
      stop: () => void;
      ondataavailable: ((event: { data: Blob }) => void) | null;
      onstop: (() => void) | null;
      onerror: ((event: { error: Error }) => void) | null;
      state: string;
    } | null = null;

    const MockMediaRecorder = vi.fn().mockImplementation((_stream: MediaStream, _options: { mimeType: string }) => {
      instance = {
        start: vi.fn().mockImplementation(() => {
          if (instance) instance.state = 'recording';
        }),
        stop: vi.fn().mockImplementation(() => {
          if (instance) {
            instance.state = 'inactive';
            // Simulate data available then stop
            if (instance.ondataavailable) {
              instance.ondataavailable({ data: new Blob(['recorded-data'], { type: 'video/webm' }) });
            }
            if (instance.onstop) {
              instance.onstop();
            }
          }
        }),
        ondataavailable: null,
        onstop: null,
        onerror: null,
        state: 'inactive',
      };
      return instance;
    });

    return { MockMediaRecorder, getInstance: () => instance };
  };

  it('handles offscreen-start: acquires stream and starts MediaRecorder', async () => {
    const apis = createMockMediaAPIs();
    const mockStream = createMockStream();
    apis.getUserMedia.mockResolvedValue(mockStream);
    apis.isTypeSupported.mockReturnValue(true);

    const { MockMediaRecorder } = createMockMediaRecorderClass();

    const { createOffscreenMessageHandler } = await import('../../src/offscreen-logic');
    const handleMessage = createOffscreenMessageHandler(apis, MockMediaRecorder as unknown as typeof MediaRecorder);

    await handleMessage({ type: 'offscreen-start', streamId: 'stream-xyz' });

    expect(apis.getUserMedia).toHaveBeenCalledWith({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: 'stream-xyz',
        },
      },
      video: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: 'stream-xyz',
        },
      },
    });
    expect(MockMediaRecorder).toHaveBeenCalledWith(mockStream, {
      mimeType: 'video/webm;codecs=vp8,opus',
    });
  });

  it('handles offscreen-stop: stops recorder, assembles blob, sends result', async () => {
    const apis = createMockMediaAPIs();
    const mockStream = createMockStream();
    apis.getUserMedia.mockResolvedValue(mockStream);
    apis.isTypeSupported.mockReturnValue(true);
    apis.createObjectURL.mockReturnValue('blob://test-url');

    const { MockMediaRecorder } = createMockMediaRecorderClass();

    const { createOffscreenMessageHandler } = await import('../../src/offscreen-logic');
    const handleMessage = createOffscreenMessageHandler(apis, MockMediaRecorder as unknown as typeof MediaRecorder);

    // Start recording first
    await handleMessage({ type: 'offscreen-start', streamId: 'stream-xyz' });

    // Stop recording - the mock fires ondataavailable + onstop synchronously
    await handleMessage({ type: 'offscreen-stop' });

    expect(apis.createObjectURL).toHaveBeenCalled();
    expect(apis.sendMessage).toHaveBeenCalledWith({
      type: 'offscreen-result',
      blobUrl: 'blob://test-url',
      format: 'webm',
    });
  });

  it('sends error message when getUserMedia fails', async () => {
    const apis = createMockMediaAPIs();
    apis.getUserMedia.mockRejectedValue(new Error('Permission denied'));
    apis.isTypeSupported.mockReturnValue(true);

    const { MockMediaRecorder } = createMockMediaRecorderClass();

    const { createOffscreenMessageHandler } = await import('../../src/offscreen-logic');
    const handleMessage = createOffscreenMessageHandler(apis, MockMediaRecorder as unknown as typeof MediaRecorder);

    await handleMessage({ type: 'offscreen-start', streamId: 'stream-xyz' });

    expect(apis.sendMessage).toHaveBeenCalledWith({
      type: 'offscreen-error',
      error: 'Permission denied',
    });
  });

  it('sends error message when MediaRecorder emits error', async () => {
    const apis = createMockMediaAPIs();
    const mockStream = createMockStream();
    apis.getUserMedia.mockResolvedValue(mockStream);
    apis.isTypeSupported.mockReturnValue(true);

    let capturedInstance: { onerror: ((event: { error: Error }) => void) | null } | null = null;

    const MockMediaRecorder = vi.fn().mockImplementation((_stream: MediaStream, _options: { mimeType: string }) => {
      capturedInstance = {
        start: vi.fn(),
        stop: vi.fn(),
        ondataavailable: null,
        onstop: null,
        onerror: null,
        state: 'inactive',
      };
      return capturedInstance;
    });

    const { createOffscreenMessageHandler } = await import('../../src/offscreen-logic');
    const handleMessage = createOffscreenMessageHandler(apis, MockMediaRecorder as unknown as typeof MediaRecorder);

    await handleMessage({ type: 'offscreen-start', streamId: 'stream-xyz' });

    // Simulate MediaRecorder error event
    if (capturedInstance?.onerror) {
      capturedInstance.onerror({ error: new Error('Encoding error') });
    }

    expect(apis.sendMessage).toHaveBeenCalledWith({
      type: 'offscreen-error',
      error: 'Encoding error',
    });
  });

  it('stops all stream tracks when recording stops', async () => {
    const apis = createMockMediaAPIs();
    const mockStream = createMockStream();
    apis.getUserMedia.mockResolvedValue(mockStream);
    apis.isTypeSupported.mockReturnValue(true);
    apis.createObjectURL.mockReturnValue('blob://test-url');

    const { MockMediaRecorder } = createMockMediaRecorderClass();

    const { createOffscreenMessageHandler } = await import('../../src/offscreen-logic');
    const handleMessage = createOffscreenMessageHandler(apis, MockMediaRecorder as unknown as typeof MediaRecorder);

    await handleMessage({ type: 'offscreen-start', streamId: 'stream-xyz' });
    await handleMessage({ type: 'offscreen-stop' });

    const tracks = mockStream.getTracks();
    for (const track of tracks) {
      expect(track.stop).toHaveBeenCalled();
    }
  });

  it('converts WebM blob to mp4 before sending result when recording stops', async () => {
    const apis = createMockMediaAPIs();
    const mockStream = createMockStream();
    apis.getUserMedia.mockResolvedValue(mockStream);
    apis.isTypeSupported.mockReturnValue(true);
    apis.createObjectURL.mockReturnValue('blob://mp4-url');

    const { MockMediaRecorder } = createMockMediaRecorderClass();

    // Stub mp4 converter: takes a WebM blob, returns an mp4 blob
    const mp4Blob = new Blob(['fake-mp4-data'], { type: 'video/mp4' });
    const convertToMp4 = vi.fn<(blob: Blob) => Promise<Blob>>().mockResolvedValue(mp4Blob);

    const { createOffscreenMessageHandler } = await import('../../src/offscreen-logic');
    const handleMessage = createOffscreenMessageHandler(apis, MockMediaRecorder as unknown as typeof MediaRecorder, convertToMp4);

    // Start then stop recording
    await handleMessage({ type: 'offscreen-start', streamId: 'stream-xyz' });
    await handleMessage({ type: 'offscreen-stop' });

    // The converter should have been called with the assembled WebM blob
    expect(convertToMp4).toHaveBeenCalledOnce();
    const calledWithBlob = convertToMp4.mock.calls[0]![0];
    expect(calledWithBlob).toBeInstanceOf(Blob);
    expect(calledWithBlob.type).toBe('video/webm');

    // The result should report mp4 format
    expect(apis.sendMessage).toHaveBeenCalledWith({
      type: 'offscreen-result',
      blobUrl: 'blob://mp4-url',
      format: 'mp4',
    });

    // createObjectURL should have been called with the mp4 blob, not the webm blob
    expect(apis.createObjectURL).toHaveBeenCalledWith(mp4Blob);
  });

  it('ignores offscreen-stop when not recording', async () => {
    const apis = createMockMediaAPIs();
    apis.isTypeSupported.mockReturnValue(true);

    const { MockMediaRecorder } = createMockMediaRecorderClass();

    const { createOffscreenMessageHandler } = await import('../../src/offscreen-logic');
    const handleMessage = createOffscreenMessageHandler(apis, MockMediaRecorder as unknown as typeof MediaRecorder);

    // Stop without start -- should not throw or send anything
    await handleMessage({ type: 'offscreen-stop' });

    expect(apis.sendMessage).not.toHaveBeenCalled();
  });
});
