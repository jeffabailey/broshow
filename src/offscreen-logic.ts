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

export const buildResultMessage = (blobUrl: string, format: 'mp4' | 'webm'): OffscreenToSW => ({
  type: 'offscreen-result',
  blobUrl,
  format,
});

export const buildErrorMessage = (error: string): OffscreenToSW => ({
  type: 'offscreen-error',
  error,
});

// --- Port types for browser API injection ----------------------------------

export type MediaAPIs = {
  readonly getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  readonly createObjectURL: (blob: Blob) => string;
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

  const handleStop = async (): Promise<void> => {
    if (!session || !stream) {
      apis.sendMessage(buildErrorMessage('No active recording session'));
      return;
    }

    try {
      const recordingBlob = await session.stop();
      const blobUrl = apis.createObjectURL(recordingBlob);
      apis.sendMessage(buildResultMessage(blobUrl, 'webm'));
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      apis.sendMessage(buildErrorMessage(errorMessage));
    } finally {
      // Don't stop stream tracks here -- Chrome will auto-close the offscreen
      // document if USER_MEDIA has no active tracks, invalidating blob URLs.
      // The service worker calls closeOffscreenDocument() after downloading,
      // which destroys the document and cleans up all resources.
      session = null;
      stream = null;
    }
  };

  return async (message: SWToOffscreen): Promise<void> => {
    switch (message.type) {
      case 'offscreen-start':
        return handleStart(message.streamId);
      case 'offscreen-stop':
        return handleStop();
    }
  };
};
