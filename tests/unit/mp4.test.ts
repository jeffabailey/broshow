import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Recording session -- module shape tests
// ---------------------------------------------------------------------------
// The actual recording uses WebCodecs/MediaRecorder which are browser-only APIs.
// These tests verify the module exports the expected interface.
// Full integration is tested via acceptance tests.
// ---------------------------------------------------------------------------

describe('mp4 module', () => {
  it('exports createRecordingSession as a function', async () => {
    const { createRecordingSession } = await import('../../src/mp4');
    expect(typeof createRecordingSession).toBe('function');
  });
});
