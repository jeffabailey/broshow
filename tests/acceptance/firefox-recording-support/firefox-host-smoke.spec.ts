// ---------------------------------------------------------------------------
// Firefox host smoke (firefox-recording-support)
// ---------------------------------------------------------------------------
// Tag: @firefox @manual-fallback
//
// Why these tests are skipped:
//   Playwright's @playwright/test runner cannot drive a Firefox extension's
//   popup or background event page reliably enough to assert on the
//   getDisplayMedia user-gesture chain. The repo's existing convention is
//   `web-ext run` for Firefox smoke (package.json :: "start" uses web-ext for
//   Chromium today; the Firefox lane is launched manually).
//
//   The honest, decision-driven test boundary for AC-FF-01..05, AC-FF-07,
//   AC-FF-10 (Firefox-side) is the manual-smoke matrix in
//     docs/feature/firefox-recording-support/discuss/outcome-kpis.md
//     §"Measurement Plan"
//   which already specifies the data sources (Firefox stable + ESR), the
//   collection method (UAT pass/fail with file-duration measurement), and
//   the owner (DELIVER, acceptance-designer).
//
// What this file provides:
//   - A discoverable @firefox @manual-fallback marker so reviewers and CI
//     can see the Firefox lane is intentionally manual, not forgotten.
//   - One scenario per Firefox-side AC, skipped with an explicit pointer to
//     the matrix entry that pins the same outcome.
//   - Notes for the software-crafter (DELIVER): when web-ext gains an
//     automatable Firefox extension popup driver (or when we adopt
//     firefox-puppeteer / Marionette here), unskip these and replace each
//     `test.skip` body with the corresponding driving-port invocation.
//
// Driving ports referenced (Mandate 1):
//   - initializePopup(...)             -- src/popup-logic.ts
//   - createMessageHandler(apis)       -- src/background-logic.ts
//   - selectHost(target)               -- src/recorder-host.ts (DELIVER)
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

const MATRIX_POINTER =
  'See docs/feature/firefox-recording-support/discuss/outcome-kpis.md ' +
  '§"Measurement Plan" for the manual-smoke matrix that pins this outcome.';

test.describe('@firefox @manual-fallback Firefox host smoke (manual matrix)', () => {
  test.skip('AC-FF-01: Maria completes a 10-second Firefox recording and downloads an mp4 (via initializePopup -> createMessageHandler -> firefoxBackgroundRecorderHost)', () => {
    // Manual matrix entry: KPI 1 + KPI 4 in outcome-kpis.md.
    // Observable user outcome: file matching broshow-YYYY-MM-DD-HHmmss.mp4 in Downloads,
    // plays correctly with video and audio in VLC.
    // eslint-disable-next-line no-console
    console.warn(`[@manual-fallback] AC-FF-01 not automatable. ${MATRIX_POINTER}`);
  });

  test.skip('AC-FF-02: Maria cancels the Firefox surface picker and the popup returns to idle without an error toast (via initializePopup)', () => {
    // Manual matrix entry: KPI 2 (picker bootstrap) -- the "cancel" outcome.
    // Observable user outcome: no REC badge, no error message, Start button re-enabled.
    // eslint-disable-next-line no-console
    console.warn(`[@manual-fallback] AC-FF-02 not automatable. ${MATRIX_POINTER}`);
  });

  test.skip('AC-FF-03: Maria records for 60 seconds with the popup closed and ends with a downloaded file (via createMessageHandler + firefoxBackgroundRecorderHost)', () => {
    // Manual matrix entry: KPI 3 (recording completion) -- the canonical lifetime case.
    // Observable user outcome: downloaded file with duration in [55s, 65s].
    // eslint-disable-next-line no-console
    console.warn(`[@manual-fallback] AC-FF-03 not automatable. ${MATRIX_POINTER}`);
  });

  test.skip('AC-FF-04: Maria clicks Firefox\'s native "Stop sharing" and ends with the same downloaded file as if she clicked Stop Recording (via firefoxBackgroundRecorderHost track-ended listener)', () => {
    // Manual matrix entry: KPI 3 (completion) -- "native stop" subcase.
    // Observable user outcome: file downloaded automatically; REC badge cleared.
    // eslint-disable-next-line no-console
    console.warn(`[@manual-fallback] AC-FF-04 not automatable. ${MATRIX_POINTER}`);
  });

  test.skip('AC-FF-05: Maria\'s recording falls back to WebM when mp4-mux fails on Firefox (via firefoxBackgroundRecorderHost reusing offscreen-logic fallback path)', () => {
    // Manual matrix entry: KPI 5 (mp4-mux success rate) -- the fallback subcase.
    // Observable user outcome: broshow-YYYY-MM-DD-HHmmss.webm in Downloads;
    // popup shows the existing fallback notice.
    // eslint-disable-next-line no-console
    console.warn(`[@manual-fallback] AC-FF-05 not automatable. ${MATRIX_POINTER}`);
  });

  test.skip('AC-FF-07: Lin on a browser that supports neither path sees the unsupported message and a disabled Start button (via initializePopup)', () => {
    // Manual matrix entry: capability-probe row in KPI 1 (Firefox+other browsers).
    // Observable user outcome: "Recording is not supported in this browser"
    // visible; Start button disabled.
    // Note: this is also covered by tests/unit/capability-check.test.ts at the
    // pure-logic level. The manual smoke proves the message renders in the
    // real popup DOM.
    // eslint-disable-next-line no-console
    console.warn(`[@manual-fallback] AC-FF-07 visual confirmation only. ${MATRIX_POINTER}`);
  });

  test.skip('AC-FF-10: Maria on Firefox and Sam on Chrome record at the same wall-clock moment and produce identical filenames (via formatRecordingFilename, both targets)', () => {
    // Manual matrix entry: filename inspection row in KPI 4.
    // Observable user outcome: both files named broshow-2026-04-29-141522.{mp4|webm}.
    // Note: filename generator is a pure function (formatRecordingFilename) and
    // is fully covered by tests/unit/background.test.ts. The manual smoke
    // confirms the same generator is wired on both targets.
    // eslint-disable-next-line no-console
    console.warn(`[@manual-fallback] AC-FF-10 cross-browser parity is matrix-tested. ${MATRIX_POINTER}`);
  });
});
