// ---------------------------------------------------------------------------
// Record tab entry point — Firefox-only recording host (ADR-003 Option B)
// ---------------------------------------------------------------------------
// The Firefox MV3 extension popup origin is not allowed to call
// getDisplayMedia (categorically forbidden, not a gesture issue), and the
// background event page can't carry the user gesture. The remaining viable
// host is a regular page (full DOM, full Window privileges) opened in a
// browser window. This file owns that page's lifecycle.
//
// Flow:
//   1. popup.ts opens this page via chrome.windows.create({ type: 'popup' })
//      when the user clicks Start on Firefox.
//   2. User clicks the button in this page → getDisplayMedia → user picks
//      surface → MediaRecorder begins via the shared createRecordingSession.
//   3. Same button toggles to Stop. User clicks Stop → MediaRecorder.stop →
//      mp4-mux + WebM fallback → chrome.downloads.download → status shows
//      saved filename → window can be closed.
// ---------------------------------------------------------------------------

import { createMediaRecorderSession } from './mp4';
import { formatRecordingFilename } from './background-logic';
import { composeCroppedStream } from './crop-compositor';
import { toCropRect, type DragRectPreviewPx } from './crop-geometry';
import type { CropRect } from './types';

type State = 'idle' | 'recording' | 'processing' | 'done';

// ---------------------------------------------------------------------------
// Window-cropped acquisition + error path (AC1.2 / AC2.4) -- injectable seam
// ---------------------------------------------------------------------------
// The cropped-window mode requests the WINDOW surface in the gesture, renders it
// live, crops a sub-rect via the compositor, and hands the cropped stream to the
// UNCHANGED createRecordingSession. The dependencies (getDisplayMedia, recorder
// factory, download, status sink, state callback) are passed in so the
// acquisition + AC2.4 cancel->notice path is unit-testable headlessly (the live
// capture + real crop pixels are @human-gate -- Chrome 148).
//
// On a getDisplayMedia rejection (NotAllowedError / cancelled picker) it renders
// a VISIBLE one-line notice and returns to idle WITHOUT constructing a recorder
// or downloading a file -- never silently capturing the wrong surface (AC2.4).

export interface WindowCroppedRecordingDeps {
  /** getDisplayMedia bound to navigator.mediaDevices (injected for testing). */
  readonly getDisplayMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  /** Recorder-session factory -- the UNCHANGED createRecordingSession (mp4.ts). */
  readonly createRecordingSession: (stream: MediaStream) => { stop: () => Promise<Blob> };
  /** chrome.downloads.download-style sink (only ever called on the success path). */
  readonly download: (args: { url: string; filename: string }) => Promise<unknown>;
  /** Render a visible status / notice line (owns the AC2.4 notice). */
  readonly setStatus: (text: string) => void;
  /** Report the record-page state transitions (idle on cancel). */
  readonly onStateChange: (state: State) => void;
  /**
   * Optional success-path compositor wiring (the live preview + crop). Absent in
   * unit tests (the compositor is unit-tested directly); the @human-gate dogfood
   * exercises the real preview + crop pixels. When present it receives the granted
   * window stream and returns the cropped MediaStream for the recorder.
   */
  readonly composeFromGranted?: (granted: MediaStream) => MediaStream;
}

/** Window-surface constraint for this mode: window display + shared audio. */
const WINDOW_CROPPED_CONSTRAINTS: MediaStreamConstraints = {
  video: { displaySurface: 'window' },
  audio: true,
};

/**
 * Acquire the window stream in the gesture and start a cropped recording. On a
 * getDisplayMedia rejection, surface a visible notice and return to idle without
 * downloading (AC2.4). Returns the started recorder session on success, or null
 * if acquisition was rejected.
 */
export const startWindowCroppedRecording = async (
  deps: WindowCroppedRecordingDeps,
): Promise<{ stop: () => Promise<Blob> } | null> => {
  let granted: MediaStream;
  try {
    granted = await deps.getDisplayMedia(WINDOW_CROPPED_CONSTRAINTS);
  } catch (error) {
    // Cancelled picker / NotAllowedError: visible notice, idle, NO download.
    const e = error as Error;
    deps.setStatus(
      `Screen-share cancelled: ${e?.name ?? 'UnknownError'} — ${e?.message ?? 'no message'}`,
    );
    deps.onStateChange('idle');
    return null;
  }

  // Success path: crop the granted window stream (audio passes through) and hand
  // the cropped stream to the UNCHANGED recorder. composeFromGranted is supplied
  // by the DOM composition root (live <video>/<canvas>); the @human-gate dogfood
  // proves the real crop pixels.
  const croppedStream = deps.composeFromGranted
    ? deps.composeFromGranted(granted)
    : granted;
  const session = deps.createRecordingSession(croppedStream);
  deps.onStateChange('recording');
  return session;
};

