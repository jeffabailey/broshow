// ---------------------------------------------------------------------------
// Unit seam — record page surface routing + shared stop/download lifecycle
// (simplify-window-record-no-crop), DELIVER 01-01
// ---------------------------------------------------------------------------
// SIMPLIFICATION: "Record all tabs (window, cropped)" is now "Record all tabs
// (window)" — the WHOLE window is recorded with NO cropping. The crop machinery
// (crop-geometry, crop-compositor, the live preview/compositor wiring, the
// drag-to-select, startWindowCroppedRecording) is DELETED. Both the window mode
// and the single-tab/Firefox mode now run the SAME proven record/stop/download
// lifecycle (the getDisplayMedia path that already works for Firefox). The only
// difference between them is the requested displaySurface.
//
// The earlier bug: window mode used a separate startWindowCroppedRecording that
// returned a session the bootstrap DISCARDED, and Stop was hardwired to the tab
// path — so window-mode Stop never fired the session's stop+download. The fix is
// reuse: ONE lifecycle, ONE stop, surface chosen by mode.
//
// Two seams are pinned here, both headless / no real picker (real whole-window
// capture stays @human-gate — Chrome 148 blocks headless getDisplayMedia):
//
//   1. displayMediaConstraintsForMode(mode) — PURE: window mode →
//      displaySurface:'window'; default mode → displaySurface:'browser'. The
//      surface choice lives in a pure seam so it is unit-testable without the DOM
//      or the real picker.
//
//   2. createRecordLifecycle(mode, deps) — the SHARED start/stop/download
//      lifecycle, driven through injected deps. Drives start→stop for BOTH modes
//      and asserts the SAME stop fires the session's stop + the download (no
//      discarded session, no tab-only-stop). This proves the unwired-Stop bug is
//      gone via reuse.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import {
  recordPageModeFromSearch,
  displayMediaConstraintsForMode,
  createRecordLifecycle,
  type RecordPageMode,
} from '../../src/record';

const makeFakeStream = (opts: { audio: boolean } = { audio: true }): MediaStream => {
  const audioTracks = opts.audio
    ? [{ kind: 'audio', id: 'audio-1', stop: vi.fn() } as unknown as MediaStreamTrack]
    : [];
  const videoTracks = [
    {
      kind: 'video',
      id: 'src-video',
      stop: vi.fn(),
      getSettings: () => ({ displaySurface: 'window' }),
      addEventListener: vi.fn(),
    } as unknown as MediaStreamTrack,
  ];
  return {
    getAudioTracks: () => audioTracks,
    getVideoTracks: () => videoTracks,
    getTracks: () => [...videoTracks, ...audioTracks],
  } as unknown as MediaStream;
};

const displaySurfaceOf = (constraints: MediaStreamConstraints): unknown =>
  (constraints.video as MediaTrackConstraints | undefined)?.displaySurface;

const makeLifecycleDeps = (
  getDisplayMedia: (c: MediaStreamConstraints) => Promise<MediaStream>,
) => {
  const stoppedBlob = new Blob(['x'], { type: 'video/mp4' });
  const createdSession = { stop: vi.fn(async () => stoppedBlob) };
  const createRecordingSession = vi.fn(() => createdSession);
  const download = vi.fn(async () => ({}));
  const setStatus = vi.fn<(t: string) => void>();
  const onStateChange = vi.fn<(s: string) => void>();
  return {
    deps: { getDisplayMedia, createRecordingSession, download, setStatus, onStateChange },
    createdSession,
    createRecordingSession,
    download,
    setStatus,
    onStateChange,
  };
};

// ---------------------------------------------------------------------------
// (a) recordPageModeFromSearch — PURE/total parse (unchanged discriminant)
// ---------------------------------------------------------------------------

describe('recordPageModeFromSearch — pure mode parse', () => {
  it('parses ?mode=window-cropped to "window-cropped"', () => {
    expect(recordPageModeFromSearch('?mode=window-cropped')).toBe('window-cropped');
  });

  it('treats an empty search, a missing mode, and an unknown mode all as "default"', () => {
    expect(recordPageModeFromSearch('')).toBe('default');
    expect(recordPageModeFromSearch('?')).toBe('default');
    expect(recordPageModeFromSearch('?foo=bar')).toBe('default');
    expect(recordPageModeFromSearch('?mode=single-tab')).toBe('default');
    expect(recordPageModeFromSearch('?mode=desktop-screen')).toBe('default');
    expect(recordPageModeFromSearch('?mode=')).toBe('default');
  });

  it('reads the flag regardless of other params present or ordering', () => {
    expect(recordPageModeFromSearch('?foo=bar&mode=window-cropped')).toBe('window-cropped');
    expect(recordPageModeFromSearch('?mode=window-cropped&x=1')).toBe('window-cropped');
  });
});

