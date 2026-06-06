// ---------------------------------------------------------------------------
// Unit seam — record-all-tabs (R1-cropped), DELIVER 03-02
// ---------------------------------------------------------------------------
// The honest "Recording window region" indicator on the record page (record.ts /
// record.html). The accepted privacy caveat (DESIGN §16) is that the cropped
// window stream hides chrome but still captures whatever window content is
// active; the honest answer is a VISIBLE, always-present indicator telling Dana
// the capture scope is the active window's region. This is US-1 AC1.3 / US-3
// AC3.1's automatable surface (presence + text). Accuracy across real tab
// switches is the @human-gate dogfood (real pixels, Chrome 148).
//
// What is headlessly testable, and what this file pins:
//
//   renderRecordingRegionIndicator(el, active) — a PURE render seam over a single
//   indicator element. When the cropped-window recording is ACTIVE it shows the
//   honest "Recording window region" copy and makes the element visible; when the
//   session is NOT active (idle) it hides the indicator so the page never lies
//   about an inactive scope. No new RecordingState node, no tabs.onActivated — the
//   indicator is a projection of the existing active/idle distinction.
//
// Driven port-to-port: drive through the exported seam, assert on the observable
// element state (textContent + hidden flag). The element is a plain fake mirroring
// the HTMLElement surface the seam writes — no jsdom, matching the existing
// record-all-tabs-crop-selection.test.ts style. @property scenarios follow the
// example-representative + in-test domain-sweep convention of
// record-all-tabs-crop-geometry.test.ts (no fast-check dependency in this repo).
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import {
  renderRecordingRegionIndicator,
  RECORDING_REGION_INDICATOR_TEXT,
} from '../../src/record';

/**
 * Minimal fake of the indicator element: mirrors the textContent + hidden surface
 * the seam writes. Mirrors HTMLElement closely enough that the seam's writes are
 * exercised faithfully without jsdom.
 */
const makeFakeIndicator = (
  priorText: string | null = '',
  priorHidden = false,
): HTMLElement =>
  ({ textContent: priorText, hidden: priorHidden } as unknown as HTMLElement);

describe('record.ts renderRecordingRegionIndicator — honest "Recording window region" scope signal', () => {
  it('shows the honest "Recording window region" copy and reveals the indicator while a window-cropped recording is active', () => {
    const el = makeFakeIndicator();

    renderRecordingRegionIndicator(el, true);

    // The honest indicator copy is present (US-3 AC3.1) ...
    expect(el.textContent).toContain(RECORDING_REGION_INDICATOR_TEXT);
    // ... and the element is visible (not hidden) so Dana always sees the scope.
    expect(el.hidden).toBe(false);
  });

  it('hides the indicator when the session is not active (idle) so the page never lies about an inactive scope', () => {
    const el = makeFakeIndicator();

    renderRecordingRegionIndicator(el, false);

    expect(el.hidden).toBe(true);
  });

  it('the honest copy means "Recording window region" (the contract the acceptance test asserts in the DOM)', () => {
    expect(RECORDING_REGION_INDICATOR_TEXT).toContain('Recording window region');
  });

  // --- @property -- visibility is a faithful projection of active/idle --------
  // The indicator carries no hidden state of its own: hidden === !active for every
  // active value AND every prior element state. Sweeping arbitrary prior
  // text/hidden proves the seam is idempotent and never leaks a stale "active"
  // scope after the session ends. Domain swept: {active} x {prior hidden} x
  // {prior text shapes}.
  it('@property indicator.hidden === !active for any prior element state (no stale scope leak)', () => {
    const priorTexts: (string | null)[] = ['', 'stale', RECORDING_REGION_INDICATOR_TEXT, null];
    for (const active of [true, false]) {
      for (const priorHidden of [true, false]) {
        for (const priorText of priorTexts) {
          const el = makeFakeIndicator(priorText, priorHidden);

          renderRecordingRegionIndicator(el, active);

          expect(el.hidden).toBe(!active);
          if (active) {
            expect(el.textContent).toContain(RECORDING_REGION_INDICATOR_TEXT);
          }
        }
      }
    }
  });
});
