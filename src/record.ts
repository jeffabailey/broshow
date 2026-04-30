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

type State = 'idle' | 'recording' | 'processing' | 'done';

const button = document.getElementById('action-button') as HTMLButtonElement;
const status = document.getElementById('status') as HTMLParagraphElement;

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

button.addEventListener('click', () => {
  if (state === 'idle') {
    void startRecording();
  } else if (state === 'recording') {
    void stopRecording();
  }
});

status.textContent = 'Ready';
renderButton();
