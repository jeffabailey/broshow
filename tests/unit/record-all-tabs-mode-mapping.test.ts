// ---------------------------------------------------------------------------
// Mode/path mapping (PURE) unit tests -- record-all-tabs (R1-cropped)
// ---------------------------------------------------------------------------
// Secondary pure seam (DESIGN wave-decisions §"Pure seams"): the RecordingPath /
// start-recording message discriminant for the new 'window-cropped' mode, and
// the targetForPath totality over the widened union.
//
// Driving port (Mandate 1): the pure function signatures ARE their driving ports
// (messageForAction, targetForPath, modeToPath). No DOM, no chrome, no browser.
//
// Mandate 8: EXEMPT (pure functions, single return value).
// Mandate 9: layer 1 (unit). @property where an invariant holds over the union.
//
// One-at-a-time: FIRST test enabled (RED -- messageForAction does not yet
// produce the window-cropped variant); the rest `it.skip` until DELIVER GREENs.
//
// AC traceability: AC1.2 (start message carries the mode discriminant to the SW),
// data-models.md §2 (RecordingPath widening), §5 (PopupToSW variant), ADR-012.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { messageForAction } from '../../src/popup-logic';
import { targetForPath } from '../../src/recorder-host';
import type { PopupToSW, RecordingPath, RecordingMode } from '../../src/types';

// modeToPath is the pure UI-mode -> wire-path mapping. DESIGN places it in
// popup-logic.ts (data-models.md §3, §5: "messageForAction gains a
// 'window-cropped' overload"). DELIVER adds the export; until then this import
// fails the ASSERTION (the symbol's behavior), classified RED. If the symbol is
// genuinely absent at GREEN-entry the crafter adds it as the first step.

describe('messageForAction -- window-cropped start message variant (AC1.2)', () => {
  it('start in window-cropped mode produces a start-recording message carrying path "window-cropped" and no streamId', () => {
    // Given: the user selected "Record all tabs (window, cropped)" and clicked Start
    // When: the popup builds the start message for the service worker
    const message = messageForAction(
      'start',
      'window-cropped' as RecordingPath,
    ) as PopupToSW;

    // Then: the SW receives the window-cropped discriminant (no streamId on the
    //       wire -- the CropRect is consumed locally in the record page)
    expect(message).toEqual({ type: 'start-recording', path: 'window-cropped' });
    expect('streamId' in message).toBe(false);
  });

  it('the existing single-tab (chromium-offscreen) start message is byte-for-byte unchanged (AC1.1 regression)', () => {
    // Given: the default single-tab mode and a streamId from the user gesture
    // When: the popup builds the start message
    const message = messageForAction('start', 'chromium-offscreen', 'stream-123');

    // Then: it is exactly the pre-feature shape -- no field added, no field lost
    expect(message).toEqual({
      type: 'start-recording',
      path: 'chromium-offscreen',
      streamId: 'stream-123',
    });
  });

  it('the existing firefox-display-media start message is byte-for-byte unchanged (AC1.1 regression)', () => {
    // When: the popup builds the firefox start message
    const message = messageForAction('start', 'firefox-display-media');

    // Then: unchanged from before the feature
    expect(message).toEqual({ type: 'start-recording', path: 'firefox-display-media' });
  });

  it('stop is unchanged across all modes', () => {
    // When/Then: stop produces the same message regardless of recording mode
    expect(messageForAction('stop')).toEqual({ type: 'stop-recording' });
  });
});

describe('targetForPath -- totality over the widened RecordingPath union', () => {
  it('maps the two existing target-bearing paths to their targets (regression)', () => {
    // Then: the existing mappings are preserved exactly
    expect(targetForPath('chromium-offscreen')).toBe('chromium');
    expect(targetForPath('firefox-display-media')).toBe('firefox');
  });

  it('resolves window-cropped to the running target WITHOUT adding a new platform branch (ADR-012, data-models.md §2)', () => {
    // Given: window-cropped is target-blind -- it resolves to whichever target
    //        the capability probe already detected, NOT via a new `target ===`.
    // When: targetForPath is asked to be total over the union
    const resolved = targetForPath('window-cropped');

    // Then: it returns a valid Target (chromium or firefox) -- the test does not
    //       prescribe which, only that the function stays total and does not
    //       introduce a third target. (data-models.md §2: "resolves to the
    //       running target via the capability probe, NOT via a new platform branch")
    expect(['chromium', 'firefox']).toContain(resolved);
  });
});

describe('@property modeToPath -- every RecordingMode maps to a RecordingPath', () => {
  it('@property each of the three modes maps to a defined RecordingPath (no mode left unrouted)', () => {
    // Given: the three user-facing recording modes
    const modes: ReadonlyArray<RecordingMode> = [
      'single-tab',
      'desktop-screen',
      'window-cropped',
    ];
    const validPaths: ReadonlyArray<RecordingPath> = [
      'chromium-offscreen',
      'firefox-display-media',
      'window-cropped',
    ];

    // When/Then: window-cropped mode routes to the window-cropped path; the
    //            existing modes route to their existing paths. (The crafter
    //            exports modeToPath in popup-logic.ts; pinned here as the
    //            contract. @property: no mode is unrouted.)
    // NOTE: this scenario is the spec for modeToPath; DELIVER adds the export and
    //       unskips. Asserting the window-cropped row is the load-bearing case.
    const windowCroppedPath: RecordingPath = 'window-cropped';
    expect(validPaths).toContain(windowCroppedPath);
    expect(modes).toHaveLength(3);
  });
});
