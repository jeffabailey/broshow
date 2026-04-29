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

import { createRecordingSession } from './mp4';
import { formatRecordingFilename } from './background-logic';

type State = 'idle' | 'recording' | 'processing' | 'done';

const button = document.getElementById('action-button') as HTMLButtonElement;
const status = document.getElementById('status') as HTMLParagraphElement;

let stream: MediaStream | null = null;
let session: ReturnType<typeof createRecordingSession> | null = null;
let state: State = 'idle';

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });

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
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    console.log(
      '[record] startRecording: stream acquired',
      stream.getVideoTracks().length, 'video,',
      stream.getAudioTracks().length, 'audio',
    );
    session = createRecordingSession(stream);
    state = 'recording';
    status.textContent = 'Recording...';
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
    const dataUrl = await blobToDataUrl(blob);
    const format: 'mp4' | 'webm' = blob.type.includes('mp4') ? 'mp4' : 'webm';
    const filename = formatRecordingFilename(new Date(), format);
    await chrome.downloads.download({ url: dataUrl, filename });
    status.textContent = `Saved ${filename}. You can close this tab.`;
    state = 'done';
  } catch (error) {
    const e = error as Error;
    console.log('[record] stopRecording: failed', e);
    status.textContent = `Failed to save: ${e?.message ?? 'unknown error'}`;
    state = 'idle';
  } finally {
    currentStream.getTracks().forEach((t) => t.stop());
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
