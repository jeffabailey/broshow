// ---------------------------------------------------------------------------
// Offscreen document pure logic -- no side effects, no browser API imports
// ---------------------------------------------------------------------------
// This module contains pure functions for building media constraints,
// selecting codecs, assembling blobs, and constructing messages.
// The effectful boundary (offscreen.ts) wires these to browser APIs.
// ---------------------------------------------------------------------------

import type { SWToOffscreen, OffscreenToSW } from './types';

// --- Media constraint building ---------------------------------------------

export const buildMediaConstraints = (streamId: string): MediaStreamConstraints => ({
  audio: {
    mandatory: {
      chromeMediaSource: 'tab',
      chromeMediaSourceId: streamId,
    },
  } as unknown as MediaTrackConstraints,
  video: {
    mandatory: {
      chromeMediaSource: 'tab',
      chromeMediaSourceId: streamId,
    },
  } as unknown as MediaTrackConstraints,
});

// --- MIME type selection ----------------------------------------------------

const PREFERRED_MIME_TYPES = [
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp8',
  'video/webm',
] as const;

const FALLBACK_MIME_TYPE = 'video/webm';

export const selectMimeType = (
  isTypeSupported: (mimeType: string) => boolean,
): string => {
  for (const mimeType of PREFERRED_MIME_TYPES) {
    if (isTypeSupported(mimeType)) {
      return mimeType;
    }
  }
  return FALLBACK_MIME_TYPE;
};

// --- Blob assembly ---------------------------------------------------------

export const assembleBlob = (chunks: readonly Blob[]): Blob =>
  new Blob([...chunks], { type: 'video/webm' });

// --- Message builders ------------------------------------------------------

export const buildResultMessage = (blobUrl: string): OffscreenToSW => ({
  type: 'offscreen-result',
  blobUrl,
  format: 'webm',
});

export const buildErrorMessage = (error: string): OffscreenToSW => ({
  type: 'offscreen-error',
  error,
});

// --- Port types for browser API injection ----------------------------------

export type MediaAPIs = {
  readonly getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  readonly isTypeSupported: (mimeType: string) => boolean;
  readonly createObjectURL: (blob: Blob) => string;
  readonly sendMessage: (message: OffscreenToSW) => void;
};

// --- Effectful message handler (wired at boundary) -------------------------

export const createOffscreenMessageHandler = (
  apis: MediaAPIs,
  MediaRecorderClass: typeof MediaRecorder,
) => {
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let chunks: Blob[] = [];

  const handleStart = async (streamId: string): Promise<void> => {
    try {
      const constraints = buildMediaConstraints(streamId);
      stream = await apis.getUserMedia(constraints);

      const mimeType = selectMimeType(apis.isTypeSupported);
      recorder = new MediaRecorderClass(stream, { mimeType });
      chunks = [];

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onerror = (event: Event) => {
        const errorEvent = event as MediaRecorderErrorEvent;
        const errorMessage = errorEvent.error?.message ?? 'MediaRecorder error';
        apis.sendMessage(buildErrorMessage(errorMessage));
      };

      recorder.start();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      apis.sendMessage(buildErrorMessage(errorMessage));
    }
  };

  const handleStop = async (): Promise<void> => {
    if (!recorder || !stream) {
      return;
    }

    // Wrap stop in a promise to wait for onstop event
    await new Promise<void>((resolve) => {
      if (!recorder) {
        resolve();
        return;
      }

      recorder.onstop = () => {
        const blob = assembleBlob(chunks);
        const blobUrl = apis.createObjectURL(blob);
        apis.sendMessage(buildResultMessage(blobUrl));

        // Clean up stream tracks
        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
        }

        recorder = null;
        stream = null;
        chunks = [];
        resolve();
      };

      recorder.stop();
    });
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
