// ---------------------------------------------------------------------------
// Offscreen document pure logic -- no side effects, no browser API imports
// ---------------------------------------------------------------------------
// This module contains pure functions for constructing messages and a handler
// that orchestrates recording sessions. The effectful boundary (offscreen.ts)
// wires browser APIs to these functions.
// ---------------------------------------------------------------------------

import type { SWToOffscreen, OffscreenToSW } from './types';

// --- Tab capture constraint building ----------------------------------------

export const buildMediaConstraints = (streamId: string): MediaStreamConstraints => ({
  audio: {
    mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId },
  } as unknown as MediaTrackConstraints,
  video: {
    mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId },
  } as unknown as MediaTrackConstraints,
});

// --- Message builders ------------------------------------------------------

export const buildResultMessage = (format: 'mp4' | 'webm'): OffscreenToSW => ({
  type: 'offscreen-result',
  format,
});

export const buildErrorMessage = (error: string): OffscreenToSW => ({
  type: 'offscreen-error',
  error,
});

// --- Port types for browser API injection ----------------------------------

export type MediaAPIs = {
  readonly getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  readonly storeRecording: (blob: Blob) => Promise<void>;
  readonly sendMessage: (message: OffscreenToSW) => void;
};

// --- Recorder session port type --------------------------------------------
// A recorder session captures a MediaStream and produces a Blob on stop.

export type RecorderSession = {
  readonly stop: () => Promise<Blob>;
};

export type CreateRecorder = (stream: MediaStream) => RecorderSession;

// --- Effectful message handler (wired at boundary) -------------------------

export const createOffscreenMessageHandler = (
  apis: MediaAPIs,
  createRecorder: CreateRecorder,
) => {
  let session: RecorderSession | null = null;
  let stream: MediaStream | null = null;

  const acquireStream = async (streamId: string): Promise<MediaStream> => {
    const constraints = buildMediaConstraints(streamId);
    return await apis.getUserMedia(constraints);
  };

  const handleStart = async (streamId: string): Promise<void> => {
    if (session !== null) return;

    try {
      stream = await acquireStream(streamId);
      session = createRecorder(stream);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      apis.sendMessage(buildErrorMessage(errorMessage));
    }
  };

  const handleStop = async (): Promise<OffscreenToSW> => {
    if (!session || !stream) {
      const errorMsg = buildErrorMessage('No active recording session');
      apis.sendMessage(errorMsg);
      return errorMsg;
    }

    try {
      const recordingBlob = await session.stop();
      await apis.storeRecording(recordingBlob);
      const resultMsg = buildResultMessage('webm');
      apis.sendMessage(resultMsg);
      return resultMsg;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorMsg = buildErrorMessage(errorMessage);
      apis.sendMessage(errorMsg);
      return errorMsg;
    } finally {
      // Data URLs are self-contained strings that survive offscreen document
      // closure, so cleanup here is safe. Chrome will auto-close the offscreen
      // document when USER_MEDIA has no active tracks.
      session = null;
      stream = null;
    }
  };

  return async (message: SWToOffscreen): Promise<OffscreenToSW | void> => {
    switch (message.type) {
      case 'offscreen-start':
        return handleStart(message.streamId);
      case 'offscreen-stop':
        return handleStop();
    }
  };
};
