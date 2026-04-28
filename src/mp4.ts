// ---------------------------------------------------------------------------
// MP4 recording session -- records MediaStream as MP4 via WebCodecs + mp4-muxer
// ---------------------------------------------------------------------------
// Uses VideoEncoder (H.264) and AudioEncoder (AAC) with mp4-muxer to produce
// MP4 directly. Falls back to MediaRecorder (WebM) when WebCodecs is unavailable
// or fails to produce output (e.g. fake media devices in test environments).
//
// Both pipelines may run on the same stream, but stop sequencing ensures
// MediaRecorder completes BEFORE WebCodecs readers are cancelled, preventing
// interference.
//
// This is an effectful module (uses browser APIs); the pure logic boundary
// is in offscreen-logic.ts which injects this via a port type.
// ---------------------------------------------------------------------------

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type { RecorderSession, CreateRecorder } from './offscreen-logic';

// --- WebCodecs MP4 session --------------------------------------------------

type WebCodecsHandle = {
  readonly hasOutput: () => boolean;
  readonly finalize: () => Blob;
  readonly cleanup: () => Promise<void>;
};

const createWebCodecsPipeline = (stream: MediaStream): WebCodecsHandle => {
  const videoTrack = stream.getVideoTracks()[0];
  const audioTrack = stream.getAudioTracks()[0];

  if (!videoTrack) {
    throw new Error('No video track in stream');
  }

  const settings = videoTrack.getSettings();
  const width = settings.width ?? 1280;
  const height = settings.height ?? 720;
  const frameRate = settings.frameRate ?? 30;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height },
    ...(audioTrack ? {
      audio: { codec: 'aac', numberOfChannels: 1, sampleRate: 48000 },
    } : {}),
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  let hasDecoderConfig = false;

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      if (meta?.decoderConfig) hasDecoderConfig = true;
      muxer.addVideoChunk(chunk, meta?.decoderConfig ? meta : undefined);
    },
    error: (e) => console.error('[mp4] VideoEncoder error:', e),
  });

  videoEncoder.configure({
    codec: 'avc1.42001f', // Baseline profile, level 3.1
    width,
    height,
    bitrate: 2_500_000,
    framerate: frameRate,
  });

  let audioEncoder: AudioEncoder | null = null;
  let audioReader: ReadableStreamDefaultReader<AudioData> | null = null;
  let audioProcessor: Promise<void> | null = null;

  if (audioTrack) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => console.error('[mp4] AudioEncoder error:', e),
    });

    audioEncoder.configure({
      codec: 'mp4a.40.2', // AAC-LC
      numberOfChannels: 1,
      sampleRate: 48000,
      bitrate: 128_000,
    });

    audioReader = new MediaStreamTrackProcessor({ track: audioTrack }).readable.getReader();
    audioProcessor = (async () => {
      try {
        while (true) {
          const { done, value } = await audioReader!.read();
          if (done) break;
          if (audioEncoder!.state === 'configured') {
            audioEncoder!.encode(value);
          }
          value.close();
        }
      } catch {
        // Reader cancelled during cleanup
      }
    })();
  }

  const videoReader = new MediaStreamTrackProcessor({ track: videoTrack }).readable.getReader();
  let frameCount = 0;
  const videoProcessor = (async () => {
    try {
      while (true) {
        const { done, value } = await videoReader.read();
        if (done) break;
        if (videoEncoder.state === 'configured') {
          const keyFrame = frameCount % (frameRate * 2) === 0;
          videoEncoder.encode(value, { keyFrame });
          frameCount++;
        }
        value.close();
      }
    } catch {
      // Reader cancelled during cleanup
    }
  })();

  const closeEncoder = (enc: VideoEncoder | AudioEncoder) => {
    try { if (enc.state !== 'closed') enc.close(); } catch { /* already closed */ }
  };

  return {
    hasOutput: () => hasDecoderConfig,

    finalize: () => {
      if (!hasDecoderConfig) throw new Error('No decoderConfig from encoder');
      muxer.finalize();
      const { buffer } = muxer.target as ArrayBufferTarget;
      closeEncoder(videoEncoder);
      if (audioEncoder) closeEncoder(audioEncoder);
      return new Blob([buffer], { type: 'video/mp4' });
    },

    cleanup: async () => {
      // Cancel readers and wait for processor loops to exit
      await videoReader.cancel();
      if (audioReader) await audioReader.cancel();
      await videoProcessor;
      if (audioProcessor) await audioProcessor;

      // Flush remaining buffered frames
      const flushEncoder = async (enc: VideoEncoder | AudioEncoder) => {
        try { if (enc.state === 'configured') await enc.flush(); } catch { /* encoder errored */ }
      };
      await flushEncoder(videoEncoder);
      if (audioEncoder) await flushEncoder(audioEncoder);

      closeEncoder(videoEncoder);
      if (audioEncoder) closeEncoder(audioEncoder);
    },
  };
};

