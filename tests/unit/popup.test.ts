import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RecordingState, SWToPopup } from '../../src/types';
import {
  describeUI,
  messageForAction,
  initializePopup,
} from '../../src/popup-logic';

// ---------------------------------------------------------------------------
// Pure popup logic -- tested without DOM or chrome APIs
// ---------------------------------------------------------------------------

describe('popup-logic', () => {
  describe('describeUI', () => {
    it('shows start button when idle', () => {
      const state: RecordingState = { status: 'idle' };
      const ui = describeUI(state);

      expect(ui.buttonLabel).toBe('Start Recording');
      expect(ui.buttonAction).toBe('start');
      expect(ui.statusText).toBe('Ready to record');
      expect(ui.buttonDisabled).toBe(false);
    });

    it('shows stop button when recording', () => {
      const state: RecordingState = { status: 'recording', tabId: 1, startTime: 1000 };
      const ui = describeUI(state);

      expect(ui.buttonLabel).toBe('Stop Recording');
      expect(ui.buttonAction).toBe('stop');
      expect(ui.statusText).toBe('Recording...');
      expect(ui.buttonDisabled).toBe(false);
    });

    it('shows disabled button when processing', () => {
      const state: RecordingState = { status: 'processing' };
      const ui = describeUI(state);

      expect(ui.buttonLabel).toBe('Processing...');
      expect(ui.buttonAction).toBe(null);
      expect(ui.statusText).toBe('Processing recording...');
      expect(ui.buttonDisabled).toBe(true);
    });
  });

  describe('messageForAction', () => {
    it('creates start-recording message for start action', () => {
      const message = messageForAction('start');
      expect(message).toEqual({ type: 'start-recording' });
    });

    it('creates stop-recording message for stop action', () => {
      const message = messageForAction('stop');
      expect(message).toEqual({ type: 'stop-recording' });
    });
  });
});

// ---------------------------------------------------------------------------
// Popup wiring -- tests that verify DOM + chrome API integration
// Uses injected mock elements (no real DOM needed)
// ---------------------------------------------------------------------------

describe('popup wiring', () => {
  const mockSendMessage = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('sends get-state message on initialization', async () => {
    const mockButton = {
      textContent: '',
      disabled: false,
      addEventListener: vi.fn(),
    };
    const mockStatus = { textContent: '' };

    mockSendMessage.mockResolvedValue({
      type: 'state-update',
      state: { status: 'idle' },
    } satisfies SWToPopup);

    await initializePopup(mockButton, mockStatus, mockSendMessage);

    expect(mockSendMessage).toHaveBeenCalledWith({ type: 'get-state' });
  });

  it('renders idle state after querying service worker', async () => {
    const mockButton = {
      textContent: '',
      disabled: false,
      addEventListener: vi.fn(),
    };
    const mockStatus = { textContent: '' };

    mockSendMessage.mockResolvedValue({
      type: 'state-update',
      state: { status: 'idle' },
    } satisfies SWToPopup);

    await initializePopup(mockButton, mockStatus, mockSendMessage);

    expect(mockButton.textContent).toBe('Start Recording');
    expect(mockStatus.textContent).toBe('Ready to record');
    expect(mockButton.disabled).toBe(false);
  });

  it('renders recording state after querying service worker', async () => {
    const mockButton = {
      textContent: '',
      disabled: false,
      addEventListener: vi.fn(),
    };
    const mockStatus = { textContent: '' };

    mockSendMessage.mockResolvedValue({
      type: 'state-update',
      state: { status: 'recording', tabId: 1, startTime: 1000 },
    } satisfies SWToPopup);

    await initializePopup(mockButton, mockStatus, mockSendMessage);

    expect(mockButton.textContent).toBe('Stop Recording');
    expect(mockStatus.textContent).toBe('Recording...');
  });

  it('renders error state when service worker responds with error', async () => {
    const mockButton = {
      textContent: '',
      disabled: false,
      addEventListener: vi.fn(),
    };
    const mockStatus = { textContent: '' };

    mockSendMessage.mockResolvedValue({
      type: 'error',
      message: 'Tab not found',
    } satisfies SWToPopup);

    await initializePopup(mockButton, mockStatus, mockSendMessage);

    expect(mockStatus.textContent).toBe('Error: Tab not found');
  });

  it('sends start-recording when start button is clicked', async () => {
    let clickHandler: (() => void) | undefined;
    const mockButton = {
      textContent: '',
      disabled: false,
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === 'click') clickHandler = handler;
      }),
    };
    const mockStatus = { textContent: '' };

    mockSendMessage.mockResolvedValue({
      type: 'state-update',
      state: { status: 'idle' },
    } satisfies SWToPopup);

    await initializePopup(mockButton, mockStatus, mockSendMessage);

    // Simulate click
    expect(clickHandler).toBeDefined();
    mockSendMessage.mockResolvedValue({
      type: 'state-update',
      state: { status: 'recording', tabId: 1, startTime: Date.now() },
    });
    await clickHandler!();

    expect(mockSendMessage).toHaveBeenCalledWith({ type: 'start-recording' });
  });

  it('sends stop-recording when stop button is clicked', async () => {
    let clickHandler: (() => void) | undefined;
    const mockButton = {
      textContent: '',
      disabled: false,
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === 'click') clickHandler = handler;
      }),
    };
    const mockStatus = { textContent: '' };

    // Start in recording state
    mockSendMessage.mockResolvedValue({
      type: 'state-update',
      state: { status: 'recording', tabId: 1, startTime: 1000 },
    } satisfies SWToPopup);

    await initializePopup(mockButton, mockStatus, mockSendMessage);

    // Simulate click (should send stop since we're recording)
    mockSendMessage.mockResolvedValue({
      type: 'state-update',
      state: { status: 'processing' },
    });
    await clickHandler!();

    expect(mockSendMessage).toHaveBeenCalledWith({ type: 'stop-recording' });
  });

  it('handles fallback-notice from service worker', async () => {
    const mockButton = {
      textContent: '',
      disabled: false,
      addEventListener: vi.fn(),
    };
    const mockStatus = { textContent: '' };

    mockSendMessage.mockResolvedValue({
      type: 'fallback-notice',
      message: 'Using WebM format',
    } satisfies SWToPopup);

    await initializePopup(mockButton, mockStatus, mockSendMessage);

    expect(mockStatus.textContent).toBe('Note: Using WebM format');
  });
});
