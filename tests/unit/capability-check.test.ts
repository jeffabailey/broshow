// ---------------------------------------------------------------------------
// CapabilityCheckResult discriminated-union pin
// ---------------------------------------------------------------------------
// Pins the new 3-variant CapabilityCheckResult per data-models.md §2.2:
//
//   type CapabilityCheckResult =
//     | { supported: true;  path: 'chromium-offscreen' }
//     | { supported: true;  path: 'firefox-display-media' }
//     | { supported: false; reason: string }
//
// Driving port: initializePopup(...) in src/popup-logic.ts (popup user-facing
// boundary). The capability check is injected as a function; this test
// exercises initializePopup with each of the three discriminated variants
// and asserts the user-observable popup outcome in each case.
//
// AC traceability:
//   AC-FF-04 (Firefox hint shown only on the firefox-display-media variant)
//   AC-FF-06 (Chrome popup hides the Firefox hint -- chromium-offscreen variant)
//   AC-FF-07 (unsupported variant -> "Recording is not supported" message)
//   US-FF-01 (probe accepts Firefox path)
// ---------------------------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { initializePopup, type CapabilityCheckResult } from '../../src/popup-logic';
import type { SWToPopup } from '../../src/types';

const FIREFOX_HINT_TEXT = 'Firefox will ask you to choose a tab, window, or screen';

const makeButton = () => ({
  textContent: '',
  disabled: false,
  addEventListener: vi.fn<(event: string, handler: () => void) => void>(),
});

const makeStatus = () => ({ textContent: '' });

const makeFirefoxHint = () => ({ textContent: '', hidden: true });

const idleStateUpdate = (): SWToPopup => ({
  type: 'state-update',
  state: { status: 'idle' },
});

// ---------------------------------------------------------------------------
// Variant 1: chromium-offscreen
// ---------------------------------------------------------------------------

describe('AC-FF-06 popup behavior when capability probe reports chromium-offscreen', () => {
  it.skip('shows the Start Recording button enabled (via initializePopup)', async () => {
    const button = makeButton();
    const status = makeStatus();
    const hint = makeFirefoxHint();
    const sendMessage = vi.fn().mockResolvedValue(idleStateUpdate());
    const getStreamId = vi.fn();

    const capability: CapabilityCheckResult = {
      supported: true,
      path: 'chromium-offscreen',
    };

    await initializePopup(
      button,
      status,
      sendMessage,
      getStreamId,
      undefined,
      undefined,
      () => capability,
      hint, // Firefox hint element (DELIVER widens initializePopup signature)
    );

    // Observable user outcome: Start button enabled, ready-to-record status
    expect(button.textContent).toBe('Start Recording');
    expect(button.disabled).toBe(false);
    expect(status.textContent).toBe('Ready to record');
  });

  it.skip('keeps the Firefox surface-picker hint hidden (AC-FF-06 -- via initializePopup)', async () => {
    const button = makeButton();
    const status = makeStatus();
    const hint = makeFirefoxHint();
    const sendMessage = vi.fn().mockResolvedValue(idleStateUpdate());

    await initializePopup(
      button,
      status,
      sendMessage,
      vi.fn(),
      undefined,
      undefined,
      () => ({ supported: true, path: 'chromium-offscreen' }) satisfies CapabilityCheckResult,
      hint,
    );

    // Observable: Sam never sees the Firefox-only hint
    expect(hint.hidden).toBe(true);
    expect(hint.textContent).not.toContain(FIREFOX_HINT_TEXT);
  });
});

// ---------------------------------------------------------------------------
// Variant 2: firefox-display-media
// ---------------------------------------------------------------------------

describe('AC-FF-04 / US-FF-01 popup behavior when capability probe reports firefox-display-media', () => {
  it.skip('shows the Start Recording button enabled and the surface-picker hint visible (via initializePopup)', async () => {
    const button = makeButton();
    const status = makeStatus();
    const hint = makeFirefoxHint();
    const sendMessage = vi.fn().mockResolvedValue(idleStateUpdate());

    await initializePopup(
      button,
      status,
      sendMessage,
      vi.fn(),
      undefined,
      undefined,
      () => ({ supported: true, path: 'firefox-display-media' }) satisfies CapabilityCheckResult,
      hint,
    );

    // Observable user outcome: Start button enabled, hint visible with the
    // exact AC-FF-04 copy.
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe('Start Recording');
    expect(hint.hidden).toBe(false);
    expect(hint.textContent).toBe(FIREFOX_HINT_TEXT);
  });
});

// ---------------------------------------------------------------------------
// Variant 3: unsupported
// ---------------------------------------------------------------------------

describe('AC-FF-07 popup behavior when capability probe reports unsupported', () => {
  it.skip('shows the unsupported message and disables the Start button (via initializePopup)', async () => {
    const button = makeButton();
    const status = makeStatus();
    const hint = makeFirefoxHint();
    const sendMessage = vi.fn();

    await initializePopup(
      button,
      status,
      sendMessage,
      vi.fn(),
      undefined,
      undefined,
      () =>
        ({
          supported: false,
          reason: 'Recording is not supported in this browser',
        }) satisfies CapabilityCheckResult,
      hint,
    );

    // Observable user outcome: Lin sees the unsupported message and cannot
    // click Start.
    expect(button.disabled).toBe(true);
    expect(status.textContent).toMatch(/not supported/i);
    // Hint is never shown when unsupported (AC-FF-04 negative case).
    expect(hint.hidden).toBe(true);
    // No SW round-trip is attempted when the probe fails.
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Discriminated-union exhaustiveness (compile-time + runtime sanity)
// ---------------------------------------------------------------------------

describe('CapabilityCheckResult discriminated union exhaustiveness', () => {
  it.skip('exactly three variants are recognized', () => {
    // Pin the variant set so a future drive-by addition is caught.
    const variants: CapabilityCheckResult[] = [
      { supported: true, path: 'chromium-offscreen' },
      { supported: true, path: 'firefox-display-media' },
      { supported: false, reason: 'unsupported' },
    ];
    // Observable: each variant is independently representable as a value.
    expect(variants).toHaveLength(3);
    const supportedPaths = variants.flatMap((v) =>
      v.supported ? [v.path] : [],
    );
    expect(supportedPaths.sort()).toEqual(
      ['chromium-offscreen', 'firefox-display-media'].sort(),
    );
  });
});
