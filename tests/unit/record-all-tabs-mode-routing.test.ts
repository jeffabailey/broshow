// ---------------------------------------------------------------------------
// Unit seam — record page mode routing (RC-B), DELIVER 01-02
// ---------------------------------------------------------------------------
// RC-B fix: the window-cropped capture path was DEAD CODE. The popup opened a
// bare record.html with no mode flag, so bootstrapRecordPage always wired the
// action button to the TAB path (startRecording) and NEVER reached
// startWindowCroppedRecording. The fix routes on a ?mode= query param.
//
// Two seams are pinned here, both headless / no real picker (the real
// crop+record pixel flow stays @human-gate -- Chrome 148 blocks headless
// getDisplayMedia):
//
//   1. recordPageModeFromSearch(search) -- PURE/total parse of location.search
//      into 'window-cropped' | 'default'. The routing decision lives here so it
//      is unit-testable without the DOM or the real picker.
//
//   2. The action routing itself -- driven through the injectable seam
//      createRecordPageAction(mode, deps): under 'window-cropped' an action
//      invokes startWindowCroppedRecording (getDisplayMedia called with
//      displaySurface:'window'); under 'default' it invokes the tab path
//      (the injected startTabRecording), NEVER getDisplayMedia(window).
// ---------------------------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { recordPageModeFromSearch, createRecordPageAction } from '../../src/record';

const makeFakeStream = (): MediaStream => {
  const videoTracks = [
    { kind: 'video', id: 'src-video', stop: vi.fn() } as unknown as MediaStreamTrack,
  ];
  const audioTracks = [
    { kind: 'audio', id: 'audio-1', stop: vi.fn() } as unknown as MediaStreamTrack,
  ];
  return {
    getAudioTracks: () => audioTracks,
    getVideoTracks: () => videoTracks,
    getTracks: () => [...videoTracks, ...audioTracks],
  } as unknown as MediaStream;
};

const displaySurfaceOf = (constraints: MediaStreamConstraints): unknown =>
  (constraints.video as MediaTrackConstraints | undefined)?.displaySurface;

// ---------------------------------------------------------------------------
// (a) recordPageModeFromSearch -- PURE/total parse
// ---------------------------------------------------------------------------

describe('recordPageModeFromSearch -- pure mode parse (RC-B)', () => {
  it('parses ?mode=window-cropped to "window-cropped"', () => {
    expect(recordPageModeFromSearch('?mode=window-cropped')).toBe('window-cropped');
  });

  it('treats an empty search, a missing mode, and an unknown mode all as "default"', () => {
    // Total over the input domain: anything that is not exactly the
    // window-cropped flag falls back to the unchanged tab path.
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
// (b) window-cropped routing -- the dead code is now live
// ---------------------------------------------------------------------------

describe('createRecordPageAction -- window-cropped routing invokes startWindowCroppedRecording (RC-B)', () => {
  it('under window-cropped mode, an action invokes startWindowCroppedRecording (getDisplayMedia displaySurface:"window"), NOT the tab path', async () => {
    // Inject a fake getDisplayMedia that resolves an audio-bearing window stream
    // (the audio-success path, single call), and a tab-path spy that MUST NOT run.
    const getDisplayMedia = vi
      .fn<(c: MediaStreamConstraints) => Promise<MediaStream>>()
      .mockResolvedValueOnce(makeFakeStream());
    const createdSession = { stop: vi.fn(async () => new Blob()) };
    const createRecordingSession = vi.fn(() => createdSession);
    const startTabRecording = vi.fn(async () => {});
    const onStateChange = vi.fn<(s: string) => void>();

    const action = createRecordPageAction('window-cropped', {
      getDisplayMedia,
      createRecordingSession,
      download: vi.fn(),
      setStatus: vi.fn(),
      onStateChange,
      startTabRecording,
    });

    await action();

    // The window path ran: getDisplayMedia requested the WINDOW surface...
    expect(getDisplayMedia).toHaveBeenCalledTimes(1);
    expect(displaySurfaceOf(getDisplayMedia.mock.calls[0]![0]!)).toBe('window');
    // ...a recorder session was created and the page is recording...
    expect(createRecordingSession).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenLastCalledWith('recording');
    // ...and the tab path was NEVER taken (the dead-code bug is fixed).
    expect(startTabRecording).not.toHaveBeenCalled();
  });

  it('under default mode (no/other mode param), an action invokes the tab path and NEVER getDisplayMedia(window)', async () => {
    // The single-tab / Firefox path: the action must run the unchanged tab
    // recorder and never touch the window-cropped getDisplayMedia seam.
    const getDisplayMedia = vi.fn<(c: MediaStreamConstraints) => Promise<MediaStream>>();
    const startTabRecording = vi.fn(async () => {});

    const action = createRecordPageAction('default', {
      getDisplayMedia,
      createRecordingSession: vi.fn(),
      download: vi.fn(),
      setStatus: vi.fn(),
      onStateChange: vi.fn(),
      startTabRecording,
    });

    await action();

    // The tab path ran exactly once; the window-cropped seam was never reached.
    expect(startTabRecording).toHaveBeenCalledTimes(1);
    expect(getDisplayMedia).not.toHaveBeenCalled();
  });
});
