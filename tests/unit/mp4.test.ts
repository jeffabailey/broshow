import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Mp4 muxing wrapper -- pure function tests
// ---------------------------------------------------------------------------

describe('convertWebmToMp4', () => {
  it('produces an mp4 blob starting with ftyp box signature', async () => {
    const { convertWebmToMp4 } = await import('../../src/mp4');

    // A minimal sample WebM-like buffer (raw video bytes).
    // The muxing wrapper treats the input blob as raw video data to wrap
    // in an mp4 container via mp4-muxer.
    const sampleWebmData = new Uint8Array([
      0x1a, 0x45, 0xdf, 0xa3, // EBML header magic (WebM signature)
      0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1f,
      0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01,
    ]);
    const webmBlob = new Blob([sampleWebmData], { type: 'video/webm' });

    const mp4Blob = await convertWebmToMp4(webmBlob);

    // The result should be a Blob
    expect(mp4Blob).toBeInstanceOf(Blob);
    expect(mp4Blob.size).toBeGreaterThan(0);

    // Read the first 8 bytes to verify ftyp box signature
    const buffer = await mp4Blob.arrayBuffer();
    const view = new Uint8Array(buffer);

    // MP4 ftyp box: bytes 4-7 should be ASCII "ftyp"
    const ftypSignature = String.fromCharCode(view[4]!, view[5]!, view[6]!, view[7]!);
    expect(ftypSignature).toBe('ftyp');
  });

  it('returns a blob with video/mp4 mime type', async () => {
    const { convertWebmToMp4 } = await import('../../src/mp4');

    const sampleData = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    const webmBlob = new Blob([sampleData], { type: 'video/webm' });

    const mp4Blob = await convertWebmToMp4(webmBlob);

    expect(mp4Blob.type).toBe('video/mp4');
  });
});
