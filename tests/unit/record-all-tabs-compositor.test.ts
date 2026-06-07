// ---------------------------------------------------------------------------
// Unit seams — record-all-tabs (R1-cropped), DELIVER 02-02
// ---------------------------------------------------------------------------
// Two headless-testable seams of the cropped-window record flow (the live
// capture itself is @human-gate — Chrome 148 blocks CDP/headless getDisplayMedia,
// so crop fidelity on real pixels is dogfooded, not asserted here):
//
//   A. Compositor wiring (crop-compositor.ts) — given a fake <video>, a fake
//      <canvas> exposing captureStream, a CropRect, and the granted stream, the
//      compositor must (1) DELEGATE output sizing to the pure crop-geometry.ts
//      (no geometry of its own), (2) size the canvas to those output dims,
//      (3) draw the cropped sub-rect each frame via drawImage(video, CropRect→canvas),
//      (4) hand the canvas.captureStream() VIDEO track to the recorder, and
//      (5) pass through the granted AUDIO track unchanged (Decision B).
//
//   B. AC2.4 cancel→notice (record.ts startWindowCroppedRecording) — when the
//      injected getDisplayMedia rejects (NotAllowedError / cancelled picker), the
//      record page renders a VISIBLE one-line notice, returns to idle, and NEVER
//      downloads a file (no createRecordingSession, no download).
//
// Both seams are exercised port-to-port: drive through the exported function,
// assert on the observable result (returned stream shape, recorder input,
// notice text, download-not-called). Browser deps are injected as function
// parameters (functional DI) — no jsdom, no mock libraries beyond vi.fn spies
// at the effect boundary, matching the existing firefox-record-tab.test.ts style.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { composeCroppedStream } from '../../src/crop-compositor';
import { startWindowCroppedRecording } from '../../src/record';
import { outputDimensions } from '../../src/crop-geometry';
import type { CropRect } from '../../src/types';

// --- Fakes ------------------------------------------------------------------

type DrawCall = {
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
  readonly dx: number;
  readonly dy: number;
  readonly dw: number;
  readonly dh: number;
};

const makeFakeVideo = (): HTMLVideoElement =>
  ({
    videoWidth: 1920,
    videoHeight: 1080,
    requestVideoFrameCallback: vi.fn(),
  }) as unknown as HTMLVideoElement;

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

/** Fake canvas whose captureStream returns a single cropped video track. */
const makeFakeCanvas = (): {
  canvas: HTMLCanvasElement;
  draws: DrawCall[];
  capturedFps: number[];
  croppedVideoTrack: MediaStreamTrack;
} => {
  const draws: DrawCall[] = [];
  const capturedFps: number[] = [];
  const croppedVideoTrack = { kind: 'video', id: 'cropped-video', stop: vi.fn() } as unknown as MediaStreamTrack;
  const ctx = {
    drawImage: (
      _img: CanvasImageSource,
      sx: number, sy: number, sw: number, sh: number,
      dx: number, dy: number, dw: number, dh: number,
    ) => {
      draws.push({ sx, sy, sw, sh, dx, dy, dw, dh });
    },
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    captureStream: (fps: number) => {
      capturedFps.push(fps);
      // Mirror a real canvas.captureStream(): video-only initially; addTrack
      // appends the passed-through audio track so getAudioTracks reflects it.
      const added: MediaStreamTrack[] = [];
      return {
        getVideoTracks: () => [croppedVideoTrack],
        getAudioTracks: () => added.filter((t) => t.kind === 'audio'),
        getTracks: () => [croppedVideoTrack, ...added],
        addTrack: (track: MediaStreamTrack) => { added.push(track); },
      } as unknown as MediaStream;
    },
  } as unknown as HTMLCanvasElement;
  return { canvas, draws, capturedFps, croppedVideoTrack };
};

const CROP: CropRect = { x: 100, y: 80, w: 640, h: 360 };

// --- Seam A: compositor wiring ----------------------------------------------