/** Capture frame rate for the cropped canvas stream. */
const CROPPED_FPS = 30 as const;

/**
 * Build the success-path `composeFromGranted` from the live preview elements.
 * Renders the granted window stream in the <video> sink, maps the user-drawn
 * drag rect (preview CSS px) to a stream-space CropRect via the PURE
 * crop-geometry, then delegates per-frame cropping to the compositor. The crop
 * draw + real window pixels are exercised at the @human-gate dogfood (Chrome 148
 * blocks headless capture); this wiring carries no geometry of its own.
 */
export const composeFromPreview = (
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  dragRect: DragRectPreviewPx,
) => (granted: MediaStream): MediaStream => {
  video.srcObject = granted;
  const streamSettings = granted.getVideoTracks()[0]?.getSettings?.() ?? {};
  const streamIntrinsicSize = {
    width: streamSettings.width ?? video.videoWidth,
    height: streamSettings.height ?? video.videoHeight,
  };
  const previewRenderedSize = {
    width: video.clientWidth || streamIntrinsicSize.width,
    height: video.clientHeight || streamIntrinsicSize.height,
  };
  const crop: CropRect = toCropRect(dragRect, previewRenderedSize, streamIntrinsicSize);
  return composeCroppedStream({ video, canvas, crop, granted, fps: CROPPED_FPS });
};

// ---------------------------------------------------------------------------
// Live drag-to-select crop region (03-01) -- preview-coord capture, NO crop math
// ---------------------------------------------------------------------------
// The user drags a rectangle over the live <video> window preview; record.ts
// captures that drag in PREVIEW CSS-pixel coordinates and, on confirm, hands the
// preview-coord DragRectPreviewPx to the PURE crop-geometry (via composeFromPreview
// -> toCropRect). This module contributes ONLY the preview-coord rectangle: every
// scale/clamp/round operation lives in crop-geometry.ts. No chrome-height
// estimation -- the drag is WYSIWYG over the live preview (ADR-011).

