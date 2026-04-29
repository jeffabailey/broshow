// ---------------------------------------------------------------------------
// Firefox host smoke (firefox-recording-support)
// ---------------------------------------------------------------------------
// Tag: @firefox @manual-fallback
//
// Why these tests are skipped:
//   Playwright's @playwright/test runner cannot drive a Firefox extension's
//   popup or background event page reliably enough to assert on the
//   getDisplayMedia user-gesture chain. `web-ext run --target firefox-desktop`
//   can launch Firefox with the add-on loaded but cannot click through the
//   popup, dispatch a user-gesture into the background page, OR drive the
//   surface picker -- those are deliberately gated to real human interaction
//   by Gecko (see docs/feature/firefox-recording-support/deliver/spikes.md
//   "Why this is PENDING-MANUAL rather than automated").
//
//   The honest, decision-driven test boundary for AC-FF-01..05, AC-FF-07,
//   AC-FF-10 (Firefox-side) is the manual-smoke matrix in
//     docs/feature/firefox-recording-support/discuss/outcome-kpis.md
//     §"Measurement Plan"
//   which already specifies the data sources (Firefox stable + ESR), the
//   collection method (UAT pass/fail with file-duration measurement), and
//   the owner (DELIVER, acceptance-designer).
//
//   Per-run outcomes are recorded in
//     docs/feature/firefox-recording-support/deliver/manual-smoke-results.md
//   with status PENDING-MANUAL / PASS / FAIL, tester, date, and notes.
//
// Programmatic Firefox coverage that DOES run in CI:
//   - tests/unit/release-bundles.test.ts -- "Firefox bundle passes web-ext
//     lint with zero errors". Covers the static manifest + xpi structure
//     guardrails (KPI 1 sub-condition: probe accepts Firefox; AC-FF-08).
//   - tests/unit/manifest-patch-firefox-permissions.test.ts -- pins the
//     permission set and gecko block on the patched manifest.
//   - tests/unit/capability-check.test.ts -- pure-logic Firefox branch of
//     the capability probe (AC-FF-07 logic, AC-FF-06).
//   - tests/unit/recorder-host-contract.test.ts -- HostStartResult /
//     HostStopResult parity (AC-FF-01, AC-FF-02, AC-FF-05 shape).
//   The runtime manual-smoke scenarios below are the LAST mile that those
//   tests cannot reach (real picker, real getDisplayMedia, real download).
//
// What this file provides:
//   - A discoverable @firefox @manual-fallback marker so reviewers and CI
//     can see the Firefox lane is intentionally manual, not forgotten.
//   - One scenario per Firefox-side AC, skipped with an explicit pointer to
//     the matrix entry that pins the same outcome AND a pointer to the
//     manual-smoke-results.md row that tracks the per-run outcome.
//   - Notes for the software-crafter (DELIVER): when web-ext gains an
//     automatable Firefox extension popup driver (or when we adopt
//     firefox-puppeteer / Marionette here), unskip these and replace each
//     `test.skip` body with the corresponding driving-port invocation.
//
// Driving ports referenced (Mandate 1):
//   - initializePopup(...)             -- src/popup-logic.ts
//   - createMessageHandler(apis)       -- src/background-logic.ts
//   - selectHost(target)               -- src/recorder-host.ts
//
// AC traceability (each scenario name carries the AC id):
//   AC-FF-01 Complete Firefox recording flow (mp4)
//   AC-FF-02 Picker cancellation is a graceful no-op
//   AC-FF-03 Recording survives popup close
//   AC-FF-04 Native "Stop sharing" matches Stop button behavior
//   AC-FF-05 WebM fallback works on Firefox
//   AC-FF-07 Capability probe still blocks unsupported browsers
//   AC-FF-10 Filename pattern parity with Chrome
// ---------------------------------------------------------------------------

import { test } from '@playwright/test';

const KPI_MATRIX =
  'docs/feature/firefox-recording-support/discuss/outcome-kpis.md ' +
  '§"Measurement Plan"';

const RESULTS_LOG =
  'docs/feature/firefox-recording-support/deliver/manual-smoke-results.md';

