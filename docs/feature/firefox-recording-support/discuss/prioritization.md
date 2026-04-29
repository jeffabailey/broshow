# Prioritization: firefox-recording-support

## Release Priority

| Priority | Release | Target Outcome | KPI | Rationale |
|---|---|---|---|---|
| 1 | Walking Skeleton (within Release 1) | A Firefox user can produce ONE downloadable recording end-to-end | `firefox_recording_success_rate >= 1` for the canonical happy path | Validates the riskiest assumption: that the chosen recording host survives a real recording on Firefox. |
| 2 | Release 1: "Firefox users can record" | Firefox parity with Chrome for recording outcome (mp4 primary, webm fallback) | `firefox_recording_success_rate >= 95%`; `time_to_first_recording <= 30s` | Unblocks the entire Firefox audience that was held back by v0.1.2's "not supported" message. |
| 3 | Release 2: "Polish" | Native-control parity, clear audio-state communication | `firefox_audio_capture_clarity` (qualitative, see KPIs doc) | Pure quality-of-life. Each item is independently shippable but neither blocks recording. |

Tie-break order applied: Walking Skeleton > Riskiest Assumption (host lifetime) > Highest Value (parity).

## Backlog Suggestions

| Story | Release | Priority | Outcome Link | Dependencies |
|---|---|---|---|---|
| US-FF-01: Capability probe accepts Firefox path | WS | P1 | `firefox_install_recordable_rate` | None |
| US-FF-02: Surface picker bootstrap on Firefox | WS | P1 | `firefox_recording_started_rate` | US-FF-01 |
| US-FF-03: Recording host survives a 5-minute recording | WS | P1 | `firefox_recording_completion_rate` | US-FF-02; resolves DQ-1 in DESIGN |
| US-FF-04: Firefox popup hint | R1 | P2 | `firefox_picker_completion_rate` | US-FF-01 |
| US-FF-05: Stop and download produce mp4-or-webm | WS | P1 | `firefox_recording_success_rate` | US-FF-03; reuses US-05/US-06 |
| US-FF-06: Stopping via Firefox native "Stop sharing" | R2 | P3 | `firefox_native_stop_parity` | US-FF-03 |
| US-FF-07: "Audio not captured" success note | R2 | P3 | `firefox_audio_capture_clarity` | US-FF-05 |

> Story IDs above are final (assigned in Phase 4 below). Walking skeleton = US-FF-01, 02, 03, 05.
> Stories are independent of one another within a release except where dependencies are noted.

## Riskiest-Assumption Validation Order

1. **Recording host survives** (US-FF-03): if this fails, Firefox support is not viable on the chosen host strategy. Validate first via spike during DESIGN.
2. **Surface picker UX is acceptable** (US-FF-02 + US-FF-04): user research signal — if pickers confuse users, the hint copy needs iteration.
3. **mp4-mux works inside whatever host is chosen** (US-FF-05): ADR-002 was validated for offscreen-document context, not for record-tab or background-scripts-page context.

## Value vs Effort

| | Low Effort | High Effort |
|---|---|---|
| **High Value** | US-FF-01 (probe tweak), US-FF-04 (hint copy) | US-FF-02, US-FF-03, US-FF-05 (the actual recording path) |
| **Low Value** | US-FF-07 (audio note) | US-FF-06 (native stop parity — possible API gymnastics for marginal gain) |
