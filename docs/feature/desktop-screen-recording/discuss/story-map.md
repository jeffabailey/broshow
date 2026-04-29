# Story Map: desktop-screen-recording

## Backbone (User Activities)

```
CHOOSE SOURCE  ->  START RECORDING  ->  CAPTURE  ->  STOP & DOWNLOAD
```

## Walking Skeleton (Minimum E2E Slice)

| Activity | Story | Description |
|----------|-------|-------------|
| Choose Source | US-DSR-01 | Add source selector to popup (tab / screen toggle) |
| Start Recording | US-DSR-02 | Invoke getDisplayMedia when "Screen / Window" selected |
| Capture | US-DSR-03 | Pass display media stream to offscreen for recording |
| Stop & Download | — | Existing stop/mux/download pipeline (no changes needed) |

**Rationale**: The walking skeleton proves the new capture path works end-to-end. The stop/mux/download path is already implemented and should work unchanged since it operates on MediaRecorder output regardless of source.

## Release Slices

### Slice 1: Core Screen Recording (Walking Skeleton)
- US-DSR-01: Source selector in popup
- US-DSR-02: getDisplayMedia integration
- US-DSR-03: Screen stream to offscreen pipeline

### Slice 2: Persistence & Polish
- US-DSR-04: Persist source selection across popup opens
- US-DSR-05: Disable source selector during recording
- US-DSR-06: Handle stream-ended (window closed / screen disconnected)

### Slice 3: Graceful Degradation
- US-DSR-07: Hide screen option when getDisplayMedia unavailable