/** A pointer position in preview CSS-pixel coordinates (overlay offset space). */
interface PointerPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Derive a preview-coord drag rectangle from the pointer-down and pointer-up
 * points. Direction-normalized: the origin is the min corner and width/height are
 * non-negative, so dragging up-left or down-right yields the same rectangle. PURE
 * -- this is plain min/abs over preview coordinates, NOT crop geometry (no
 * preview->stream scaling, no clamping; that is crop-geometry.ts's job).
 */
export const dragRectFromPointers = (
  start: PointerPoint,
  end: PointerPoint,
): DragRectPreviewPx => ({
  x: Math.min(start.x, end.x),
  y: Math.min(start.y, end.y),
  w: Math.abs(end.x - start.x),
  h: Math.abs(end.y - start.y),
});

/** A live crop selection over the preview overlay: confirm hands over the rect. */
export interface CropSelection {
  /** Report the captured preview-coord drag rect to the confirm callback (if any). */
  readonly confirm: () => void;
}

/**
 * Wire pointer drag-capture over the preview overlay element. Tracks pointerdown
 * -> pointermove -> pointerup, deriving the live preview-coord rectangle via the
 * PURE dragRectFromPointers, and shows the selection box by styling the overlay's
 * marquee. On confirm, hands the captured rect to onConfirm. If no drag has
 * occurred, confirm is a no-op (nothing to crop). Holds NO crop math -- the rect
 * is in preview coords; crop-geometry maps it to stream space downstream.
 */
export const createCropSelection = (
  overlay: HTMLElement,
  onConfirm: (rect: DragRectPreviewPx) => void,
): CropSelection => {
  let origin: PointerPoint | null = null;
  let current: DragRectPreviewPx | null = null;

  const paintMarquee = (rect: DragRectPreviewPx): void => {
    overlay.style.setProperty('--crop-x', `${rect.x}px`);
    overlay.style.setProperty('--crop-y', `${rect.y}px`);
    overlay.style.setProperty('--crop-w', `${rect.w}px`);
    overlay.style.setProperty('--crop-h', `${rect.h}px`);
  };

  overlay.addEventListener('pointerdown', (event: PointerEvent) => {
    origin = { x: event.offsetX, y: event.offsetY };
    current = dragRectFromPointers(origin, origin);
    overlay.setPointerCapture?.(event.pointerId);
    paintMarquee(current);
  });

  overlay.addEventListener('pointermove', (event: PointerEvent) => {
    if (origin === null) return;
    current = dragRectFromPointers(origin, { x: event.offsetX, y: event.offsetY });
    paintMarquee(current);
  });

  overlay.addEventListener('pointerup', (event: PointerEvent) => {
    if (origin === null) return;
    current = dragRectFromPointers(origin, { x: event.offsetX, y: event.offsetY });
    overlay.releasePointerCapture?.(event.pointerId);
    paintMarquee(current);
    origin = null;
  });

  return {
    confirm: (): void => {
      if (current === null) return;
      onConfirm(current);
    },
  };
};

// ---------------------------------------------------------------------------
// Honest "Recording window region" indicator (US-1 AC1.3 / US-3 AC3.1) -- 03-02
// ---------------------------------------------------------------------------
// The cropped-window stream hides browser chrome but still captures whatever the
// active window is showing, and it FOLLOWS tab switches within that window (one
// uninterrupted window stream -- no re-acquire, no tabs.onActivated). The accepted
// privacy caveat (DESIGN §16) is answered honestly by an always-visible scope
// signal on the record page (the surface that owns the window-region capture for
// the whole session): Dana always SEES that the active window's region is what's
// being recorded. This is a pure PROJECTION of the existing active/idle
// distinction -- it introduces NO new RecordingState node.

/** The honest scope copy: the meaning DISTILL pinned for the indicator. */
export const RECORDING_REGION_INDICATOR_TEXT = 'Recording window region' as const;

/**
 * Render the honest "Recording window region" indicator onto a single element.
 * When the record page is acting as the window-region capture host (`active`),
 * the indicator shows the honest scope copy and is visible so Dana always knows
 * the capture scope -- it never disappears or goes stale mid-session, across any
 * number of in-window tab switches (one stream, one indicator). When the surface
 * is NOT the window-region host (`active` false, e.g. idle / a reused single-tab
 * record page), the indicator is hidden so the page never lies about an inactive
 * scope. PURE over the element surface -- no state machine, no chrome APIs.
 */
export const renderRecordingRegionIndicator = (
  indicator: HTMLElement,
  active: boolean,
): void => {
  if (active) {
    indicator.textContent = RECORDING_REGION_INDICATOR_TEXT;
    indicator.hidden = false;
    return;
  }
  indicator.hidden = true;
};

// ---------------------------------------------------------------------------
// DOM composition root (only runs in the real record page)
// ---------------------------------------------------------------------------

// Resolved by bootstrapRecordPage() when running inside the real record page.
// Left unbound when the module is imported in a non-DOM context (unit tests
// exercise the exported seams directly, never the DOM composition root).
let button!: HTMLButtonElement;
let status!: HTMLParagraphElement;

let stream: MediaStream | null = null;
let session: ReturnType<typeof createMediaRecorderSession> | null = null;
let state: State = 'idle';

// renderButton ONLY updates the button. Status text is owned by the event
// handlers (start/stop) so a caller's error message survives the
// state -> idle transition. Earlier versions of this file overwrote
// status.textContent here, which clobbered "getDisplayMedia rejected: ..."
// with "Ready" the moment the error path returned to idle.
const renderButton = (): void => {
  switch (state) {
    case 'idle':
      button.textContent = 'Pick & Start Recording';
      button.disabled = false;
      break;
    case 'recording':
      button.textContent = 'Stop Recording';
      button.disabled = false;
      break;
    case 'processing':
      button.textContent = 'Processing...';
      button.disabled = true;
      break;
    case 'done':
      button.disabled = true;
      break;
  }
};

const startRecording = async (): Promise<void> => {
  console.log('[record] startRecording: invoking getDisplayMedia');
  try {
    const captureAudioCheckbox = document.getElementById('capture-audio') as HTMLInputElement | null;
    const wantAudio = captureAudioCheckbox?.checked === true;

    // displaySurface: 'browser' biases Firefox's picker toward tabs (the only
    // surface that ever exposes "Share audio" on Firefox+macOS — even then the
    // checkbox often isn't shown, hence the BlackHole route in record.html).
    let displayStream: MediaStream;
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser' },
        audio: true,
      });
    } catch (browserSurfaceError) {
      const e = browserSurfaceError as Error;
      console.log('[record] browser-surface request failed, falling back:', e?.name, '|', e?.message);
      displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    }
    console.log(
      '[record] getDisplayMedia: video=', displayStream.getVideoTracks().length,
      'audio=', displayStream.getAudioTracks().length,
      'displaySurface=', displayStream.getVideoTracks()[0]?.getSettings?.()?.displaySurface,
    );

    // If the user opted in to mic/BlackHole audio AND the display didn't
    // already include audio, attach the system audio input as a track.
    let audioSource: 'display' | 'audio-input' | 'none' = 'none';
    if (displayStream.getAudioTracks().length > 0) {
      stream = displayStream;
      audioSource = 'display';
    } else if (wantAudio) {
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        const tracks = [
          ...displayStream.getVideoTracks(),
          ...audioStream.getAudioTracks(),
        ];
        stream = new MediaStream(tracks);
        audioSource = 'audio-input';
        console.log('[record] combined display video + audio input device');
      } catch (micErr) {
        const e = micErr as Error;
        console.log('[record] audio-input declined or failed:', e?.name, '|', e?.message);
        stream = displayStream;
        audioSource = 'none';
      }
    } else {
      stream = displayStream;
      audioSource = 'none';
    }

    if (captureAudioCheckbox) captureAudioCheckbox.disabled = true;

    session = createMediaRecorderSession(stream);
    state = 'recording';
    status.textContent =
      audioSource === 'display' ? 'Recording (with shared audio)...'
      : audioSource === 'audio-input' ? 'Recording (with audio input)...'
      : 'Recording (video only)...';
    renderButton();

    // If the user stops sharing via Firefox's native control, treat it as a
    // Stop click so the recording is finalized and downloaded.
    for (const track of stream.getVideoTracks()) {
      track.addEventListener('ended', () => {
        if (state === 'recording') {
          void stopRecording();
        }
      });
    }
  } catch (error) {
    const e = error as Error;
    console.log('[record] startRecording: REJECTED', { name: e?.name, message: e?.message });
    status.textContent = `getDisplayMedia rejected: ${e?.name ?? 'UnknownError'} — ${e?.message ?? 'no message'}`;
    state = 'idle';
    renderButton();
  }
};

