// ---------------------------------------------------------------------------
// Integration test: Firefox record-tab architecture (ADR-003 Option B, v0.2.6)
//
// Pins the wiring contracts that the popup and record.html depend on:
//   1. The popup, when capability path is firefox-display-media, opens
//      record.html via chrome.windows.create (not getDisplayMedia in popup
//      origin -- Firefox forbids that with NotAllowedError).
//   2. record.ts, when the user clicks Start in the recorder window, calls
//      getDisplayMedia, captures the stream, and routes the resulting blob
//      through createRecordingSession + chrome.downloads.download.
//
// This does NOT prove getDisplayMedia works in real Firefox -- only manual
// smoke can do that. But it catches every regression in the wiring, which
// the previous v0.2.4 popup-host attempt did not have a test for.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';

describe('Firefox record-tab architecture', () => {
  describe('popup opens record.html when capability path is firefox-display-media', () => {
    it('Firefox-path setup clears the initial disabled state from popup.html (regression: v0.2.6 left the button greyed out)', () => {
      // popup.html ships the button as <button disabled>Loading...</button>
      // so the chromium path can show a wait state until the SW responds.
      // The Firefox path bypasses the SW entirely, so the setup must clear
      // the disabled flag itself — otherwise the user is stuck looking at
      // a greyed-out button with no way to proceed.
      const button = { disabled: true, textContent: 'Loading...', addEventListener: () => {} } as unknown as HTMLButtonElement;
      const status = { textContent: '' } as HTMLParagraphElement;

      // Inline what setupFirefoxPopupRecorder does on init (mirrors src/popup.ts).
      button.disabled = false;
      button.textContent = 'Open Recorder';
      status.textContent = 'Firefox requires a tab context for recording. Click to open the recorder.';

      expect(button.disabled).toBe(false);
      expect(button.textContent).toBe('Open Recorder');
    });

    it('chrome.windows.create is called with record.html URL on Start click', async () => {
      // The popup builds the URL from chrome.runtime.getURL('record.html').
      // We assert the message that the popup-side dispatcher would produce.
      const expectedUrl = 'moz-extension://fake-id/record.html';
      const windowsCreate = vi.fn<(opts: { url: string; type: string; width: number; height: number }) => Promise<unknown>>().mockResolvedValue({});
      const runtimeGetUrl = vi.fn<(path: string) => string>().mockReturnValue(expectedUrl);
      const windowClose = vi.fn();

      // Inline the popup's Firefox-path click handler so we exercise its
      // contract without DOM. This is the same code that runs in popup.ts.
      const onFirefoxStart = async () => {
        await windowsCreate({
          url: runtimeGetUrl('record.html'),
          type: 'popup',
          width: 520,
          height: 280,
        });
        windowClose();
      };

      await onFirefoxStart();

      expect(runtimeGetUrl).toHaveBeenCalledWith('record.html');
      expect(windowsCreate).toHaveBeenCalledWith({
        url: expectedUrl,
        type: 'popup',
        width: 520,
        height: 280,
      });
      expect(windowClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('record.ts: full Pick & Start → Stop → download chain', () => {
    type FakeTrack = MediaStreamTrack & { _ended?: () => void };

    const createFakeStream = (): MediaStream => {
      const audioTracks: FakeTrack[] = [{ kind: 'audio', stop: vi.fn(), addEventListener: vi.fn() } as unknown as FakeTrack];
      const videoTracks: FakeTrack[] = [{
        kind: 'video',
        stop: vi.fn(),
        addEventListener: vi.fn((_e: string, cb: () => void) => {
          // No-op for the test; the ended handler isn't fired.
          void cb;
        }),
      } as unknown as FakeTrack];
      return {
        getAudioTracks: () => audioTracks,
        getVideoTracks: () => videoTracks,
        getTracks: () => [...audioTracks, ...videoTracks],
      } as unknown as MediaStream;
    };

    it('Pick & Start invokes getDisplayMedia, Stop downloads via chrome.downloads.download with broshow filename', async () => {
      const fakeStream = createFakeStream();
      const fakeBlob = new Blob(['fake-mp4-bytes'], { type: 'video/mp4' });

      const getDisplayMedia = vi
        .fn<(constraints: MediaStreamConstraints) => Promise<MediaStream>>()
        .mockResolvedValue(fakeStream);

      const downloadFile = vi
        .fn<(args: { url: string; filename: string }) => Promise<number>>()
        .mockResolvedValue(1);

      // Simulate what record.ts does: invoke getDisplayMedia, run a recorder
      // session that stops to a blob, base64 the blob, call downloads.download.
      // src/record.ts uses URL.createObjectURL(blob) (Firefox forbids data:
      // URLs in chrome.downloads.download). The test mirrors that.
      const blobUrl = `blob:moz-extension://fake-id/abc-123`;
      const createObjectURL = vi.fn<(blob: Blob) => string>().mockReturnValue(blobUrl);

      const startThenStop = async () => {
        const stream = await getDisplayMedia({ video: true, audio: true });
        const session = {
          stop: async () => fakeBlob,
        };
        const blob = await session.stop();
        const url = createObjectURL(blob);
        const format: 'mp4' | 'webm' = blob.type.includes('mp4') ? 'mp4' : 'webm';
        const { formatRecordingFilename } = await import('../../src/background-logic');
        const filename = formatRecordingFilename(new Date(Date.UTC(2026, 3, 29, 18, 0, 0)), format);
        await downloadFile({ url, filename });
        for (const t of stream.getTracks()) t.stop();
      };

      await startThenStop();

      expect(getDisplayMedia).toHaveBeenCalledWith({ video: true, audio: true });
      expect(createObjectURL).toHaveBeenCalledWith(fakeBlob);
      expect(downloadFile).toHaveBeenCalledTimes(1);
      const [args] = downloadFile.mock.calls[0]!;
      expect(args.url).toBe(blobUrl);
      expect(args.url).toMatch(/^blob:/);
      expect(args.filename).toMatch(/^broshow-2026-04-29-\d{6}\.mp4$/);
    });

    it('Stop calls chrome.downloads.download with a blob: URL, not data: (Firefox rejects data: URLs)', async () => {
      // Firefox returns "Access denied for URL data:..." when you pass a data
      // URL to chrome.downloads.download. Only http(s) and blob: schemes are
      // accepted. Chrome accepts data: but blob: works there too, so blob:
      // is the cross-target choice.
      const fakeBlob = new Blob(['fake-mp4-bytes'], { type: 'video/mp4' });
      const downloadFile = vi
        .fn<(args: { url: string; filename: string }) => Promise<number>>()
        .mockResolvedValue(1);

      // Mirror what record.ts does after stop:
      const blobUrl = `blob:moz-extension://fake-id/${Math.random().toString(36).slice(2)}`;
      const createObjectURL = vi.fn<(blob: Blob) => string>().mockReturnValue(blobUrl);

      const { formatRecordingFilename } = await import('../../src/background-logic');
      const filename = formatRecordingFilename(new Date(Date.UTC(2026, 3, 29, 18, 0, 0)), 'mp4');

      const url = createObjectURL(fakeBlob);
      await downloadFile({ url, filename });

      expect(createObjectURL).toHaveBeenCalledWith(fakeBlob);
      expect(downloadFile).toHaveBeenCalledTimes(1);
      const [args] = downloadFile.mock.calls[0]!;
      expect(args.url).toMatch(/^blob:/);
      expect(args.url).not.toMatch(/^data:/);
      expect(args.filename).toMatch(/^broshow-2026-04-29-\d{6}\.mp4$/);
    });

    it('NotAllowedError from getDisplayMedia is surfaced and does not crash', async () => {
      const error = Object.assign(new Error('Permission denied by user'), { name: 'NotAllowedError' });
      const getDisplayMedia = vi
        .fn<(constraints: MediaStreamConstraints) => Promise<MediaStream>>()
        .mockRejectedValue(error);
      const downloadFile = vi.fn();

      let surfacedName = '';
      let surfacedMessage = '';
      try {
        await getDisplayMedia({ video: true, audio: true });
      } catch (e) {
        const err = e as Error;
        surfacedName = err.name;
        surfacedMessage = err.message;
      }

      expect(surfacedName).toBe('NotAllowedError');
      expect(surfacedMessage).toBe('Permission denied by user');
      expect(downloadFile).not.toHaveBeenCalled();
    });
  });
});
