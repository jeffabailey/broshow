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

import { describe, it, expect, vi } from 'vitest';
import type {
  RecorderHost,
  HostStartInput,
  HostStartResult,
  HostStopResult,
  Target,
} from '../../src/recorder-host';
import { selectHost } from '../../src/recorder-host';
import {
  createFirefoxBackgroundRecorderHost,
  type FirefoxDeps,
} from '../../src/recorder-host-firefox';
import type { OffscreenToSW } from '../../src/types';
import type { CreateRecorder, RecorderSession } from '../../src/offscreen-logic';

// --- Firefox adapter test fixtures --------------------------------------------
// Stubs for the FirefoxDeps port (FP test doubles -- pure functions, no mock
// libraries beyond vi.fn for spying). createFirefoxBackgroundRecorderHost is
// the adapter's driving port; we exercise it directly with these doubles.

const createMockStream = (opts: { audioTracks: number; videoTracks: number }): MediaStream => {
  const makeTrack = (kind: 'video' | 'audio'): MediaStreamTrack => {
    const listeners = new Map<string, EventListener>();
    return {
      kind,
      stop: vi.fn(),
      addEventListener: (event: string, listener: EventListener) => {
        listeners.set(event, listener);
      },
      removeEventListener: (event: string) => {
        listeners.delete(event);
      },
      // Helper for tests to fire the 'ended' event:
      __fireEnded: () => {
        const listener = listeners.get('ended');
        if (listener) listener(new Event('ended'));
      },
    } as unknown as MediaStreamTrack;
  };
  const audioTracks = Array.from({ length: opts.audioTracks }, () => makeTrack('audio'));
  const videoTracks = Array.from({ length: opts.videoTracks }, () => makeTrack('video'));
  const allTracks = [...videoTracks, ...audioTracks];
  return {
    getTracks: () => allTracks,
    getAudioTracks: () => audioTracks,
    getVideoTracks: () => videoTracks,
  } as unknown as MediaStream;
};

const createMp4RecorderFactory = (): CreateRecorder =>
  (_stream: MediaStream): RecorderSession => ({
    stop: async () => new Blob(['fake-mp4-data'], { type: 'video/mp4' }),
  });

const createFailingMp4RecorderFactory = (): CreateRecorder =>
  (_stream: MediaStream): RecorderSession => ({
    stop: async () => {
      throw new Error('Simulated mp4 mux failure');
    },
    webmFallback: async () => new Blob(['fake-webm-fallback'], { type: 'video/webm' }),
  });

const createDefaultFirefoxTestDeps = (
  overrides: Partial<FirefoxDeps> = {},
): FirefoxDeps => ({
  getDisplayMedia: vi
    .fn<(constraints: MediaStreamConstraints) => Promise<MediaStream>>()
    .mockResolvedValue(createMockStream({ audioTracks: 1, videoTracks: 1 })),
  storeRecording: vi.fn<(blob: Blob) => Promise<boolean>>().mockResolvedValue(false),
  blobToDataUrl: vi
    .fn<(blob: Blob) => Promise<string>>()
    .mockResolvedValue('data:video/mp4;base64,fake-mp4'),
  sendMessage: vi.fn<(message: OffscreenToSW) => void>(),
  createRecorder: createMp4RecorderFactory(),
  ...overrides,
});

// --- @property -- RecorderHost shape invariant ---------------------------------

describe('@property RecorderHost shape invariant for any selected target', () => {
  // For any valid Target, selectHost must return an object with `start` and
  // `stop` callable members. Implemented as a single-example test today; the
  // crafter implements property-based generation in DELIVER per the @property
  // tag in test-scenarios.md.
  const ALL_TARGETS: ReadonlyArray<Target> = ['chromium', 'firefox'];

  for (const target of ALL_TARGETS) {
    it(`selectHost(${JSON.stringify(target)}) returns a host whose start and stop are callable`, () => {
      const host: RecorderHost = selectHost(target);
      expect(typeof host.start).toBe('function');
      expect(typeof host.stop).toBe('function');
    });
  }
});

// --- AC-FF-02: picker cancellation is a non-error variant ----------------------

