# Test Scenarios: firefox-recording-support

> Wave: DISTILL
> Owner: acceptance-designer (Quinn)
> Inputs: `../discuss/acceptance-criteria.md`, `../discuss/user-stories.md`,
> `../design/component-boundaries.md`, `../design/data-models.md`,
> `../../adrs/ADR-003-firefox-recording-host.md`.

This document is the narrative companion to the executable test files. Each
scenario below names: the spec file, the driving port it invokes, the AC /
user-story it traces to, and the observable user outcome it asserts.

## Scenario inventory

| # | Spec file                                                       | Tag(s)                                     | Driving port                | Pins (AC / US)         |
|---|-----------------------------------------------------------------|--------------------------------------------|-----------------------------|------------------------|
| 1 | `tests/acceptance/firefox-recording-support/walking-skeleton.spec.ts` | `@walking_skeleton @real-io @chromium`     | `initializePopup`           | AC-FF-06               |
| 2 | `tests/acceptance/firefox-recording-support/walking-skeleton.spec.ts` | `@walking_skeleton @real-io @chromium`     | `initializePopup` + `createMessageHandler` | AC-FF-06, AC-FF-10 (Chrome side) |
| 3 | `tests/acceptance/firefox-recording-support/walking-skeleton.spec.ts` | `@walking_skeleton @real-io @chromium`     | `initializePopup`           | AC-FF-09               |
| 4 | `tests/acceptance/firefox-recording-support/walking-skeleton.spec.ts` | `@walking_skeleton @real-io @chromium`     | manifest source artifact     | AC-FF-08               |
| 5 | `tests/acceptance/firefox-recording-support/walking-skeleton.spec.ts` | `@walking_skeleton @real-io @chromium`     | manifest dist artifact       | AC-FF-08               |
| 6 | `tests/acceptance/firefox-recording-support/firefox-host-smoke.spec.ts` | `@firefox @manual-fallback`                 | `initializePopup` + `createMessageHandler` + `selectHost('firefox')` | AC-FF-01 |
| 7 | (same)                                                          | `@firefox @manual-fallback`                 | `initializePopup`           | AC-FF-02               |
| 8 | (same)                                                          | `@firefox @manual-fallback`                 | `createMessageHandler` + Firefox host | AC-FF-03      |
| 9 | (same)                                                          | `@firefox @manual-fallback`                 | Firefox host track-ended    | AC-FF-04               |
| 10| (same)                                                          | `@firefox @manual-fallback`                 | Firefox host stop fallback  | AC-FF-05               |
| 11| (same)                                                          | `@firefox @manual-fallback`                 | `initializePopup`           | AC-FF-07 (visual)      |
| 12| (same)                                                          | `@firefox @manual-fallback`                 | `formatRecordingFilename`   | AC-FF-10               |
| 13| `tests/unit/recorder-host-contract.test.ts`                     | `@property`                                | `selectHost`                | AC-FF-06 (shape)       |
| 14| `tests/unit/recorder-host-contract.test.ts`                     |                                            | `selectHost('firefox').start` | AC-FF-02             |
| 15| `tests/unit/recorder-host-contract.test.ts`                     |                                            | `selectHost('chromium').start` | AC-FF-01 (Chromium parity) |
| 16| `tests/unit/recorder-host-contract.test.ts`                     |                                            | `selectHost('firefox').stop` | AC-FF-01              |
| 17| `tests/unit/recorder-host-contract.test.ts`                     |                                            | `selectHost('firefox').stop` | AC-FF-05 (mux-error)  |
| 18| `tests/unit/recorder-host-contract.test.ts`                     |                                            | `selectHost('chromium').stop` | AC-FF-06              |
| 19| `tests/unit/recorder-host-contract.test.ts`                     |                                            | `selectHost`                | AC-FF-06 (single branch) |
| 20| `tests/unit/capability-check.test.ts`                           |                                            | `initializePopup`           | AC-FF-06, US-FF-01     |
| 21| `tests/unit/capability-check.test.ts`                           |                                            | `initializePopup`           | AC-FF-06               |
| 22| `tests/unit/capability-check.test.ts`                           |                                            | `initializePopup`           | AC-FF-04, US-FF-01     |
| 23| `tests/unit/capability-check.test.ts`                           |                                            | `initializePopup`           | AC-FF-07               |
| 24| `tests/unit/capability-check.test.ts`                           |                                            | `CapabilityCheckResult`     | data-models.md §2      |
| 25| `tests/unit/manifest-patch-firefox-permissions.test.ts`         |                                            | `stripChromeOnlyPermissions`| AC-FF-08, NFR-FF-01    |
| 26| `tests/unit/manifest-patch-firefox-permissions.test.ts`         |                                            | `stripChromeOnlyPermissions`| AC-FF-08               |
| 27| `tests/unit/manifest-patch-firefox-permissions.test.ts`         |                                            | `stripChromeOnlyPermissions`| (purity contract)      |
| 28| `tests/unit/manifest-patch-firefox-permissions.test.ts`         |                                            | `CHROME_ONLY_PERMISSIONS`   | AC-FF-08               |
| 29| `tests/unit/manifest-patch-firefox-permissions.test.ts`         |                                            | composed patcher pipeline    | AC-FF-08               |
| 30| `tests/unit/manifest-patch-firefox-permissions.test.ts`         |                                            | (Chromium manifest pin)     | AC-FF-06, AC-FF-08     |

Total: 30 scenarios across 5 files. 5 walking-skeleton scenarios (Strategy C
real Chromium); 7 manual-fallback Firefox scenarios; 18 unit-level contract /
regression tests. The manual-fallback Firefox scenarios are visible markers
that point at the matrix in `outcome-kpis.md`; they do not run in CI but
appear in the test output so the Firefox lane is never silently dropped.

