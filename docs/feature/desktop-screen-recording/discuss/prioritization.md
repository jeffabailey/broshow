# Prioritization: desktop-screen-recording

## Priority Order

| Priority | Story | Rationale |
|----------|-------|-----------|
| 1 | US-DSR-01 | Source selector is the entry point; all other stories depend on it |
| 2 | US-DSR-02 | getDisplayMedia call is the core new capability |
| 3 | US-DSR-03 | Wiring the stream through offscreen completes the E2E path |
| 4 | US-DSR-05 | Prevents user confusion during active recording |
| 5 | US-DSR-04 | Convenience — remembers user preference |
| 6 | US-DSR-06 | Resilience — handles unexpected stream termination |
| 7 | US-DSR-07 | Graceful degradation for unsupported browsers |

## Dependencies

```
US-DSR-01 (selector UI)
  └── US-DSR-02 (getDisplayMedia)
       └── US-DSR-03 (stream pipeline)
            ├── US-DSR-04 (persist selection)
            ├── US-DSR-05 (disable during recording)
            └── US-DSR-06 (stream-ended handling)

US-DSR-07 (graceful degradation) — independent, can be done anytime
```

## Impact Assessment

- **Slice 1** delivers the core value: users can record screens and windows
- **Slice 2** is polish that prevents confusion and improves UX
- **Slice 3** is defensive — only matters for older/non-Chromium browsers