const stopRecording = async (): Promise<void> => {
  if (!session || !stream) return;

  state = 'processing';
  status.textContent = 'Processing recording...';
  renderButton();

  const currentSession = session;
  const currentStream = stream;
  session = null;
  stream = null;

  try {
    const blob = await currentSession.stop();
    const format: 'mp4' | 'webm' = blob.type.includes('mp4') ? 'mp4' : 'webm';
    const filename = formatRecordingFilename(new Date(), format);
    // Firefox's chrome.downloads.download REJECTS data: URLs ("Access denied
    // for URL data:..."). It only accepts http(s) and blob: schemes. Chrome
    // accepts data: URLs but blob: works there too, so blob: is the
    // cross-target choice. Revoke after a delay so the download has time to
    // be consumed -- revoking immediately can race with the download dispatch.
    const blobUrl = URL.createObjectURL(blob);
    try {
      await chrome.downloads.download({ url: blobUrl, filename });
    } finally {
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    }
    status.textContent = `Saved ${filename}. You can close this tab.`;
    state = 'done';
  } catch (error) {
    const e = error as Error;
    console.log('[record] stopRecording: failed', e);
    status.textContent = `Failed to save: ${e?.message ?? 'unknown error'}`;
    state = 'idle';
  } finally {
    currentStream.getTracks().forEach((t) => t.stop());
    const captureAudioCheckbox = document.getElementById('capture-audio') as HTMLInputElement | null;
    if (captureAudioCheckbox) captureAudioCheckbox.disabled = false;
    renderButton();
  }
};

/**
 * Wire the record page's DOM composition root. Runs only inside the real record
 * page (a document with the expected elements). Guarded so importing this module
 * in a non-DOM unit-test context is side-effect free -- the exported seams
 * (startWindowCroppedRecording, composeCroppedStream) are tested directly.
 */
const bootstrapRecordPage = (): void => {
  if (typeof document === 'undefined') return;
  const buttonEl = document.getElementById('action-button') as HTMLButtonElement | null;
  const statusEl = document.getElementById('status') as HTMLParagraphElement | null;
  if (buttonEl === null || statusEl === null) return;

  button = buttonEl;
  status = statusEl;

  // Honest scope banner (US-1 AC1.3 / US-3 AC3.1): the record page is the
  // window-region capture host for the whole session, so the indicator is shown
  // for as long as this surface is open. It stays present/accurate across every
  // in-window tab switch because there is ONE window stream and ONE indicator --
  // no re-acquire, no tabs.onActivated. Absence of the element is tolerated so
  // importing this module never hard-fails on an unexpected DOM.
  const indicatorEl = document.getElementById('recording-region-indicator');
  if (indicatorEl !== null) {
    renderRecordingRegionIndicator(indicatorEl, true);
  }

  button.addEventListener('click', () => {
    if (state === 'idle') {
      void startRecording();
    } else if (state === 'recording') {
      void stopRecording();
    }
  });

  status.textContent = 'Ready';
  renderButton();
};

bootstrapRecordPage();
