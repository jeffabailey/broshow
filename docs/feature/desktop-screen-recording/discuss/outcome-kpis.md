# Outcome KPIs: desktop-screen-recording

## Primary Outcome

**Users can record screens and windows in addition to tabs.**

## KPIs

| KPI | Target | Measurement |
|-----|--------|-------------|
| Screen recording completes successfully | 100% of attempts that pass permission | Manual E2E test: start screen recording, stop, verify mp4 download |
| Tab recording regression-free | Zero regressions | Existing acceptance tests pass unchanged |
| Source selection persists | Saved preference restored on popup reopen | Automated test: set preference, reopen, verify |
| Stream termination handled | Recording saved when source window closes | Manual test: record window, close window, verify download |
| mp4 output from screen recording | Playable in VLC/QuickTime | Manual test: open downloaded mp4 in media player |

## Leading Indicators

| Indicator | What It Tells Us |
|-----------|-----------------|
| getDisplayMedia picker appears | Browser API integration works |
| Offscreen document receives screen stream | Pipeline wiring is correct |
| MediaRecorder produces chunks from screen stream | Recording pipeline handles non-tab streams |