// --- MediaRecorder WebM session ---------------------------------------------

/** Timeout (ms) for MediaRecorder.stop() to fire onstop event. */
const MEDIA_RECORDER_STOP_TIMEOUT_MS = 10_000;

const createMediaRecorderSession = (stream: MediaStream): RecorderSession => {
  const mimeTypes = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  const mimeType = mimeTypes.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
  const chunks: Blob[] = [];

  const recorder = new MediaRecorder(stream, {
    ...(mimeType ? { mimeType } : {}),
  });

  recorder.ondataavailable = (event: BlobEvent) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  recorder.start(1000);

  return {
    stop: () =>
      new Promise<Blob>((resolve, reject) => {
        const simpleMime = (mimeType || 'video/webm').split(';')[0];
        const timeoutId = setTimeout(() => {
          console.log('[mp4] MediaRecorder.stop() timed out, resolving with collected chunks');
          resolve(new Blob(chunks, { type: simpleMime }));
        }, MEDIA_RECORDER_STOP_TIMEOUT_MS);

        recorder.onstop = () => {
          clearTimeout(timeoutId);
          // Use simple MIME type without codec params — commas in
          // "codecs=vp8,opus" break data URL parsing downstream.
          const simpleMime = (mimeType || 'video/webm').split(';')[0];
          resolve(new Blob(chunks, { type: simpleMime }));
        };
        recorder.onerror = (event) => {
          clearTimeout(timeoutId);
          reject(new Error(`MediaRecorder error: ${event}`));
        };
        try {
          if (recorder.state === 'inactive') {
            clearTimeout(timeoutId);
            resolve(new Blob(chunks, { type: simpleMime }));
          } else {
            recorder.stop();
          }
        } catch (error) {
          clearTimeout(timeoutId);
          reject(error);
        }
      }),
  };
};

// --- Session factory --------------------------------------------------------
// Both pipelines run on the same stream. On stop:
// 1. Stop MediaRecorder FIRST (get WebM blob before any reader cancellation)
// 2. Check if WebCodecs produced output (hasDecoderConfig)
// 3. If yes: cleanup WebCodecs, finalize MP4, return MP4
// 4. If no: cleanup WebCodecs (cancel readers), return WebM from step 1
//
// This sequencing ensures reader cancellation never interferes with MediaRecorder.

export const createRecordingSession: CreateRecorder = (
  stream: MediaStream,
): RecorderSession => {
  // Always start MediaRecorder (reliable WebM fallback)
  const webmSession = createMediaRecorderSession(stream);

  // Try WebCodecs for MP4 output
  let webcodecs: WebCodecsHandle | null = null;
  if (typeof VideoEncoder !== 'undefined' && typeof MediaStreamTrackProcessor !== 'undefined') {
    try {
      console.log('[mp4] Starting WebCodecs + mp4-muxer pipeline (with MediaRecorder fallback)');
      webcodecs = createWebCodecsPipeline(stream);
    } catch (e) {
      console.log('[mp4] WebCodecs setup failed, using MediaRecorder only:', e);
    }
  } else {
    console.log('[mp4] WebCodecs unavailable, using MediaRecorder (WebM output)');
  }

  // Capture webmBlob lazily so it is available for webmFallback if stop() throws.
  let capturedWebmBlob: Blob | null = null;

  return {
    stop: async () => {
      // 1. Stop MediaRecorder FIRST — before any reader cancellation
      const webmBlob = await webmSession.stop();
      capturedWebmBlob = webmBlob;
      console.log('[mp4] MediaRecorder stopped, blob size:', webmBlob.size);

      if (!webcodecs) {
        return webmBlob;
      }

      // 2. Cleanup WebCodecs (cancel readers, flush encoders)
      await webcodecs.cleanup();

      // 3. Try to finalize MP4
      if (webcodecs.hasOutput()) {
        try {
          const mp4Blob = webcodecs.finalize();
          console.log('[mp4] MP4 finalized successfully, size:', mp4Blob.size);
          return mp4Blob;
        } catch (e) {
          console.log('[mp4] MP4 finalization failed, using WebM fallback:', e);
          return webmBlob;
        }
      }

      // 4. WebCodecs produced no output — use WebM
      console.log('[mp4] WebCodecs produced no output (no decoderConfig), using WebM fallback');
      return webmBlob;
    },

    // Provide WebM fallback for error recovery in offscreen-logic.
    // This is populated after the MediaRecorder stops (i.e. after stop() begins).
    webmFallback: async () => {
      if (capturedWebmBlob) return capturedWebmBlob;
      // If stop() threw before MediaRecorder completed, stop it now to get a blob.
      return webmSession.stop();
    },
  };
};
