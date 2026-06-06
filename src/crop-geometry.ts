// ---------------------------------------------------------------------------
// Crop geometry (PURE) -- record-all-tabs (R1-cropped)
// ---------------------------------------------------------------------------
// The ONLY non-trivial new logic of the cropped-window mode. Maps a user-drawn
// drag rectangle (in record-page preview CSS-pixel coords) to a stream-space
// CropRect, clamps it inside the source stream, normalizes a degenerate drag to
// a minimum, and computes the output canvas dimensions.
//
// PURE: deterministic, no DOM, no canvas, no chrome/navigator. Lives under the
// `no-chrome-in-pure-logic` dependency-cruiser rule (depends only on types.ts).
// This is where the >=80% mutation gate lands (per DESIGN wave-decisions §"Pure
// seams for unit + mutation coverage").
//
// Signature per docs/feature/record-all-tabs/design/data-models.md §4.1:
//   toCropRect(dragRectPreviewPx, previewRenderedSize, streamIntrinsicSize) -> CropRect
//
// Pipeline (all steps pure, total over the documented input domain, no input
// mutation):
//   scale (per-axis preview->stream) -> clampEdgesIntoStream -> roundToIntegerPixels
//   -> normalizeDegenerateToMinimum
// ---------------------------------------------------------------------------

import type { CropRect } from './types';

/** A rectangle in record-page preview CSS-pixel coordinates (pointer drag). */
export interface DragRectPreviewPx {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The rendered size of the <video> preview element (CSS px). */
export interface PreviewRenderedSize {
  readonly width: number;
  readonly height: number;
}

/** The intrinsic size of the source window stream (stream px). */
export interface StreamIntrinsicSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Smallest positive-area crop the geometry will emit when a drag is degenerate
 * (zero/negative area -- a single click with no drag). data-models.md §4: w>0, h>0.
 */
const MIN_CROP_SIDE = 2 as const;

/**
 * Force a value to be an even integer not exceeding `value` (H.264 encoders
 * require even width/height). Flooring keeps the result inside the stream bounds.
 */
const floorToEven = (value: number): number => Math.floor(value / 2) * 2;

/** Per-axis preview->stream scale factors (letterbox-safe: X and Y are independent). */
const axisScales = (
  preview: PreviewRenderedSize,
  stream: StreamIntrinsicSize,
): { readonly sx: number; readonly sy: number } => ({
  sx: stream.width / preview.width,
  sy: stream.height / preview.height,
});

/** Clamp a closed interval [lo,hi] into [0,bound], clamping each edge independently. */
const clampInterval = (
  lo: number,
  hi: number,
  bound: number,
): { readonly start: number; readonly extent: number } => {
  const clampedLo = Math.min(Math.max(lo, 0), bound);
  const clampedHi = Math.min(Math.max(hi, 0), bound);
  return { start: clampedLo, extent: clampedHi - clampedLo };
};

/**
 * Map a preview-space drag rectangle to a clamped, integer, positive-area
 * stream-space CropRect. PURE / total / non-mutating.
 */
export const toCropRect = (
  dragRectPreviewPx: DragRectPreviewPx,
  previewRenderedSize: PreviewRenderedSize,
  streamIntrinsicSize: StreamIntrinsicSize,
): CropRect => {
  const { sx, sy } = axisScales(previewRenderedSize, streamIntrinsicSize);

  // Scale both edges of the drag into stream space (per-axis factor).
  const streamLeft = dragRectPreviewPx.x * sx;
  const streamRight = (dragRectPreviewPx.x + dragRectPreviewPx.w) * sx;
  const streamTop = dragRectPreviewPx.y * sy;
  const streamBottom = (dragRectPreviewPx.y + dragRectPreviewPx.h) * sy;

  // Clamp each edge fully inside [0,streamWidth] x [0,streamHeight].
  const horizontal = clampInterval(streamLeft, streamRight, streamIntrinsicSize.width);
  const vertical = clampInterval(streamTop, streamBottom, streamIntrinsicSize.height);

  // Round to integer pixels (the encoder needs integer pixel rects).
  const x = Math.round(horizontal.start);
  const y = Math.round(vertical.start);
  const w = Math.round(horizontal.extent);
  const h = Math.round(vertical.extent);

  // Normalize a degenerate (zero/negative-area) crop to a positive minimum,
  // keeping it inside the stream bounds.
  return {
    x,
    y,
    w: Math.max(w, Math.min(MIN_CROP_SIDE, streamIntrinsicSize.width)),
    h: Math.max(h, Math.min(MIN_CROP_SIDE, streamIntrinsicSize.height)),
  };
};

/**
 * Compute the output canvas dimensions for a CropRect. 1:1 with the crop when it
 * is already even; otherwise rounds DOWN to even (H.264 encoders require even
 * WxH). PURE / total / non-mutating.
 */
export const outputDimensions = (
  crop: CropRect,
): { readonly width: number; readonly height: number } => ({
  width: floorToEven(crop.w),
  height: floorToEven(crop.h),
});
