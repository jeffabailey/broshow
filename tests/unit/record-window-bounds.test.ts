import { describe, it, expect } from 'vitest';
import { recordWindowBounds } from '../../src/popup-logic';

// The record page hosts the getDisplayMedia picker, which is centered on this
// window. A short fixed window (the old 520x280) left no room for the window-
// selection grid, so Share stayed greyed. recordWindowBounds sizes the window
// generously from the available screen (tall minimum) and centers it.
describe('recordWindowBounds — size the recorder window to fit the picker', () => {
  it('is far taller than the old fixed 280px height (gives the picker room)', () => {
    const b = recordWindowBounds({ availWidth: 1280, availHeight: 800 });
    expect(b.height).toBeGreaterThanOrEqual(640);
  });

  it('scales to a large fraction of the screen and centers the window', () => {
    const b = recordWindowBounds({ availWidth: 1920, availHeight: 1080 });
    expect(b.width).toBeGreaterThan(800);
    expect(b.height).toBeGreaterThan(800);
    // centered: equal margins on both axes
    expect(b.left).toBe(Math.round((1920 - b.width) / 2));
    expect(b.top).toBe(Math.round((1080 - b.height) / 2));
  });

  it('never exceeds the available screen and never goes off-screen', () => {
    const b = recordWindowBounds({ availWidth: 900, availHeight: 600 });
    expect(b.width).toBeLessThanOrEqual(900);
    expect(b.height).toBeLessThanOrEqual(600);
    expect(b.left).toBeGreaterThanOrEqual(0);
    expect(b.top).toBeGreaterThanOrEqual(0);
  });

  it('falls back to sane defaults for missing/invalid screen metrics', () => {
    const b = recordWindowBounds({ availWidth: 0, availHeight: Number.NaN });
    expect(b.width).toBeGreaterThan(0);
    expect(b.height).toBeGreaterThanOrEqual(640);
    expect(b.left).toBeGreaterThanOrEqual(0);
    expect(b.top).toBeGreaterThanOrEqual(0);
  });
});
