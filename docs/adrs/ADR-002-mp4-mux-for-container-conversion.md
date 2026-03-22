# ADR-002: Use mp4-mux for WebM→Mp4 Conversion

## Status

Accepted

## Context

Browser `MediaRecorder` outputs WebM (VP8/VP9 video + Opus audio). Users need mp4 (H.264 + AAC) for universal compatibility. Conversion must happen client-side (no network requests).

## Options Considered

### Option A: mp4-mux (Selected)
Lightweight npm library (~50KB) purpose-built for remuxing browser-captured media to mp4.

- **Pros**: Small bundle, fast, designed for this exact use case.
- **Cons**: Less battle-tested than ffmpeg. Limited to remuxing (no transcoding).

### Option B: ffmpeg.wasm
Full ffmpeg compiled to WebAssembly.

- **Pros**: Full codec support, extremely battle-tested.
- **Cons**: ~25MB bundle size. Massive overkill for remuxing. Slow to initialize.

### Option C: Serve WebM directly
Skip conversion entirely.

- **Pros**: Zero complexity, zero bundle size.
- **Cons**: WebM doesn't play in QuickTime, Windows Media Player, or many mobile players. Fails the core requirement (mp4 output).

## Decision

**Option A: mp4-mux**. Right-sized for the job. If it proves insufficient, we can add WebM fallback (already planned in US-06) while evaluating alternatives.

## Consequences

- `mp4-mux` added as npm dependency
- Bundle size increases by ~50KB
- WebM fallback needed for when muxing fails
- If `mp4-mux` cannot handle certain MediaRecorder codecs, we may need to revisit