// ---------------------------------------------------------------------------
// (b) displayMediaConstraintsForMode — PURE surface choice (the simplification)
// ---------------------------------------------------------------------------

describe('displayMediaConstraintsForMode — pure surface choice', () => {
  it('requests displaySurface:"window" for window mode and "browser" for default mode', () => {
    expect(displaySurfaceOf(displayMediaConstraintsForMode('window-cropped'))).toBe('window');
    expect(displaySurfaceOf(displayMediaConstraintsForMode('default'))).toBe('browser');
  });

  it('requests audio on the first attempt for both modes (no-audio retry derives from this)', () => {
    const modes: RecordPageMode[] = ['window-cropped', 'default'];
    for (const mode of modes) {
      expect(displayMediaConstraintsForMode(mode).audio).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// (c) Shared start→stop→download lifecycle — the unwired-Stop bug is gone
// ---------------------------------------------------------------------------

describe('createRecordLifecycle — window mode records the whole window via the proven path', () => {
  it('window mode: start requests displaySurface:"window", then the SAME stop fires the session stop + download', async () => {
    const getDisplayMedia = vi
      .fn<(c: MediaStreamConstraints) => Promise<MediaStream>>()
      .mockResolvedValueOnce(makeFakeStream({ audio: true }));
    const h = makeLifecycleDeps(getDisplayMedia);

    const lifecycle = createRecordLifecycle('window-cropped', h.deps);
    await lifecycle.start();

    // Window surface requested; a recorder session created; page is recording.
    expect(getDisplayMedia).toHaveBeenCalledTimes(1);
    expect(displaySurfaceOf(getDisplayMedia.mock.calls[0]![0]!)).toBe('window');
    expect(h.createRecordingSession).toHaveBeenCalledTimes(1);
    expect(h.onStateChange).toHaveBeenCalledWith('recording');

    // The SAME stop path drives the captured session's stop AND the download —
    // the window session is NOT discarded and Stop is NOT hardwired to the tab
    // path. This is the reuse that fixes the unwired-Stop bug.
    await lifecycle.stop();
    expect(h.createdSession.stop).toHaveBeenCalledTimes(1);
    expect(h.download).toHaveBeenCalledTimes(1);
  });

  it('default mode: start requests displaySurface:"browser", then the SAME stop fires the session stop + download', async () => {
    const getDisplayMedia = vi
      .fn<(c: MediaStreamConstraints) => Promise<MediaStream>>()
      .mockResolvedValueOnce(makeFakeStream({ audio: true }));
    const h = makeLifecycleDeps(getDisplayMedia);

    const lifecycle = createRecordLifecycle('default', h.deps);
    await lifecycle.start();

    expect(getDisplayMedia).toHaveBeenCalledTimes(1);
    expect(displaySurfaceOf(getDisplayMedia.mock.calls[0]![0]!)).toBe('browser');

    await lifecycle.stop();
    expect(h.createdSession.stop).toHaveBeenCalledTimes(1);
    expect(h.download).toHaveBeenCalledTimes(1);
  });

  it('window mode keeps the no-audio retry: when audio:true rejects, the SAME window surface is retried with audio:false before any cancel notice', async () => {
    const getDisplayMedia = vi
      .fn<(c: MediaStreamConstraints) => Promise<MediaStream>>()
      .mockRejectedValueOnce(
        Object.assign(new Error('surface cannot supply audio'), { name: 'NotSupportedError' }),
      )
      .mockResolvedValueOnce(makeFakeStream({ audio: false }));
    const h = makeLifecycleDeps(getDisplayMedia);

    const lifecycle = createRecordLifecycle('window-cropped', h.deps);
    await lifecycle.start();

    // Two attempts: audio:true window first, then audio:false SAME window surface.
    expect(getDisplayMedia).toHaveBeenCalledTimes(2);
    const first = getDisplayMedia.mock.calls[0]![0]!;
    const second = getDisplayMedia.mock.calls[1]![0]!;
    expect(first.audio).toBe(true);
    expect(displaySurfaceOf(first)).toBe('window');
    expect(second.audio).toBe(false);
    expect(displaySurfaceOf(second)).toBe('window');

    // Degraded to no-audio but still recording — no cancel notice, recorder built.
    expect(h.createRecordingSession).toHaveBeenCalledTimes(1);
    expect(h.onStateChange).toHaveBeenCalledWith('recording');
  });
});
