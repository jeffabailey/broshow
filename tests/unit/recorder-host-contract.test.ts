// ---------------------------------------------------------------------------
// RecorderHost port contract tests
// ---------------------------------------------------------------------------
// Pins the shape of the new RecorderHost port and asserts that BOTH adapters
// (ChromiumOffscreenRecorderHost, FirefoxBackgroundRecorderHost) honor the
// same RecordingState transitions when driven by createMessageHandler from
// background-logic.ts.
//
// These tests use fakes for the MediaAPIs boundary so they remain pure-logic
// tests (no real getDisplayMedia, no real chrome.offscreen). The real-IO
// integration of each adapter is covered by:
//   - Chromium adapter:  tests/acceptance/firefox-recording-support/walking-skeleton.spec.ts
//   - Firefox adapter:   tests/acceptance/firefox-recording-support/firefox-host-smoke.spec.ts
//                        (manual matrix in outcome-kpis.md)
//
// AC traceability: AC-FF-01 (start path), AC-FF-02 (picker-cancelled is
// non-error), AC-FF-05 (webm fallback exit), AC-FF-06 (Chromium parity).
//
// @property tag candidates: shape invariants ("for any selectHost result,
// start and stop are functions" -- see "RecorderHost shape" section).
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import type {
  RecorderHost,
  HostStartInput,
  HostStartResult,
  HostStopResult,
  Target,
} from '../../src/recorder-host';
import { selectHost } from '../../src/recorder-host';

// --- @property -- RecorderHost shape invariant ---------------------------------

describe('@property RecorderHost shape invariant for any selected target', () => {
  // For any valid Target, selectHost must return an object with `start` and
  // `stop` callable members. Implemented as a single-example test today; the
  // crafter implements property-based generation in DELIVER per the @property
  // tag in test-scenarios.md.
  const ALL_TARGETS: ReadonlyArray<Target> = ['chromium', 'firefox'];

  for (const target of ALL_TARGETS) {
    it.skip(`selectHost(${JSON.stringify(target)}) returns a host whose start and stop are callable`, () => {
      const host: RecorderHost = selectHost(target);
      expect(typeof host.start).toBe('function');
      expect(typeof host.stop).toBe('function');
    });
  }
});

// --- AC-FF-02: picker cancellation is a non-error variant ----------------------

describe('AC-FF-02 picker cancellation is non-error on the Firefox adapter', () => {
  it.skip('FirefoxBackgroundRecorderHost.start returns { ok: false, cause: "picker-cancelled" } when the user cancels the picker', async () => {
    // Driving port (boundary): selectHost('firefox').start({ target: 'firefox' })
    // Observable outcome: ok=false, cause is the discriminated-union variant
    //                     'picker-cancelled' -- not a thrown error.
    const host = selectHost('firefox');
    const input: HostStartInput = { target: 'firefox' };
    const result: HostStartResult = await host.start(input);
    expect(result).toEqual({ ok: false, cause: 'picker-cancelled' });
  });

  it.skip('ChromiumOffscreenRecorderHost.start returns { ok: true, hadAudioTrack: true } on the happy path', async () => {
    // Observable outcome: tabCapture-derived MediaStream always carries audio
    //                     on Chromium today (data-models.md §4.1).
    const host = selectHost('chromium');
    const input: HostStartInput = { target: 'chromium', streamId: 'stream-test' };
    const result: HostStartResult = await host.start(input);
    expect(result).toEqual({ ok: true, hadAudioTrack: true });
  });
});

// --- AC-FF-01 / AC-FF-05: stop returns mp4 or webm-fallback shape -------------

describe('AC-FF-01 / AC-FF-05 stop result shape parity across adapters', () => {
  it.skip('FirefoxBackgroundRecorderHost.stop returns { ok: true, format: "mp4", dataUrl } on the happy path', async () => {
    const host = selectHost('firefox');
    await host.start({ target: 'firefox' });
    const result: HostStopResult = await host.stop();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.format).toBe('mp4');
      expect(typeof result.dataUrl).toBe('string');
      expect(result.dataUrl.length).toBeGreaterThan(0);
    }
  });

  it.skip('FirefoxBackgroundRecorderHost.stop returns { ok: false, cause: "mux-error", fallbackDataUrl } when mp4-mux fails (AC-FF-05 webm fallback)', async () => {
    // Observable outcome: the host surfaces a fallback dataUrl rather than
    // throwing -- the SW maps this onto the existing fallback-notice broadcast.
    const host = selectHost('firefox');
    await host.start({ target: 'firefox' });
    const result: HostStopResult = await host.stop();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.cause).toBe('mux-error');
      expect(result.fallbackDataUrl).toBeDefined();
    }
  });

  it.skip('ChromiumOffscreenRecorderHost.stop returns the same HostStopResult shape as the Firefox adapter (AC-FF-06 parity)', async () => {
    const host = selectHost('chromium');
    await host.start({ target: 'chromium', streamId: 'stream-x' });
    const result: HostStopResult = await host.stop();
    // Shape parity: same discriminant, same fields when ok=true
    expect(['mp4', 'webm']).toContain(result.ok ? result.format : 'mp4');
  });
});

// --- AC-FF-06: only one platform branch lives in selectHost --------------------

describe('AC-FF-06 selectHost is the single platform branch', () => {
  it.skip('selectHost("chromium") and selectHost("firefox") return distinct adapter instances', () => {
    const chromiumHost = selectHost('chromium');
    const firefoxHost = selectHost('firefox');
    // Observable: two different host objects -- proves the branch dispatched.
    expect(chromiumHost).not.toBe(firefoxHost);
    // Both honor the same port shape.
    expect(typeof chromiumHost.start).toBe('function');
    expect(typeof firefoxHost.start).toBe('function');
  });
});
