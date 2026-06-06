// ---------------------------------------------------------------------------
// Unit seam — record-all-tabs (R1-cropped), DELIVER 03-01
// ---------------------------------------------------------------------------
// The drag-to-select crop-region wiring seam in record.ts. Step 03-01 adds the
// live-preview overlay: a pointer-drag over the preview produces a preview-coord
// DragRectPreviewPx, and on confirm record.ts hands that rect to the PURE
// crop-geometry (via composeFromPreview). record.ts holds NO crop math — ALL
// geometry is delegated.
//
// Crop FIDELITY (real pointer over real window pixels) is @human-gate (Chrome 148
// blocks headless capture). What is headlessly testable, and what this file pins:
//
//   A. dragRectFromPointers — given pointer-down + pointer-up offsets over the
//      preview, derive the preview-coord DragRectPreviewPx. Direction-normalized
//      (drag up-left or down-right both yield positive w/h). This is the only new
//      derivation in record.ts and it is PURE (no DOM, no crop math).
//
//   B. createCropSelection — wires pointerdown/move/up over a fake overlay element
//      and a confirm action; on confirm it calls back with the derived drag rect.
//      Asserts the drag rect equals A's output, and that feeding it through the
//      PURE crop-geometry yields the SAME CropRect record.ts would consume — i.e.
//      record.ts does no crop arithmetic, it delegates to toCropRect.
//
// Driven port-to-port: drive through the exported seam, assert on the observable
// result (derived rect, callback payload, equivalence to crop-geometry output).
// Browser objects are injected as plain fakes — no jsdom, matching the existing
// record-all-tabs-compositor.test.ts style.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import {
  dragRectFromPointers,
  createCropSelection,
} from '../../src/record';
import {
  toCropRect,
  type DragRectPreviewPx,
  type PreviewRenderedSize,
  type StreamIntrinsicSize,
} from '../../src/crop-geometry';
import type { CropRect } from '../../src/types';

// --- A. dragRectFromPointers (pure derivation) ------------------------------

describe('record.ts dragRectFromPointers — pointer offsets -> preview-coord drag rect', () => {
  it('derives a positive-area rect from a top-left -> bottom-right drag', () => {
    const rect = dragRectFromPointers({ x: 40, y: 30 }, { x: 200, y: 150 });
    expect(rect).toEqual<DragRectPreviewPx>({ x: 40, y: 30, w: 160, h: 120 });
  });

  it('normalizes a bottom-right -> top-left drag to the same positive-area rect', () => {
    // Dragging in the reverse direction must yield the identical rectangle
    // (origin at the min corner, positive width/height).
    const rect = dragRectFromPointers({ x: 200, y: 150 }, { x: 40, y: 30 });
    expect(rect).toEqual<DragRectPreviewPx>({ x: 40, y: 30, w: 160, h: 120 });
  });
});

// --- B. createCropSelection (overlay drag-capture + confirm wiring) ----------

/**
 * A minimal fake of the overlay element: records addEventListener handlers so the
 * test can dispatch pointerdown/move/up at chosen offsets, and exposes a way to
 * fire them. Mirrors the pointer-offset surface record.ts reads (offsetX/offsetY).
 */
const makeFakeOverlay = () => {
  const handlers: Record<string, ((e: PointerEvent) => void)[]> = {};
  // Real HTMLElement.style exposes setProperty; mirror the marquee-paint surface
  // record.ts writes (CSS custom properties) so the wiring is exercised faithfully.
  const cssVars: Record<string, string> = {};
  const overlay = {
    addEventListener: (type: string, cb: (e: PointerEvent) => void) => {
      (handlers[type] ??= []).push(cb);
    },
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    style: {
      setProperty: (name: string, value: string) => { cssVars[name] = value; },
    } as unknown as CSSStyleDeclaration,
  } as unknown as HTMLElement;
  const fire = (type: string, offsetX: number, offsetY: number) => {
    for (const cb of handlers[type] ?? []) {
      cb({ offsetX, offsetY, pointerId: 1, preventDefault: vi.fn() } as unknown as PointerEvent);
    }
  };
  return { overlay, fire };
};

const HALF_SCALE_PREVIEW: PreviewRenderedSize = { width: 640, height: 360 };
const HD_STREAM: StreamIntrinsicSize = { width: 1280, height: 720 };

describe('record.ts createCropSelection — drag over preview overlay then confirm', () => {
  it('captures the pointer-drag rect (preview coords) and reports it on confirm', () => {
    const { overlay, fire } = makeFakeOverlay();
    const onConfirm = vi.fn<(rect: DragRectPreviewPx) => void>();

    const selection = createCropSelection(overlay, onConfirm);

    // The user drags a 320x180 box at (160,90) over the preview.
    fire('pointerdown', 160, 90);
    fire('pointermove', 320, 180);
    fire('pointerup', 480, 270);

    // Confirming hands the captured preview-coord rect to the caller.
    selection.confirm();

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const reported = onConfirm.mock.calls[0]![0];
    expect(reported).toEqual<DragRectPreviewPx>({ x: 160, y: 90, w: 320, h: 180 });
  });

  it('record.ts does NO crop math: the reported rect, fed to the PURE crop-geometry, equals toCropRect output', () => {
    const { overlay, fire } = makeFakeOverlay();
    let reported: DragRectPreviewPx | null = null;
    const selection = createCropSelection(overlay, (rect) => { reported = rect; });

    fire('pointerdown', 160, 90);
    fire('pointerup', 480, 270);
    selection.confirm();

    expect(reported).not.toBeNull();
    // The CropRect record.ts would consume is produced SOLELY by crop-geometry —
    // record.ts contributes only the preview-coord drag rect, no scaling/clamping.
    const viaGeometry: CropRect = toCropRect(reported!, HALF_SCALE_PREVIEW, HD_STREAM);
    expect(viaGeometry).toEqual({ x: 320, y: 180, w: 640, h: 360 });
  });

  it('does not report a confirmed rect when no drag occurred (nothing to crop)', () => {
    const { overlay } = makeFakeOverlay();
    const onConfirm = vi.fn<(rect: DragRectPreviewPx) => void>();
    const selection = createCropSelection(overlay, onConfirm);

    // Confirm with no preceding drag: nothing is reported.
    selection.confirm();

    expect(onConfirm).not.toHaveBeenCalled();
  });
});
