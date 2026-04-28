import { describe, it, expect, vi } from 'vitest';
import type { OffscreenToSW } from '../../src/types';

// ---------------------------------------------------------------------------
// Offscreen audio capture -- unit tests verifying audio track inclusion
//
// Acceptance criterion: "A unit test verifies that the MediaRecorder is
// configured with both video and audio tracks."
//
// Strategy: inject a mock getUserMedia that returns a stream with both
// audio and video tracks, then assert the recorder factory receives a
// stream that contains both track kinds.
// ---------------------------------------------------------------------------

describe('offscreen audio capture', () => {
  const createMockMediaAPIs = () => ({
    getUserMedia: vi.fn<(constraints: MediaStreamConstraints) => Promise<MediaStream>>(),
    storeRecording: vi.fn<(blob: Blob) => Promise<boolean>>().mockResolvedValue(true),
    blobToDataUrl: vi.fn<(blob: Blob) => Promise<string>>().mockResolvedValue('data:video/webm;base64,fake'),
    sendMessage: vi.fn<(message: OffscreenToSW) => void>(),
  });

  // Mock stream with both audio and video tracks (simulating a real tab capture)
  const createMockStreamWithAudioAndVideo = (): MediaStream => {
    const videoTrack = { stop: vi.fn(), kind: 'video' } as unknown as MediaStreamTrack;
    const audioTrack = { stop: vi.fn(), kind: 'audio' } as unknown as MediaStreamTrack;
    const allTracks = [videoTrack, audioTrack];
    return {
      getTracks: () => allTracks,
      getAudioTracks: () => [audioTrack],
      getVideoTracks: () => [videoTrack],
    } as unknown as MediaStream;
  };

  it('getUserMedia constraint requests audio track for tab capture', async () => {
    const { buildMediaConstraints } = await import('../../src/offscreen-logic');
    const constraints = buildMediaConstraints('stream-abc');

    // The audio constraint must be present with tab capture source
    expect(constraints.audio).toBeDefined();
    const audioConstraint = constraints.audio as { mandatory: { chromeMediaSource: string; chromeMediaSourceId: string } };
    expect(audioConstraint.mandatory.chromeMediaSource).toBe('tab');
    expect(audioConstraint.mandatory.chromeMediaSourceId).toBe('stream-abc');
  });

  it('getUserMedia constraint requests video track for tab capture', async () => {
    const { buildMediaConstraints } = await import('../../src/offscreen-logic');
    const constraints = buildMediaConstraints('stream-abc');

    // The video constraint must be present with tab capture source
    expect(constraints.video).toBeDefined();
    const videoConstraint = constraints.video as { mandatory: { chromeMediaSource: string; chromeMediaSourceId: string } };
    expect(videoConstraint.mandatory.chromeMediaSource).toBe('tab');
    expect(videoConstraint.mandatory.chromeMediaSourceId).toBe('stream-abc');
  });

  it('recorder factory receives stream with both audio and video tracks when tab has audio', async () => {
    const apis = createMockMediaAPIs();
    const streamWithAudioAndVideo = createMockStreamWithAudioAndVideo();
    apis.getUserMedia.mockResolvedValue(streamWithAudioAndVideo);

    // Spy on what stream the recorder factory receives
    const webmBlob = new Blob(['fake-webm'], { type: 'video/webm' });
    const stopFn = vi.fn<() => Promise<Blob>>().mockResolvedValue(webmBlob);
    const factory = vi.fn().mockReturnValue({ stop: stopFn });

    const { createOffscreenMessageHandler } = await import('../../src/offscreen-logic');
    const handleMessage = createOffscreenMessageHandler(apis, factory);

    await handleMessage({ type: 'offscreen-start', streamId: 'test-stream-audio' });

    // The recorder factory must have been called with the stream
    expect(factory).toHaveBeenCalledOnce();
    const receivedStream: MediaStream = factory.mock.calls[0][0];

    // Verify the stream passed to the recorder includes both track kinds
    const audioTracks = receivedStream.getAudioTracks();
    const videoTracks = receivedStream.getVideoTracks();

    expect(audioTracks).toHaveLength(1);
    expect(videoTracks).toHaveLength(1);
    expect(audioTracks[0].kind).toBe('audio');
    expect(videoTracks[0].kind).toBe('video');
  });

  it('MediaRecorder is not started with audio-only constraint when tab has audio', async () => {
    // Confirm constraint shape has BOTH audio and video — never audio-only
    const { buildMediaConstraints } = await import('../../src/offscreen-logic');
    const constraints = buildMediaConstraints('any-stream-id');

    expect(constraints.audio).toBeDefined();
    expect(constraints.video).toBeDefined();
  });
});