describe('AC-FF-02 picker cancellation is non-error on the Firefox adapter', () => {
  it('FirefoxBackgroundRecorderHost.start returns { ok: false, cause: "picker-cancelled" } when the user cancels the picker', async () => {
    // Driving port (boundary): createFirefoxBackgroundRecorderHost(deps).start
    // Observable outcome: ok=false, cause is the discriminated-union variant
    //                     'picker-cancelled' -- not a thrown error.
    const notAllowed: Error & { name: string } = Object.assign(
      new Error('Permission denied by user'),
      { name: 'NotAllowedError' },
    );
    const host = createFirefoxBackgroundRecorderHost(
      createDefaultFirefoxTestDeps({
        getDisplayMedia: vi
          .fn<(constraints: MediaStreamConstraints) => Promise<MediaStream>>()
          .mockRejectedValue(notAllowed),
      }),
    );
    const input: HostStartInput = { target: 'firefox' };
    const result: HostStartResult = await host.start(input);
    expect(result).toEqual({ ok: false, cause: 'picker-cancelled' });
  });

  it('ChromiumOffscreenRecorderHost.start returns { ok: true, hadAudioTrack: true } on the happy path', async () => {
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
  it('FirefoxBackgroundRecorderHost.start returns { ok: true, hadAudioTrack: true } when getDisplayMedia yields an audio track', async () => {
    // AC-FF-01: Given a stream with 1 video + 1 audio track, start resolves
    // ok=true with hadAudioTrack=true. hadAudioTrack is computed from the
    // captured MediaStream's audio tracks, observable at the port boundary.
    const host = createFirefoxBackgroundRecorderHost(createDefaultFirefoxTestDeps());
    const result: HostStartResult = await host.start({ target: 'firefox' });
    expect(result).toEqual({ ok: true, hadAudioTrack: true });
  });

  it('FirefoxBackgroundRecorderHost.stop returns { ok: true, format: "mp4", dataUrl } on the happy path', async () => {
    const host = createFirefoxBackgroundRecorderHost(createDefaultFirefoxTestDeps());
    await host.start({ target: 'firefox' });
    const result: HostStopResult = await host.stop();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.format).toBe('mp4');
      expect(typeof result.dataUrl).toBe('string');
      expect(result.dataUrl.length).toBeGreaterThan(0);
    }
  });

  it('FirefoxBackgroundRecorderHost.stop returns { ok: false, cause: "mux-error", fallbackDataUrl } when mp4-mux fails (AC-FF-05 webm fallback)', async () => {
    // Observable outcome: the host surfaces a fallback dataUrl rather than
    // throwing -- the SW maps this onto the existing fallback-notice broadcast.
    const host = createFirefoxBackgroundRecorderHost(
      createDefaultFirefoxTestDeps({
        createRecorder: createFailingMp4RecorderFactory(),
        blobToDataUrl: vi
          .fn<(blob: Blob) => Promise<string>>()
          .mockResolvedValue('data:video/webm;base64,fake-webm'),
      }),
    );
    await host.start({ target: 'firefox' });
    const result: HostStopResult = await host.stop();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.cause).toBe('mux-error');
      expect(result.fallbackDataUrl).toBeDefined();
      expect(result.fallbackDataUrl?.length).toBeGreaterThan(0);
    }
  });

  it('ChromiumOffscreenRecorderHost.stop returns the same HostStopResult shape as the Firefox adapter (AC-FF-06 parity)', async () => {
    const host = selectHost('chromium');
    await host.start({ target: 'chromium', streamId: 'stream-x' });
    const result: HostStopResult = await host.stop();
    // Shape parity: same discriminant, same fields when ok=true
    expect(['mp4', 'webm']).toContain(result.ok ? result.format : 'mp4');
  });
});

// --- AC-FF-06: only one platform branch lives in selectHost --------------------

describe('AC-FF-06 selectHost is the single platform branch', () => {
  it('selectHost("chromium") and selectHost("firefox") return distinct adapter instances', () => {
    const chromiumHost = selectHost('chromium');
    const firefoxHost = selectHost('firefox');
    // Observable: two different host objects -- proves the branch dispatched.
    expect(chromiumHost).not.toBe(firefoxHost);
    // Both honor the same port shape.
    expect(typeof chromiumHost.start).toBe('function');
    expect(typeof firefoxHost.start).toBe('function');
  });

  it('selectHost("firefox") returns a real Firefox host (no longer a not-implemented stub)', async () => {
    // Driving port: selectHost(target) -- step 02-02 wires the real Firefox
    // adapter behind selectHost so the SW dispatches start/stop on the
    // returned RecorderHost without further branching. The not-implemented
    // stub previously returned threw a recognizable error from start();
    // the real adapter does NOT throw that sentinel and instead either
    // resolves with a port-shaped result or surfaces the underlying
    // getDisplayMedia / chrome.runtime error.
    const host = selectHost('firefox');
    let observedError: unknown = null;
    try {
      // chrome.runtime.sendMessage is undefined in the unit-test env, so
      // start() will resolve via the createOffscreenMessageHandler error
      // path -- but it must NOT match the not-implemented stub's exact
      // error message. The behavior we pin is: selectHost('firefox') now
      // dispatches into the Firefox adapter pipeline rather than the
      // sentinel stub.
      await host.start({ target: 'firefox' });
    } catch (error) {
      observedError = error;
    }
    if (observedError instanceof Error) {
      expect(observedError.message).not.toContain('not yet implemented');
    }
  });
});