## AC-to-scenario traceability

| AC      | Scenarios pinning it                                                       |
|---------|----------------------------------------------------------------------------|
| AC-FF-01 | 6, 15, 16                                                                   |
| AC-FF-02 | 7, 14                                                                       |
| AC-FF-03 | 8                                                                           |
| AC-FF-04 | 9                                                                           |
| AC-FF-05 | 10, 17                                                                      |
| AC-FF-06 | 1, 2, 13, 18, 19, 20, 21, 30                                                |
| AC-FF-07 | 11, 23                                                                      |
| AC-FF-08 | 4, 5, 25, 26, 28, 29, 30                                                    |
| AC-FF-09 | 3                                                                           |
| AC-FF-10 | 2 (Chrome side), 12 (cross-browser parity), background.test.ts (formatRecordingFilename) |

Every AC has at least one scenario. AC-FF-01..05 and AC-FF-07/AC-FF-10 are
pinned by both unit tests (fast, deterministic) and manual-matrix scenarios
(real Firefox runtime); AC-FF-06/08/09 are pinned by automated Chromium tests.

## US-to-scenario traceability

| US       | Scenarios pinning it                                                      |
|----------|---------------------------------------------------------------------------|
| US-FF-01 | 11, 20, 22, 23, 24                                                         |
| US-FF-02 | 6, 7, 14                                                                   |
| US-FF-03 | 8                                                                          |
| US-FF-04 | 22, 1, 21                                                                  |
| US-FF-05 | 6, 10, 16, 17                                                              |
| US-FF-06 | 9                                                                          |
| US-FF-07 | (covered by recorder-host contract -- `hadAudioTrack` field; see scenario 14, 15) |

US-FF-07 is partially indirect: the `hadAudioTrack` boolean is pinned at the
HostStartResult shape in scenarios 14 and 15. The popup-visible "Audio was
not captured" copy is exercised by the manual-matrix smoke (Release 2,
post-walking-skeleton), not by an automated scenario in this DISTILL pass.

## Error / edge-case ratio (Mandate happy-path bias)

Total scenarios: 30. Error / edge / negative scenarios:

- 7 (picker cancellation -- error branch)
- 10, 17 (mp4-mux failure -> webm fallback -- error branch)
- 11, 23 (unsupported browser -- error branch)
- 14 (picker-cancelled discriminant -- error branch)
- 21 (Firefox hint NOT shown on Chrome -- negative case)
- 27 (input-not-mutated purity -- defensive)
- 30 (Chromium manifest unchanged -- regression / negative case)
- 4, 5 (no new permissions -- guardrail / negative case)
- 19 (chromium and firefox hosts are not the same instance -- negative parity)
- 24 (exhaustiveness pin -- defensive)
- 26 (only the listed permissions removed -- negative case)
- 28 (CHROME_ONLY_PERMISSIONS list pin -- defensive)
- 3 (AC-FF-09 zero outbound -- guardrail / negative case)

Error/negative scenarios: 14 of 30 = **47%**. Above the 40% threshold.

## Walking-skeleton selection

The walking skeleton, per `../discuss/story-map.md`, is the thinnest end-to-
end Firefox slice that produces ONE downloadable file (US-FF-01 + US-FF-02 +
US-FF-03 + US-FF-05). That slice is **automatable only via real Firefox**;
the Chromium walking skeleton in this feature is the **regression-guard
companion** that proves the new RecorderHost abstraction does not break Sam's
existing v0.1.2 experience.

Two walking-skeleton scenarios in `walking-skeleton.spec.ts` are the demo-
able outcomes:

- "Sam on Chrome opens the popup and never sees the Firefox surface-picker
  hint" (scenario 1) -- proves the Chrome path remains user-observable
  unchanged.
- "Sam on Chrome records a tab end-to-end and ends with a downloaded file"
  (scenario 2) -- proves the full Chromium pipeline (popup -> SW ->
  offscreen -> mp4-mux -> chrome.downloads) still produces a file with the
  v0.1.2 filename pattern.

The Firefox walking-skeleton outcome ("Maria records 10 seconds and ends
with a file") is scenario 6 in `firefox-host-smoke.spec.ts`, skipped under
`@manual-fallback` and pinned to the matrix in `outcome-kpis.md`. See
`./walking-skeleton.md` for the full justification.

## Spec-file purpose summary

- **walking-skeleton.spec.ts** -- Strategy C (real Chromium via Playwright).
  AC-FF-06 / AC-FF-08 / AC-FF-09 only. ADDS scenarios; does not duplicate
  the existing parent-feature walking-skeleton.spec.ts.
- **firefox-host-smoke.spec.ts** -- @firefox @manual-fallback. Discoverable
  markers for the Firefox lane; each test points at outcome-kpis.md.
- **recorder-host-contract.test.ts** -- pins the new RecorderHost port shape
  and adapter parity at the unit-logic boundary.
- **capability-check.test.ts** -- pins the 3-variant CapabilityCheckResult.
- **manifest-patch-firefox-permissions.test.ts** -- pins the Chromium-only
  permission stripping (NFR-FF-01).

## Why no Gherkin .feature files?

The repo's existing convention is Playwright + vitest with descriptive
`describe/it` strings, not pytest-bdd / cucumber. Per the BDD methodology
skill, "tests of behavior" in any framework satisfy the BDD intent if the
Given/When/Then structure is preserved and the language is business-
focused. Each scenario in this feature uses comment-block Given/When/Then
inside the test body and a business-language describe/it title, matching
the parent-feature convention. The DISCUSS-wave Gherkin
(`journey-record-tab-firefox.feature`) remains the canonical BDD source.
