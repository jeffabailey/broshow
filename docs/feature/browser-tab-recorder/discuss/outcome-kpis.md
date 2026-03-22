# Outcome KPIs: browser-tab-recorder

## Primary Outcome

| KPI | Target | Measurement |
|-----|--------|-------------|
| Recording success rate | >= 95% | Recordings that complete without error / total recordings started |
| Time to first recording | < 30 seconds | From extension install to first mp4 download |
| User steps to record | <= 3 clicks | Click icon → Start → Stop (no configuration) |

## Quality Outcomes

| KPI | Target | Measurement |
|-----|--------|-------------|
| Mp4 conversion success rate | >= 90% | Successful mp4 muxes / total recordings |
| Audio-video sync drift | < 100ms | Max A/V desync in output file |
| Output file plays in major players | 100% | VLC, QuickTime, Windows Media Player |

## Trust Outcomes

| KPI | Target | Measurement |
|-----|--------|-------------|
| Network requests made | 0 | Total outbound requests from extension |
| Permissions requested | <= 3 | Number of permissions in manifest |
| Extension size | < 500KB | Total bundled size (excluding mp4 mux library) |
