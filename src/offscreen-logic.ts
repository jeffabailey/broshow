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

export const buildResultMessage = (format: 'mp4' | 'webm', dataUrl?: string): OffscreenToSW => ({
  type: 'offscreen-result',
  format,
  ...(dataUrl ? { dataUrl } : {}),
});

export const buildErrorMessage = (error: string): OffscreenToSW => ({
  type: 'offscreen-error',
  error,
});

// --- Port types for browser API injection ----------------------------------

export type MediaAPIs = {
  readonly getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  readonly storeRecording: (blob: Blob) => Promise<boolean>;
  readonly blobToDataUrl: (blob: Blob) => Promise<string>;
  readonly sendMessage: (message: OffscreenToSW) => void;
};

// --- Recorder session port type --------------------------------------------
// A recorder session captures a MediaStream and produces a Blob on stop.
// webmFallback, when provided, allows the handler to recover a WebM blob
// if the primary stop (e.g. MP4 muxing) throws an error.

export type RecorderSession = {
  readonly stop: () => Promise<Blob>;
  readonly webmFallback?: () => Promise<Blob>;
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

    // Capture session reference before clearing so webmFallback is accessible.
    const currentSession = session;

    try {
      const recordingBlob = await currentSession.stop();
      const stored = await apis.storeRecording(recordingBlob);
      // If storage succeeded, SW reads from chrome.storage.local.
      // If not (e.g. offscreen lacks chrome.storage), include data URL in message.
      let dataUrl: string | undefined;
      if (!stored) {
        dataUrl = await apis.blobToDataUrl(recordingBlob);
      }
      const format = recordingBlob.type.includes('mp4') ? 'mp4' as const : 'webm' as const;
      const resultMsg = buildResultMessage(format, dataUrl);
      apis.sendMessage(resultMsg);
      return resultMsg;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // If the session provides a WebM fallback blob (e.g. when MP4 muxing fails),
      // store it and include the data URL so the SW can download it as WebM.
      if (currentSession.webmFallback) {
        try {
          const webmBlob = await currentSession.webmFallback();
          const stored = await apis.storeRecording(webmBlob);
          let fallbackDataUrl: string | undefined;
          if (!stored) {
            fallbackDataUrl = await apis.blobToDataUrl(webmBlob);
          }
          const fallbackMsg: OffscreenToSW = {
            type: 'offscreen-error',
            error: errorMessage,
            fallbackDataUrl,
          };
          apis.sendMessage(fallbackMsg);
          return fallbackMsg;
        } catch {
          // If even the fallback fails, fall through to plain error.
        }
      }

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
