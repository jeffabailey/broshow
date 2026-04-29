# Manual Smoke Results: firefox-recording-support

> Wave: DELIVER
> Step: 03-02 (Firefox smoke spec activated against runtime + manual matrix pins)
> Owner: DELIVER (acceptance-designer / human-in-the-loop on Firefox 121+)

This file is the per-run log for the manual-smoke matrix declared in
`docs/feature/firefox-recording-support/discuss/outcome-kpis.md`
§"Measurement Plan". The Firefox-side scenarios in
`tests/acceptance/firefox-recording-support/firefox-host-smoke.spec.ts`
are skipped under `@manual-fallback` because Playwright + web-ext cannot
drive the Firefox surface picker reliably enough (see
`./spikes.md` "Why this is PENDING-MANUAL rather than automated"). This
log replaces the missing automated assertion: a tester runs the matrix
and updates the `Status` cells from `PENDING-MANUAL` to `PASS` or `FAIL`.

## Initial state

All scenarios are `PENDING-MANUAL`. The manual matrix is run:

- Once per release (KPIs 1-5, all rows).
- Sanity-check on each PR touching `popup-logic.ts`, `background-logic.ts`,
  `recorder-host*.ts`, or the manifest pipeline (KPIs 1, 4 -- the cheap
  rows: probe-accepts-Firefox + filename-parity).

## How to run the matrix

1. Build the artifacts: `npm run package`. Confirm
   `packages/broshow-firefox-<version>.xpi` exists and
   `tests/unit/release-bundles.test.ts` is green (web-ext lint passes).
2. Follow the Firefox load steps in
   `./spikes.md` §"S-1 / Recipe", steps 1-3 (load temporary add-on,
   open background DevTools).
3. For each row below, execute the listed steps, observe the outcome
   against the "Expected outcome" cell, and update `Status`, `Tester`,
   `Date`, and `Notes`.
4. When all rows are PASS, the Firefox runtime evidence for AC-FF-01..05,
   AC-FF-07, AC-FF-10 is complete. Commit this file with the updated
   results.
5. If any row is FAIL, do NOT silently work around. STOP and escalate
   per `../../adrs/ADR-003-firefox-recording-host.md` "Alternatives".

## Smoke matrix

| Scenario | AC | KPI | Spec test | Steps (summary) | Expected outcome | Status | Tester | Date | Notes |
|---|---|---|---|---|---|---|---|---|---|
| AC-FF-01 | AC-FF-01 | 3, 4, 5 | `firefox-host-smoke.spec.ts` line ~73 | Load add-on; open popup; click Start; pick a tab; wait 10s; click Stop. | File `broshow-YYYY-MM-DD-HHmmss.mp4` in Downloads, plays in VLC with video + audio. | PENDING-MANUAL | _PENDING_ | _PENDING_ | _PENDING_ |
| AC-FF-02 | AC-FF-02 | 2 | `firefox-host-smoke.spec.ts` line ~89 | Load add-on; open popup; click Start; cancel the surface picker. | No REC badge, no error toast, Start button re-enabled, popup returns to idle. | PENDING-MANUAL | _PENDING_ | _PENDING_ | _PENDING_ |
| AC-FF-03 | AC-FF-03 | 3 | `firefox-host-smoke.spec.ts` line ~104 | Load add-on; open popup; click Start; pick a surface; close the popup; wait 60s; reopen popup; click Stop. | Downloaded file with duration in [55s, 65s]. | PENDING-MANUAL | _PENDING_ | _PENDING_ | _PENDING_ |
| AC-FF-04 | AC-FF-04 | 3 | `firefox-host-smoke.spec.ts` line ~120 | Load add-on; open popup; click Start; pick a surface; click Firefox's native "Stop sharing" indicator (NOT the popup Stop button). | File downloaded automatically; REC badge cleared; popup state matches "stopped via Stop button" path. | PENDING-MANUAL | _PENDING_ | _PENDING_ | _PENDING_ |
| AC-FF-05 | AC-FF-05 | 5 | `firefox-host-smoke.spec.ts` line ~136 | Load add-on; force mp4-mux failure (e.g., capture an unsupported codec source); record for 10s; click Stop. | File `broshow-YYYY-MM-DD-HHmmss.webm` in Downloads; popup shows fallback notice. | PENDING-MANUAL | _PENDING_ | _PENDING_ | _PENDING_ |
| AC-FF-07 | AC-FF-07 | 1 | `firefox-host-smoke.spec.ts` line ~155 | Open the extension popup on a browser that supports neither MV3 path (e.g., legacy Firefox <121, or a non-Gecko/non-Chromium browser). | "Recording is not supported in this browser" message visible; Start button disabled. | PENDING-MANUAL | _PENDING_ | _PENDING_ | _PENDING_ |
| AC-FF-10 | AC-FF-10 | 4 | `firefox-host-smoke.spec.ts` line ~175 | Record on Firefox and Chrome at the same wall-clock moment; compare filenames. | Both files named `broshow-YYYY-MM-DD-HHmmss.{mp4\|webm}` with identical timestamp portion (allowing for second-resolution drift). | PENDING-MANUAL | _PENDING_ | _PENDING_ | _PENDING_ |

## Status legend

| Status | Meaning |
|---|---|
| `PENDING-MANUAL` | The matrix has not yet been run for the current release. Default initial state. |
| `PASS` | A tester executed the steps and observed the expected outcome. Tester / Date / Notes filled. |
| `FAIL` | A tester executed the steps and observed a different outcome. Notes describe the gap. Triggers ADR-003 escalation. |

## Cross-references

- KPI definitions and per-KPI measurement method:
  `../discuss/outcome-kpis.md` §"Outcome KPIs", §"Measurement Plan".
- Acceptance criteria pinned by each row:
  `../discuss/acceptance-criteria.md` (AC-FF-01..05, AC-FF-07, AC-FF-10).
- Scenario-to-AC traceability:
  `../distill/test-scenarios.md` §"Scenario inventory" rows 6-12.
- Walking-skeleton automated companion (Chromium):
  `../../../../tests/acceptance/firefox-recording-support/walking-skeleton.spec.ts`.
- Spike outcomes that gate the manual run:
  `./spikes.md` (S-1 user-gesture chain; S-2 5-minute keep-alive).
