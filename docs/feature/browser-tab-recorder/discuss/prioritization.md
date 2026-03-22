# Prioritization: browser-tab-recorder

## Priority Order

| Rank | Story | Rationale | Slice |
|------|-------|-----------|-------|
| 1 | US-01: Install extension | Foundation — nothing works without it | Skeleton |
| 2 | US-02: Start tab recording | Core value — capture begins | Skeleton |
| 3 | US-03: Stop recording | Core value — capture ends | Skeleton |
| 4 | US-04: Download as WebM | Proves end-to-end pipeline | Skeleton |
| 5 | US-05: Convert to mp4 | Primary user need — universal format | Mp4 |
| 6 | US-08: Tab audio capture | High-value enhancement for tutorials/live content | Polish |
| 7 | US-09: Sensible filename | Quality-of-life improvement | Polish |
| 8 | US-07: Recording indicator | Visual feedback, builds confidence | Polish |
| 9 | US-06: WebM fallback | Error resilience | Mp4 |
| 10 | US-10: Firefox compat | Broader reach, but secondary browser | Cross-Browser |

## Prioritization Criteria

- **Outcome impact**: Does this directly serve the primary job (one-click tab → mp4)?
- **Dependency order**: Must come after prerequisites
- **Risk reduction**: Earlier slices retire technical risk (capture pipeline, mp4 muxing)
