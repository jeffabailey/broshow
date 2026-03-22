import { describe, it, expect } from 'vitest';
import {
  type RecordingState,
  type PopupToSW,
  type SWToPopup,
  type SWToOffscreen,
  type OffscreenToSW,
  type Message,
  TYPES_MODULE_MARKER,
} from '../../src/types';

// Type-level assertions: these variables verify that the discriminated unions
// accept exactly the shapes defined in the design. If any variant is missing
// or mistyped, TypeScript will report a compile error here.

describe('types module', () => {
  it('exports the module marker confirming zero-runtime types module', () => {
    expect(TYPES_MODULE_MARKER).toBe('brorecord-types');
  });

  describe('RecordingState', () => {
    it('represents idle state', () => {
      const state: RecordingState = { status: 'idle' };
      expect(state.status).toBe('idle');
    });

    it('represents recording state with tabId and startTime', () => {
      const state: RecordingState = { status: 'recording', tabId: 42, startTime: 1000 };
      expect(state.status).toBe('recording');
      expect(state.tabId).toBe(42);
      expect(state.startTime).toBe(1000);
    });

    it('represents processing state', () => {
      const state: RecordingState = { status: 'processing' };
      expect(state.status).toBe('processing');
    });
  });

  describe('PopupToSW messages', () => {
    it('supports start-recording message', () => {
      const message: PopupToSW = { type: 'start-recording' };
      expect(message.type).toBe('start-recording');
    });

    it('supports stop-recording message', () => {
      const message: PopupToSW = { type: 'stop-recording' };
      expect(message.type).toBe('stop-recording');
    });

    it('supports get-state message', () => {
      const message: PopupToSW = { type: 'get-state' };
      expect(message.type).toBe('get-state');
    });
  });

  describe('SWToPopup messages', () => {
    it('supports state-update message', () => {
      const message: SWToPopup = { type: 'state-update', state: { status: 'idle' } };
      expect(message.type).toBe('state-update');
    });

    it('supports error message', () => {
      const message: SWToPopup = { type: 'error', message: 'something went wrong' };
      expect(message.type).toBe('error');
    });

    it('supports fallback-notice message', () => {
      const message: SWToPopup = { type: 'fallback-notice', message: 'using fallback' };
      expect(message.type).toBe('fallback-notice');
    });
  });

  describe('SWToOffscreen messages', () => {
    it('supports offscreen-start message', () => {
      const message: SWToOffscreen = { type: 'offscreen-start', streamId: 'abc123' };
      expect(message.type).toBe('offscreen-start');
    });

    it('supports offscreen-stop message', () => {
      const message: SWToOffscreen = { type: 'offscreen-stop' };
      expect(message.type).toBe('offscreen-stop');
    });
  });

  describe('OffscreenToSW messages', () => {
    it('supports offscreen-result message with format', () => {
      const message: OffscreenToSW = { type: 'offscreen-result', blobUrl: 'blob://test', format: 'mp4' };
      expect(message.type).toBe('offscreen-result');
      expect(message.format).toBe('mp4');
    });

    it('supports offscreen-result with webm format', () => {
      const message: OffscreenToSW = { type: 'offscreen-result', blobUrl: 'blob://test', format: 'webm' };
      expect(message.format).toBe('webm');
    });

    it('supports offscreen-error message', () => {
      const message: OffscreenToSW = { type: 'offscreen-error', error: 'failed' };
      expect(message.type).toBe('offscreen-error');
    });

    it('supports offscreen-error with optional fallbackBlobUrl', () => {
      const message: OffscreenToSW = { type: 'offscreen-error', error: 'failed', fallbackBlobUrl: 'blob://fallback' };
      expect(message.fallbackBlobUrl).toBe('blob://fallback');
    });
  });

  describe('Message union', () => {
    it('accepts any message type', () => {
      const messages: Message[] = [
        { type: 'start-recording' },
        { type: 'stop-recording' },
        { type: 'get-state' },
        { type: 'state-update', state: { status: 'idle' } },
        { type: 'error', message: 'err' },
        { type: 'fallback-notice', message: 'notice' },
        { type: 'offscreen-start', streamId: 'id' },
        { type: 'offscreen-stop' },
        { type: 'offscreen-result', blobUrl: 'url', format: 'mp4' },
        { type: 'offscreen-error', error: 'err' },
      ];
      expect(messages).toHaveLength(10);
    });
  });
});
