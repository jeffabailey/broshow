// ---------------------------------------------------------------------------
// Crop geometry (PURE) unit tests -- record-all-tabs (R1-cropped)
// ---------------------------------------------------------------------------
// PRIMARY MUTATION TARGET. The crop math is the only non-trivial new logic of
// the cropped-window mode; per DESIGN wave-decisions §"Pure seams for unit +
// mutation coverage" this file carries the >=80% mutation kill gate.
//
// Driving port (Mandate 1): the pure function's signature IS its driving port
// (nw-tdd: "Pure domain functions ARE their own driving ports"). We call
// toCropRect / outputDimensions directly -- no DOM, no canvas, no browser.
//
// Mandate 8 (state-delta): EXEMPT. These are pure functions with a single
// return value (nw-tdd "Pure-function tests with single output and no side
// effects"). Traditional assertions on the return value are correct here.
//
// Mandate 9 (PBT mode): layer 1 (unit). @property scenarios are PBT candidates
// -- the crafter implements property-based generation in DELIVER (fast-check
// per the polyglot matrix) where tagged. Pinned example values stay as
// domain-readable canonical cases for reviewers.
//
// One-at-a-time (BDD Outside-In): the FIRST test is enabled (RED against the
// scaffold); the rest are `it.skip` until DELIVER GREENs them one by one.
//
// AC traceability: AC-crop (slice-01 -- content-only output), AC1.2 (the
// stream-space CropRect the compositor crops to), data-models.md §4 invariants.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import {
  toCropRect,
  outputDimensions,
  type DragRectPreviewPx,
  type PreviewRenderedSize,
  type StreamIntrinsicSize,
} from '../../src/crop-geometry';
import type { CropRect } from '../../src/types';

// A preview rendered at half the stream's intrinsic size: a 640x360 preview of
// a 1280x720 window stream. The mapping factor is 2x in both axes.
const HALF_SCALE_PREVIEW: PreviewRenderedSize = { width: 640, height: 360 };
const HD_STREAM: StreamIntrinsicSize = { width: 1280, height: 720 };

describe('crop-geometry.toCropRect -- preview drag rect maps to stream-space CropRect', () => {
  it('maps a centered preview drag to the matching stream-space rectangle (scale applied)', () => {
    // Given: the user drags a 320x180 box at (160,90) over a 640x360 preview of
    //        a 1280x720 window stream (preview is rendered at half scale)
    const drag: DragRectPreviewPx = { x: 160, y: 90, w: 320, h: 180 };

    // When: the pure geometry maps it to stream coordinates
    const crop: CropRect = toCropRect(drag, HALF_SCALE_PREVIEW, HD_STREAM);

    // Then: every coordinate is scaled by the preview->stream factor (2x)
    expect(crop).toEqual({ x: 320, y: 180, w: 640, h: 360 });
  });

  // --- @property -- clamping invariant ------------------------------------
  it('@property the CropRect always lies fully inside the stream bounds for any drag', () => {
    // Given: a drag rectangle that overshoots the preview edges
    const overshoot: DragRectPreviewPx = { x: 600, y: 340, w: 400, h: 400 };

    // When: mapped to stream space
    const crop = toCropRect(overshoot, HALF_SCALE_PREVIEW, HD_STREAM);

    // Then: the crop is clamped inside [0,streamWidth] x [0,streamHeight]
    //       (data-models.md §4: 0<=x, 0<=y, x+w<=streamWidth, y+h<=streamHeight)
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.y).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.w).toBeLessThanOrEqual(HD_STREAM.width);
    expect(crop.y + crop.h).toBeLessThanOrEqual(HD_STREAM.height);
  });

  it('@property width and height are always strictly positive (degenerate drag normalized to a minimum)', () => {
    // Given: a zero-area (degenerate) drag -- a single click, no drag
    const degenerate: DragRectPreviewPx = { x: 100, y: 100, w: 0, h: 0 };

    // When: mapped to stream space
    const crop = toCropRect(degenerate, HALF_SCALE_PREVIEW, HD_STREAM);

    // Then: the geometry normalizes it to a positive-area rectangle
    //       (data-models.md §4: w>0 and h>0)
    expect(crop.w).toBeGreaterThan(0);
    expect(crop.h).toBeGreaterThan(0);
  });

  it('clamps a negative-origin drag (dragged up-and-left past the corner) to the stream origin', () => {
    // Given: a drag whose origin is above/left of the preview (negative coords)
    const negativeOrigin: DragRectPreviewPx = { x: -50, y: -30, w: 200, h: 120 };

    // When: mapped to stream space
    const crop = toCropRect(negativeOrigin, HALF_SCALE_PREVIEW, HD_STREAM);

    // Then: the origin is clamped to (0,0); width/height absorb the overshoot
    expect(crop.x).toBe(0);
    expect(crop.y).toBe(0);
  });

  it('a full-preview drag maps to the full stream (identity crop at scale)', () => {
    // Given: the user drags the entire preview area
    const fullDrag: DragRectPreviewPx = { x: 0, y: 0, w: 640, h: 360 };

    // When: mapped to stream space
    const crop = toCropRect(fullDrag, HALF_SCALE_PREVIEW, HD_STREAM);

    // Then: the crop covers the whole stream
    expect(crop).toEqual({ x: 0, y: 0, w: 1280, h: 720 });
  });

  it('applies independent X and Y scale factors when the preview is letterboxed (non-uniform scale)', () => {
    // Given: a preview rendered at 640x180 of a 1280x720 stream (2x horizontal,
    //        4x vertical -- a letterboxed/squashed preview)
    const squashed: PreviewRenderedSize = { width: 640, height: 180 };
    const drag: DragRectPreviewPx = { x: 100, y: 45, w: 200, h: 90 };

    // When: mapped to stream space
    const crop = toCropRect(drag, squashed, HD_STREAM);

    // Then: X scales by 2, Y scales by 4 -- the factors are computed per-axis
    expect(crop).toEqual({ x: 200, y: 180, w: 400, h: 360 });
  });

  it('rounds fractional stream coordinates to integer pixels (sub-pixel drag)', () => {
    // Given: a drag that maps to fractional stream pixels
    const drag: DragRectPreviewPx = { x: 11, y: 7, w: 33, h: 21 };

    // When: mapped to stream space (2x scale -> .0 here, but assert integrality)
    const crop = toCropRect(drag, HALF_SCALE_PREVIEW, HD_STREAM);

    // Then: all coordinates are integers (the encoder needs integer pixel rects)
    expect(Number.isInteger(crop.x)).toBe(true);
    expect(Number.isInteger(crop.y)).toBe(true);
    expect(Number.isInteger(crop.w)).toBe(true);
    expect(Number.isInteger(crop.h)).toBe(true);
  });
});

describe('crop-geometry.outputDimensions -- canvas size derives from the crop', () => {
  it('returns the crop dimensions 1:1 when they are already even', () => {
    // Given: a crop with even width and height
    const crop: CropRect = { x: 0, y: 0, w: 640, h: 360 };

    // When: output dimensions are computed
    const dims = outputDimensions(crop);

    // Then: they match the crop exactly (1:1 default)
    expect(dims).toEqual({ width: 640, height: 360 });
  });

  it('@property output dimensions are always even (encoder requirement)', () => {
    // Given: a crop with odd dimensions
    const crop: CropRect = { x: 0, y: 0, w: 641, h: 361 };

    // When: output dimensions are computed
    const dims = outputDimensions(crop);

    // Then: both are rounded to even values (H.264 encoders require even WxH)
    expect(dims.width % 2).toBe(0);
    expect(dims.height % 2).toBe(0);
  });
});
