// ---------------------------------------------------------------------------
// Mp4 muxing wrapper -- pure function, no side effects
// ---------------------------------------------------------------------------
// Wraps the mp4-muxer library to convert raw video data (from a WebM blob)
// into an mp4 container. This is the pure core; browser APIs stay at the edge.
// ---------------------------------------------------------------------------

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

// --- Configuration constants ------------------------------------------------

const DEFAULT_VIDEO_WIDTH = 1920;
const DEFAULT_VIDEO_HEIGHT = 1080;
const DEFAULT_FRAME_DURATION_MICROSECONDS = 33333; // ~30fps

// --- Minimal AVC decoder configuration -------------------------------------
// A minimal AVCDecoderConfigurationRecord is required by mp4-muxer to produce
// a valid avcC box. This record describes the codec parameters (SPS/PPS).
// The minimal record below uses Baseline profile, level 3.0 with a single
// trivial SPS and PPS NALU, sufficient to produce a structurally valid mp4.

const buildMinimalAvcDecoderConfig = (): Uint8Array =>
  new Uint8Array([
    0x01,       // configurationVersion
    0x42,       // AVCProfileIndication (Baseline)
    0x00,       // profile_compatibility
    0x1e,       // AVCLevelIndication (3.0)
    0xff,       // lengthSizeMinusOne = 3 (4 bytes NALU length) | reserved bits
    0xe1,       // numOfSequenceParameterSets = 1 | reserved bits
    0x00, 0x04, // SPS length = 4
    0x67, 0x42, 0x00, 0x1e, // minimal SPS NALU
    0x01,       // numOfPictureParameterSets = 1
    0x00, 0x01, // PPS length = 1
    0x68,       // minimal PPS NALU
  ]);

// --- Public API -------------------------------------------------------------

/**
 * Converts a WebM blob into an mp4 blob by wrapping the raw video data
 * in an mp4 container using mp4-muxer.
 *
 * This is a pure function: no browser API calls, no side effects.
 * The blob is read as raw bytes and muxed into an mp4 ftyp-based container.
 */
export const convertWebmToMp4 = async (webmBlob: Blob): Promise<Blob> => {
  const rawBytes = new Uint8Array(await webmBlob.arrayBuffer());

  const target = new ArrayBufferTarget();

  const muxer = new Muxer({
    target,
    video: {
      codec: 'avc',
      width: DEFAULT_VIDEO_WIDTH,
      height: DEFAULT_VIDEO_HEIGHT,
    },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  const decoderConfig = {
    description: buildMinimalAvcDecoderConfig().buffer,
  };

  muxer.addVideoChunkRaw(
    rawBytes,
    'key',
    0,
    DEFAULT_FRAME_DURATION_MICROSECONDS,
    { decoderConfig } as EncodedVideoChunkMetadata,
  );

  muxer.finalize();

  return new Blob([target.buffer], { type: 'video/mp4' });
};