test.describe('@firefox @manual-fallback Firefox host smoke (manual matrix)', () => {
  test.skip('AC-FF-01: Maria completes a 10-second Firefox recording and downloads an mp4 (via initializePopup -> createMessageHandler -> firefoxBackgroundRecorderHost)', () => {
    // Manual matrix entry: KPI 3 (recording completion) row + KPI 4
    // (filename parity) row + KPI 5 (mp4-mux success) row in:
    //   docs/feature/firefox-recording-support/discuss/outcome-kpis.md
    //   §"Measurement Plan", rows "3", "4", "5".
    // Per-run outcome tracked in:
    //   docs/feature/firefox-recording-support/deliver/manual-smoke-results.md
    //   row "AC-FF-01".
    // Observable user outcome: file matching broshow-YYYY-MM-DD-HHmmss.mp4
    // appears in Downloads, plays correctly with video and audio in VLC.
    // eslint-disable-next-line no-console
    console.warn(
      `[@manual-fallback] AC-FF-01 not automatable. ` +
        `Matrix: ${KPI_MATRIX}. Results log: ${RESULTS_LOG}.`,
    );
  });

  test.skip('AC-FF-02: Maria cancels the Firefox surface picker and the popup returns to idle without an error toast (via initializePopup)', () => {
    // Manual matrix entry: KPI 2 (picker bootstrap) row in:
    //   docs/feature/firefox-recording-support/discuss/outcome-kpis.md
    //   §"Measurement Plan", row "2", "cancel" outcome of the 3 picker
    //   outcomes (tab, window, cancel).
    // Per-run outcome tracked in:
    //   docs/feature/firefox-recording-support/deliver/manual-smoke-results.md
    //   row "AC-FF-02".
    // Observable user outcome: no REC badge, no error message, Start
    // button re-enabled.
    // eslint-disable-next-line no-console
    console.warn(
      `[@manual-fallback] AC-FF-02 not automatable. ` +
        `Matrix: ${KPI_MATRIX}. Results log: ${RESULTS_LOG}.`,
    );
  });

  test.skip('AC-FF-03: Maria records for 60 seconds with the popup closed and ends with a downloaded file (via createMessageHandler + firefoxBackgroundRecorderHost)', () => {
    // Manual matrix entry: KPI 3 (recording completion) row in:
    //   docs/feature/firefox-recording-support/discuss/outcome-kpis.md
    //   §"Measurement Plan", row "3", "60s" duration cell of the 15s/60s/5min
    //   smoke matrix. This is the canonical lifetime case AND the popup-close
    //   subcase (popup closes between Start and Stop).
    // Per-run outcome tracked in:
    //   docs/feature/firefox-recording-support/deliver/manual-smoke-results.md
    //   row "AC-FF-03".
    // Observable user outcome: downloaded file with duration in [55s, 65s].
    // eslint-disable-next-line no-console
    console.warn(
      `[@manual-fallback] AC-FF-03 not automatable. ` +
        `Matrix: ${KPI_MATRIX}. Results log: ${RESULTS_LOG}.`,
    );
  });

  test.skip('AC-FF-04: Maria clicks Firefox\'s native "Stop sharing" and ends with the same downloaded file as if she clicked Stop Recording (via firefoxBackgroundRecorderHost track-ended listener)', () => {
    // Manual matrix entry: KPI 3 (recording completion) row in:
    //   docs/feature/firefox-recording-support/discuss/outcome-kpis.md
    //   §"Measurement Plan", row "3", "native stop" subcase. The track-ended
    //   path must produce the same download as the Stop-button path.
    // Per-run outcome tracked in:
    //   docs/feature/firefox-recording-support/deliver/manual-smoke-results.md
    //   row "AC-FF-04".
    // Observable user outcome: file downloaded automatically; REC badge
    // cleared.
    // eslint-disable-next-line no-console
    console.warn(
      `[@manual-fallback] AC-FF-04 not automatable. ` +
        `Matrix: ${KPI_MATRIX}. Results log: ${RESULTS_LOG}.`,
    );
  });

  test.skip("AC-FF-05: Maria's recording falls back to WebM when mp4-mux fails on Firefox (via firefoxBackgroundRecorderHost reusing offscreen-logic fallback path)", () => {
    // Manual matrix entry: KPI 5 (mp4-mux success rate) row in:
    //   docs/feature/firefox-recording-support/discuss/outcome-kpis.md
    //   §"Measurement Plan", row "5", "5 recordings" smoke set; this scenario
    //   pins the "mux fails -> webm fallback" path.
    // Per-run outcome tracked in:
    //   docs/feature/firefox-recording-support/deliver/manual-smoke-results.md
    //   row "AC-FF-05".
    // Observable user outcome: broshow-YYYY-MM-DD-HHmmss.webm in Downloads;
    // popup shows the existing fallback notice.
    // eslint-disable-next-line no-console
    console.warn(
      `[@manual-fallback] AC-FF-05 not automatable. ` +
        `Matrix: ${KPI_MATRIX}. Results log: ${RESULTS_LOG}.`,
    );
  });

  test.skip('AC-FF-07: Lin on a browser that supports neither path sees the unsupported message and a disabled Start button (via initializePopup)', () => {
    // Manual matrix entry: KPI 1 (probe accepts Firefox) row in:
    //   docs/feature/firefox-recording-support/discuss/outcome-kpis.md
    //   §"Measurement Plan", row "1", capability-probe sub-row covering
    //   Firefox + other browsers.
    // Per-run outcome tracked in:
    //   docs/feature/firefox-recording-support/deliver/manual-smoke-results.md
    //   row "AC-FF-07".
    // Observable user outcome: "Recording is not supported in this browser"
    // visible; Start button disabled.
    // Note: this is also covered by tests/unit/capability-check.test.ts at
    // the pure-logic level. The manual smoke proves the message renders in
    // the real popup DOM on a non-Firefox/non-Chromium browser.
    // eslint-disable-next-line no-console
    console.warn(
      `[@manual-fallback] AC-FF-07 visual confirmation only. ` +
        `Matrix: ${KPI_MATRIX}. Results log: ${RESULTS_LOG}.`,
    );
  });

  test.skip('AC-FF-10: Maria on Firefox and Sam on Chrome record at the same wall-clock moment and produce identical filenames (via formatRecordingFilename, both targets)', () => {
    // Manual matrix entry: KPI 4 (filename parity) row in:
    //   docs/feature/firefox-recording-support/discuss/outcome-kpis.md
    //   §"Measurement Plan", row "4", "Inspect downloaded files on both
    //   browsers" cross-browser filename comparison.
    // Per-run outcome tracked in:
    //   docs/feature/firefox-recording-support/deliver/manual-smoke-results.md
    //   row "AC-FF-10".
    // Observable user outcome: both files named
    // broshow-2026-04-29-141522.{mp4|webm}.
    // Note: formatRecordingFilename is a pure function and is fully covered
    // by tests/unit/background.test.ts. The manual smoke confirms the same
    // generator is wired on both targets at runtime.
    // eslint-disable-next-line no-console
    console.warn(
      `[@manual-fallback] AC-FF-10 cross-browser parity is matrix-tested. ` +
        `Matrix: ${KPI_MATRIX}. Results log: ${RESULTS_LOG}.`,
    );
  });
});
