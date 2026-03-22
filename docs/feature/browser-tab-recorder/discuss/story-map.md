# Story Map: browser-tab-recorder

## Backbone (User Activities)

```
INSTALL ──────▶ START RECORDING ──────▶ STOP RECORDING ──────▶ SAVE FILE
```

## Walking Skeleton (Minimum End-to-End Slice)

The thinnest possible slice that delivers value:

| Activity | Walking Skeleton Story |
|----------|----------------------|
| Install | Load extension as unpacked (no store needed) |
| Start Recording | Click popup button → capture tab via `chrome.tabCapture` |
| Stop Recording | Click popup button → stop MediaRecorder |
| Save File | Download as WebM (skip mp4 muxing for skeleton) |

**Why WebM for skeleton**: Browser MediaRecorder natively outputs WebM. Mp4 muxing requires additional work (mp4-mux library or ffmpeg.wasm). The skeleton proves the capture pipeline works end-to-end.

## Release Slices

### Slice 1: Walking Skeleton (WebM)
- US-01: Install extension
- US-02: Start tab recording
- US-03: Stop recording
- US-04: Download as WebM

### Slice 2: Mp4 Output
- US-05: Convert recording to mp4 before download
- US-06: Fallback to WebM if mp4 conversion fails

### Slice 3: Polish
- US-07: Recording indicator on extension icon
- US-08: Tab audio capture
- US-09: Sensible default filename with timestamp

### Slice 4: Cross-Browser
- US-10: Firefox compatibility (if feasible via browser.tabCapture or alternatives)

## Dependencies

```
US-01 ──▶ US-02 ──▶ US-03 ──▶ US-04 ──▶ US-05
                                          │
                                          ▼
                                        US-06
US-02 ──▶ US-07
US-02 ──▶ US-08
US-04 ──▶ US-09
```
