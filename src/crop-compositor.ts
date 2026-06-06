// ---------------------------------------------------------------------------
// Canvas-crop compositor (EFFECT) -- record-all-tabs (R1-cropped)
// ---------------------------------------------------------------------------
// Sits in the record page, UPSTREAM of the UNCHANGED createRecordingSession
// (ADR-013, component-boundaries §5). It consumes a CropRect computed by the
// PURE crop-geometry.ts and per frame draws video[CropRect] onto a <canvas>,
// then exposes canvas.captureStream(fps) as the cropped video track. The granted
// audio track (if any) passes through unchanged (Decision B). One stream for the
// whole session -- it NEVER restarts on tab switch; continuity is structural.
//
// This module holds NO geometry of its own. The output canvas dimensions and the
// even-pixel rounding are delegated wholesale to outputDimensions(crop) in
// crop-geometry.ts -- the single source of truth (no duplicate math, QA-4).
//
// EFFECT layer: may touch canvas + MediaStream APIs. It does NOT import chrome /
// navigator and contains no business geometry. Browser objects (the <video> sink,
// the <canvas>) are passed in so the wiring is unit-testable with fakes.
// ---------------------------------------------------------------------------

import { outputDimensions } from './crop-geometry';
import type { CropRect } from './types';

/** Everything the compositor needs to produce a cropped MediaStream. */
export interface ComposeCroppedStreamInput {
  /** Live <video> sink rendering the granted window stream (the draw source). */
  readonly video: HTMLVideoElement;
  /** Offscreen/onscreen <canvas> the cropped sub-rect is drawn onto. */
  readonly canvas: HTMLCanvasElement;
  /** Stream-space crop rectangle, computed by the PURE crop-geometry.ts. */
  readonly crop: CropRect;
  /** The granted window MediaStream -- its audio track (if any) passes through. */
  readonly granted: MediaStream;
  /** Capture frame rate for canvas.captureStream(fps). */
  readonly fps: number;
}

/**
 * Build the cropped MediaStream: a canvas.captureStream() video track showing
 * ONLY the CropRect sub-rect of `video`, plus the granted audio track(s)
 * unchanged. Starts a per-frame draw loop driven by requestVideoFrameCallback
 * (falling back to requestAnimationFrame) so the canvas tracks the live source.
 *
 * Returns the cropped stream ready to hand to createRecordingSession. EFFECT,
 * but all geometry is delegated to crop-geometry.ts (outputDimensions).
 */
export const composeCroppedStream = (input: ComposeCroppedStreamInput): MediaStream => {
  const { video, canvas, crop, granted, fps } = input;

  // Geometry is delegated -- the compositor holds none of its own.
  const output = outputDimensions(crop);
  canvas.width = output.width;
  canvas.height = output.height;

  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('crop-compositor: 2D canvas context unavailable');
  }

  // Draw the crop sub-rect of the source onto the full output canvas. drawImage's
  // 9-arg form maps source rect [crop.x,crop.y,crop.w,crop.h] -> dest rect
  // [0,0,output.width,output.height]; only the crop region is ever rendered, so
  // no tab strip / toolbar / other windows leak into the output (AC-crop).
  const drawFrame = (): void => {
    context.drawImage(
      video,
      crop.x, crop.y, crop.w, crop.h,
      0, 0, output.width, output.height,
    );
    scheduleNextFrame(video, drawFrame);
  };
  drawFrame();

  // Cropped VIDEO comes from the canvas; AUDIO passes through from the source.
  const croppedStream = canvas.captureStream(fps);
  for (const audioTrack of granted.getAudioTracks()) {
    croppedStream.addTrack(audioTrack);
  }

  return croppedStream;
};

/**
 * Schedule the next compositor frame. Prefers requestVideoFrameCallback (fires
 * once per decoded source frame -- the right cadence for compositing live video)
 * and falls back to requestAnimationFrame where it is unavailable. Isolated so
 * the draw cadence is a single, replaceable seam.
 */
const scheduleNextFrame = (video: HTMLVideoElement, frame: () => void): void => {
  const rvfc = (
    video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
    }
  ).requestVideoFrameCallback;
  if (typeof rvfc === 'function') {
    rvfc.call(video, frame);
    return;
  }
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(frame);
  }
};
