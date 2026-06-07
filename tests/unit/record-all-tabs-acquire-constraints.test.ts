// ---------------------------------------------------------------------------
// Unit seam — record-all-tabs acquisition constraints (RC-A), DELIVER 01-01
// ---------------------------------------------------------------------------
// RC-A fix: the screen-share picker's Share button is greyed out for surfaces
// that cannot supply audio when getDisplayMedia is requested with audio:true.
// The window-cropped acquisition must DEGRADE gracefully: when the audio:true
// request rejects (the picker leaves Share disabled / the surface rejects), it
// RETRIES the SAME displaySurface with audio:false BEFORE surfacing the cancel
// notice. Only if THAT also rejects does it set the visible notice, return to
// idle, and download nothing (AC2.4 preserved). Decision B is preserved: audio
// is kept when available and dropped ONLY when it cannot be supplied.
//
// These are exercised port-to-port through the exported startWindowCroppedRecording
// driving port: drive with an injected fake getDisplayMedia, assert on the
// observable surface (returned session shape, the constraint args each call
// received, notice text, onStateChange transitions, download-not-called). The
// live capture + real picker is @human-gate (Chrome 148 blocks headless
// getDisplayMedia), so the degrade is proven here via the injected fake.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { startWindowCroppedRecording } from '../../src/record';

const makeFakeStream = (opts: { audio: boolean }): MediaStream => {
  const audioTracks = opts.audio
    ? [{ kind: 'audio', id: 'audio-1', stop: vi.fn() } as unknown as MediaStreamTrack]
    : [];
  const videoTracks = [{ kind: 'video', id: 'src-video', stop: vi.fn() } as unknown as MediaStreamTrack];
  return {
    getAudioTracks: () => audioTracks,
    getVideoTracks: () => videoTracks,
    getTracks: () => [...videoTracks, ...audioTracks],
  } as unknown as MediaStream;
};

const audioRejection = () =>
  Object.assign(new Error('surface cannot supply audio'), { name: 'NotSupportedError' });

const displaySurfaceOf = (constraints: MediaStreamConstraints): unknown =>
  (constraints.video as MediaTrackConstraints | undefined)?.displaySurface;

describe('startWindowCroppedRecording: audio-degrade acquisition (RC-A)', () => {
  it('retries the SAME window surface with audio:false when the audio:true request rejects, then starts recording', async () => {
    // The audio:true call rejects (Share greyed / surface rejects); the no-audio
    // retry resolves a real (audio-less) window stream.
    const grantedNoAudio = makeFakeStream({ audio: false });
    const getDisplayMedia = vi
      .fn<(c: MediaStreamConstraints) => Promise<MediaStream>>()
      .mockRejectedValueOnce(audioRejection())
      .mockResolvedValueOnce(grantedNoAudio);
    const createdSession = { stop: vi.fn(async () => new Blob()) };
    const createRecordingSession = vi.fn(() => createdSession);
    const download = vi.fn();
    const onStateChange = vi.fn<(s: string) => void>();
    const statusEl = { textContent: '' };

    const session = await startWindowCroppedRecording({
      getDisplayMedia,
      createRecordingSession,
      download,
      setStatus: (text: string) => { statusEl.textContent = text; },
      onStateChange,
    });

    // A real started session is returned (not the null cancel path).
    expect(session).toBe(createdSession);
    expect(createRecordingSession).toHaveBeenCalledTimes(1);

    // getDisplayMedia was called TWICE: audio:true first, then audio:false retry.
    expect(getDisplayMedia).toHaveBeenCalledTimes(2);
    const firstConstraints = getDisplayMedia.mock.calls[0]![0]!;
    const secondConstraints = getDisplayMedia.mock.calls[1]![0]!;
    expect(firstConstraints.audio).toBe(true);
    expect(displaySurfaceOf(firstConstraints)).toBe('window');
    // The retry keeps the SAME window surface but drops audio.
    expect(secondConstraints.audio).toBe(false);
    expect(displaySurfaceOf(secondConstraints)).toBe('window');

    // Recording started; no cancel notice surfaced before the retry succeeded.
    expect(onStateChange).toHaveBeenLastCalledWith('recording');
    expect(download).not.toHaveBeenCalled();
  });

  it('surfaces the cancel notice and stays idle (no session, no download) only when BOTH the audio and no-audio requests reject', async () => {
    // Both attempts reject — the surface is genuinely unavailable / cancelled.
    const getDisplayMedia = vi
      .fn<(c: MediaStreamConstraints) => Promise<MediaStream>>()
      .mockRejectedValueOnce(audioRejection())
      .mockRejectedValueOnce(
        Object.assign(new Error('Permission denied by user'), { name: 'NotAllowedError' }),
      );
    const createRecordingSession = vi.fn();
    const download = vi.fn();
    const onStateChange = vi.fn<(s: string) => void>();
    const statusEl = { textContent: '' };

    const session = await startWindowCroppedRecording({
      getDisplayMedia,
      createRecordingSession,
      download,
      setStatus: (text: string) => { statusEl.textContent = text; },
      onStateChange,
    });

    // The cancel path: null returned, both attempts made, visible notice, idle.
    expect(session).toBeNull();
    expect(getDisplayMedia).toHaveBeenCalledTimes(2);
    expect(statusEl.textContent.length).toBeGreaterThan(0);
    expect(statusEl.textContent).toMatch(/cancel|NotAllowedError|rejected|denied/i);
    expect(onStateChange).toHaveBeenLastCalledWith('idle');
    // Never silently records the wrong surface: no recorder, no download.
    expect(createRecordingSession).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it('keeps the audio-success path a single audio:true call (Decision B: audio kept when available)', async () => {
    // The audio:true request succeeds first try — no retry, audio preserved.
    const grantedWithAudio = makeFakeStream({ audio: true });
    const getDisplayMedia = vi
      .fn<(c: MediaStreamConstraints) => Promise<MediaStream>>()
      .mockResolvedValueOnce(grantedWithAudio);
    const createdSession = { stop: vi.fn(async () => new Blob()) };
    const createRecordingSession = vi.fn(() => createdSession);
    const onStateChange = vi.fn<(s: string) => void>();
    const statusEl = { textContent: '' };

    const session = await startWindowCroppedRecording({
      getDisplayMedia,
      createRecordingSession,
      download: vi.fn(),
      setStatus: (text: string) => { statusEl.textContent = text; },
      onStateChange,
    });

    expect(session).toBe(createdSession);
    // Single call, audio kept — no degrade, no second request.
    expect(getDisplayMedia).toHaveBeenCalledTimes(1);
    const constraints = getDisplayMedia.mock.calls[0]![0]!;
    expect(constraints.audio).toBe(true);
    expect(displaySurfaceOf(constraints)).toBe('window');
    expect(onStateChange).toHaveBeenLastCalledWith('recording');
  });
});
