# Outcome KPIs: firefox-recording-support

## Feature: Firefox recording support

### Objective

Maria, our Firefox-first user, can click Start Recording on Firefox and end up
with a downloadable file that matches the Chrome experience as closely as the
medium honestly allows.

## Outcome KPIs

| # | Who | Does What | By How Much | Baseline | Measured By | Type |
|---|-----|-----------|-------------|----------|-------------|------|
| 1 | Firefox 121+ users who install BroShow | Reach an interactive Start Recording popup (no "not supported" message) | 100% | 0% (today every Firefox install hits the not-supported message) | Manual smoke test on Firefox stable + ESR; tracked in DELIVER UAT logs | Leading (Activation) |
| 2 | Firefox users who click Start Recording | Successfully transition from "click Start" to "recording active" via the picker | >= 95% (excluding user cancellation) | 0% | DELIVER smoke matrix; UAT pass rate | Leading (Activation) |
| 3 | Firefox users with active recordings | Reach the download step intact without losing the recording | >= 95% across smoke matrix; 100% for the canonical 5-minute case | 0% | UAT scenarios in DELIVER + manual smoke runs | Leading (Retention proxy) |
| 4 | Firefox users who completed a recording | Receive a downloadable file with the same filename pattern as Chrome | 100% | 0% | UAT + manual file inspection | Leading (Quality) |
| 5 | Firefox users where mp4-mux succeeds | Receive an mp4 (rather than webm fallback) | >= 90% (parity with Chrome quality KPI) | 0% (no Firefox path) | UAT mp4-conversion-success-rate on Firefox | Leading (Quality) |

### Metric Hierarchy

- **North Star**: KPI 3 — `firefox_recording_completion_rate` (a recording started on Firefox produces a downloaded file). This is the single metric that proves the feature is real.
- **Leading Indicators**: KPIs 1 and 2 (probe accepts Firefox; picker bootstrap works).
- **Quality**: KPIs 4 and 5 (output parity).
- **Guardrail Metrics**:
  - `permissions_count_in_manifest` MUST stay <= 4 (parent feature's current ceiling). If DESIGN must add a Firefox-only permission, this guardrail breach is a flagged ADR change, not a silent bump.
  - `outbound_network_requests` on Firefox MUST stay at 0 (NFR parity).
  - `chrome_recording_success_rate` MUST NOT regress (existing Chrome KPI).
  - `chrome_time_to_first_recording` MUST NOT regress.
  - `extension_size` MUST stay < 500KB excluding mp4-mux library (no large Firefox-only payload).

## Measurement Plan

| KPI | Data Source | Collection Method | Frequency | Owner |
|---|---|---|---|---|
| 1 (probe accepts Firefox) | Manual install on Firefox stable + ESR | Visual confirmation: Start button visible, no not-supported message | Once per release; sanity-check on each PR touching popup-logic | DELIVER (acceptance-designer) |
| 2 (picker bootstrap success) | Smoke matrix: 3 picker outcomes (tab, window, cancel) on Firefox stable + ESR | UAT pass/fail | Once per release | DELIVER |
| 3 (recording completion) | Smoke matrix: 15s, 60s, 5min recordings on Firefox | UAT pass/fail; file duration measurement | Once per release | DELIVER |
| 4 (filename parity) | Inspect downloaded files on both browsers | Filename comparison | Once per release | DELIVER |
| 5 (mp4-mux success rate on Firefox) | Smoke matrix: 5 recordings on Firefox; count those that produce mp4 vs webm | Ratio | Once per release; baseline established at first release | DELIVER |
| Guardrail (permissions count) | `src/manifest.json` + Firefox-patched manifest | Static check | Every PR | DEVOPS |
| Guardrail (outbound network) | Firefox DevTools Network panel during smoke run | Manual observation | Every release | DELIVER |
| Guardrail (Chrome regression) | Existing parent-feature smoke matrix on Chrome | UAT pass rate | Every release | DELIVER |

## Hypothesis

We believe that **adding a Firefox-aware recording path (`getDisplayMedia` + a
host context with sufficient lifetime, behind the existing capability probe)**
for **Firefox 121+ users who already installed BroShow v0.1.2** will achieve
**100% probe-pass and >= 95% recording-completion on Firefox without
regressing Chrome**.

We will know this is true when **Maria (Firefox user) clicks Start, picks a
surface, waits 5 minutes, clicks Stop, and downloads a playable file matching
the Chrome filename pattern — every time across the smoke matrix**.

## Smell-Test Pass

| Check | Question | Status |
|---|---|---|
| Measurable today? | Can we measure with a manual smoke matrix? | YES — same matrix model as parent feature |
| Rate not total? | Are KPIs ratios? | YES (KPIs 2, 3, 5 are rates; KPIs 1, 4 are 100% gates) |
| Outcome not output? | Do KPIs describe user behavior, not feature delivery? | YES — "users reach popup", "users complete recording", "users get a file" |
| Has baseline? | Is current value known? | YES — all baselines are 0% (Firefox path does not exist) |
| Team can influence? | Direct effect possible? | YES — every KPI is directly downstream of the code we're about to write |
| Has guardrails? | Existing KPIs protected? | YES — permissions count, outbound network, Chrome regression |

## Handoff to DEVOPS (Instrumentation Asks)

For this feature, the team is small enough and the audience direct enough that
manual smoke testing is sufficient (matching the parent feature's pattern).
**No new instrumentation infrastructure is requested.** If the project later
adopts opt-in telemetry, the natural events to instrument are:

- `recording.started` (with `path: 'chrome' | 'firefox'`)
- `recording.completed` (with `duration_ms`, `path`, `container: 'mp4' | 'webm'`)
- `recording.aborted` (with `cause: 'user-cancel-picker' | 'tab-closed' | 'host-died' | 'mux-error'`)
- `picker.shown` (Firefox only)
- `picker.cancelled` (Firefox only)

For now, these are documented expectations only.