describe('crop-compositor: composeCroppedStream wiring (AC1.2 / AC-crop seam)', () => {
  it('delegates output sizing to the pure crop-geometry and sizes the canvas to those dims', () => {
    const video = makeFakeVideo();
    const { canvas } = makeFakeCanvas();
    const granted = makeFakeStream({ audio: false });

    composeCroppedStream({ video, canvas, crop: CROP, granted, fps: 30 });

    const expected = outputDimensions(CROP); // pure source of truth — no duplicate math
    expect(canvas.width).toBe(expected.width);
    expect(canvas.height).toBe(expected.height);
  });

  it('draws ONLY the CropRect sub-rect of the source video onto the canvas (drawImage source = crop)', () => {
    const video = makeFakeVideo();
    const fake = makeFakeCanvas();
    const granted = makeFakeStream({ audio: false });

    composeCroppedStream({ video, canvas: fake.canvas, crop: CROP, granted, fps: 30 });

    expect(fake.draws.length).toBeGreaterThanOrEqual(1);
    const first = fake.draws[0];
    const out = outputDimensions(CROP);
    // Source rectangle is exactly the crop; destination is the full output canvas.
    expect({ sx: first.sx, sy: first.sy, sw: first.sw, sh: first.sh }).toEqual({
      sx: CROP.x, sy: CROP.y, sw: CROP.w, sh: CROP.h,
    });
    expect({ dx: first.dx, dy: first.dy, dw: first.dw, dh: first.dh }).toEqual({
      dx: 0, dy: 0, dw: out.width, dh: out.height,
    });
  });

  it('hands the canvas.captureStream(fps) cropped VIDEO track to the recorder', () => {
    const video = makeFakeVideo();
    const fake = makeFakeCanvas();
    const granted = makeFakeStream({ audio: false });

    const cropped = composeCroppedStream({ video, canvas: fake.canvas, crop: CROP, granted, fps: 24 });

    expect(fake.capturedFps).toContain(24);
    const videoTracks = cropped.getVideoTracks();
    expect(videoTracks).toHaveLength(1);
    expect(videoTracks[0].id).toBe('cropped-video');
    // The source window video track must NOT leak into the cropped stream.
    expect(videoTracks.map((t) => t.id)).not.toContain('src-video');
  });

  it('passes the granted audio track through unchanged when audio was shared (Decision B)', () => {
    const video = makeFakeVideo();
    const fake = makeFakeCanvas();
    const granted = makeFakeStream({ audio: true });

    const cropped = composeCroppedStream({ video, canvas: fake.canvas, crop: CROP, granted, fps: 30 });

    const audioTracks = cropped.getAudioTracks();
    expect(audioTracks).toHaveLength(1);
    expect(audioTracks[0].id).toBe('audio-1');
  });

  it('emits a video-only cropped stream when no audio was shared', () => {
    const video = makeFakeVideo();
    const fake = makeFakeCanvas();
    const granted = makeFakeStream({ audio: false });

    const cropped = composeCroppedStream({ video, canvas: fake.canvas, crop: CROP, granted, fps: 30 });

    expect(cropped.getAudioTracks()).toHaveLength(0);
    expect(cropped.getVideoTracks()).toHaveLength(1);
  });
});

// --- Seam B: AC2.4 cancel -> notice -----------------------------------------

describe('record.ts startWindowCroppedRecording: cancel -> notice (AC2.4)', () => {
  const makeUi = () => {
    const statusEl = { textContent: '' } as HTMLParagraphElement;
    return { statusEl };
  };

  it('renders a visible notice and stays idle without downloading when getDisplayMedia is cancelled (NotAllowedError)', async () => {
    const { statusEl } = makeUi();
    const rejection = Object.assign(new Error('Permission denied by user'), {
      name: 'NotAllowedError',
    });
    const getDisplayMedia = vi
      .fn<(c: MediaStreamConstraints) => Promise<MediaStream>>()
      .mockRejectedValue(rejection);
    const createRecordingSession = vi.fn();
    const download = vi.fn();
    const onStateChange = vi.fn<(s: string) => void>();

    await startWindowCroppedRecording({
      getDisplayMedia,
      createRecordingSession,
      download,
      setStatus: (text: string) => { statusEl.textContent = text; },
      onStateChange,
    });

    // Visible, non-empty notice that names the cancellation.
    expect(statusEl.textContent).not.toBe('');
    expect(statusEl.textContent.length).toBeGreaterThan(0);
    expect(statusEl.textContent).toMatch(/cancel|NotAllowedError|rejected|denied/i);
    // Never silently records the wrong surface: no recorder, no download.
    expect(createRecordingSession).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
    // Returned to idle.
    expect(onStateChange).toHaveBeenLastCalledWith('idle');
  });

  it('requests the window surface with audio in the gesture (displaySurface:window, audio:true)', async () => {
    const { statusEl } = makeUi();
    const getDisplayMedia = vi
      .fn<(c: MediaStreamConstraints) => Promise<MediaStream>>()
      .mockRejectedValue(Object.assign(new Error('cancelled'), { name: 'NotAllowedError' }));

    await startWindowCroppedRecording({
      getDisplayMedia,
      createRecordingSession: vi.fn(),
      download: vi.fn(),
      setStatus: (text: string) => { statusEl.textContent = text; },
      onStateChange: vi.fn(),
    });

    // RC-A: a rejected audio:true request now triggers a no-audio retry, so a
    // reject-all mock is invoked twice. This test pins the FIRST (primary) request
    // shape -- the gesture asks for the window surface WITH audio. (The retry's
    // audio:false shape is pinned in record-all-tabs-acquire-constraints.test.ts.)
    const constraints = getDisplayMedia.mock.calls[0]![0] as MediaStreamConstraints;
    const video = constraints.video as MediaTrackConstraints;
    expect(video.displaySurface).toBe('window');
    expect(constraints.audio).toBe(true);
  });
});
