import { describe, it, expect } from 'vitest';
import { shouldShowMicAudioOptions } from '../../src/record';
import type { CapabilityCheckResult } from '../../src/popup-logic';

// The mic / virtual-audio-device ("BlackHole") audio options on the record page
// exist ONLY because Firefox + macOS cannot capture tab/window audio directly
// (Mozilla Bug 1541425). On Chromium the window-cropped getDisplayMedia path
// captures window/system audio directly, so the whole block is irrelevant and
// must be hidden. This pins that platform decision as a pure predicate.
describe('record page: mic/BlackHole audio-options visibility by platform', () => {
  it('SHOWS the mic / virtual-audio-device options on the Firefox path', () => {
    const firefox: CapabilityCheckResult = {
      supported: true,
      path: 'firefox-display-media',
    };
    expect(shouldShowMicAudioOptions(firefox)).toBe(true);
  });

  it('HIDES the Firefox-only mic/BlackHole options on Chromium', () => {
    const chromium: CapabilityCheckResult = {
      supported: true,
      path: 'chromium-offscreen',
    };
    expect(shouldShowMicAudioOptions(chromium)).toBe(false);
  });

  it('HIDES the options when recording is unsupported (safe default)', () => {
    const unsupported: CapabilityCheckResult = {
      supported: false,
      reason: 'unsupported browser',
    };
    expect(shouldShowMicAudioOptions(unsupported)).toBe(false);
  });
});
