# Walking Skeleton: firefox-recording-support

> Wave: DISTILL
> Strategy: **C (Real local)** for the automatable Chromium lane;
>           **manual-fallback matrix** for the Firefox lane.
> Source of truth for strategy declaration: this file.

## Strategy declaration (Mandate 9a)

This feature has two walking-skeleton tracks because the underlying runtimes
have asymmetric automation support:

### Track 1 -- Chromium regression-guard skeleton (Strategy C)

| Decision | Value | Rationale |
|---|---|---|
| Strategy | **C (Real local)** | Real Chromium via `chromium.launchPersistentContext`; real `chrome.offscreen`; real `chrome.tabCapture`; real `chrome.downloads`; real local filesystem. No containers (per caller pre-answered decision). |
| Spec file | `tests/acceptance/firefox-recording-support/walking-skeleton.spec.ts` | New file; ADDS scenarios alongside the existing `tests/acceptance/walking-skeleton.spec.ts` -- does not modify it. |
| Tags | `@walking_skeleton @real-io @chromium` | The `@chromium` tag distinguishes from `@firefox` so a future selective run can target one runtime. |
| Driving ports invoked | `initializePopup`, `createMessageHandler` (indirectly via the loaded extension); manifest-source-artifact reads | Mandate 1 satisfied: no internal-component imports. |
| Litmus test (Mandate 9d) | Deleting `selectHost` (the new platform branch) MUST cause this skeleton to break. Deleting only the in-memory shim would NOT break it -- it never used a shim. | Real adapter wiring is what's exercised. |

### Track 2 -- Firefox runtime smoke (manual-fallback matrix)

| Decision | Value | Rationale |
|---|---|---|
| Strategy | **Hybrid: web-ext run when automatable; manual matrix today** | Playwright cannot drive Firefox extensions reliably enough to assert on the `getDisplayMedia` user-gesture chain. The repo's existing convention is `web-ext run` (package.json scripts). |
| Spec file | `tests/acceptance/firefox-recording-support/firefox-host-smoke.spec.ts` | One scenario per Firefox-side AC, all `test.skip` with `@manual-fallback`, each carrying a pointer to the matrix entry that pins the same outcome. |
| Tags | `@firefox @manual-fallback` | Discoverable markers in CI test output. |
| Manual matrix location | `docs/feature/firefox-recording-support/discuss/outcome-kpis.md` §"Measurement Plan" | KPI 1..5 rows already enumerate Firefox stable + ESR coverage, smoke matrix outcomes (tab/window/cancel), and file-duration measurements. |
| Why not containers? | Caller pre-answered "No container (real adapters on host)". A Docker'd Firefox cannot host a real surface picker user-gesture -- the manual matrix is the honest test. |

## Why "regression-guard" + "runtime smoke" instead of one combined skeleton?

`docs/feature/firefox-recording-support/discuss/story-map.md` defines the
walking skeleton as **US-FF-01 + US-FF-02 + US-FF-03 + US-FF-05** (Maria's
end-to-end Firefox flow). That slice is, by definition, only realizable on
Firefox. Until Playwright (or another harness) can drive a Firefox extension
popup against a real `getDisplayMedia` user-gesture chain, the highest-
fidelity automated test we can run is the Chromium regression-guard suite
that proves the **shared infrastructure** (selectHost, RecorderHost port,
extended CapabilityCheckResult) does not break Sam.

The manual matrix in `outcome-kpis.md` is the executable Firefox skeleton.
Each row is a step in Maria's journey, and each AC-FF-01..05 has a row.
DELIVER (smoke-tester) executes the matrix once per release and on every PR
that touches popup-logic.ts (per the KPI 1 collection method).

## Mandate 5 litmus test (user-centric framing)

For each automated walking skeleton scenario:

| Scenario title | User-goal? | Then is observable? | Stakeholder-confirmable? |
|---|---|---|---|
| "Sam on Chrome opens the popup and never sees the Firefox surface-picker hint" | YES (Sam expects no UX change) | YES (Start button visible, hint absent) | YES (a non-technical reviewer can confirm) |
| "Sam on Chrome records a tab end-to-end and ends with a downloaded file" | YES (Sam wants a file) | YES (file in Downloads with broshow-* name) | YES |
| "Sam completes a recording and BroShow makes zero outbound network requests" | YES (Sam values privacy) | YES (network panel is empty -- assert via fixture) | YES |

For the manual-fallback Firefox scenarios, each title names Maria as the
actor and ends with an observable file or popup state. Stakeholders run the
matrix during DELIVER UAT.

## Mandate 9 (Walking Skeleton Boundary Proof)

| Check | Status | Evidence |
|---|---|---|
| 9a -- Strategy declared in wave-decisions or distill | PASS | This file declares Strategy C explicitly; DISTILL wave-decisions.md cross-references. |
| 9b -- WS implementation matches strategy | PASS | Chromium WS uses real Playwright + real extension load. No `@in-memory` tag on any walking-skeleton scenario. |
| 9c -- Every driven adapter has a real-I/O integration test | PASS (with manual fallback) | See adapter coverage audit below. |
| 9d -- Walking skeleton fixture tier is real | PASS | Deleting `selectHost` breaks the WS; no in-memory shim is exercised. |
| 9e -- No `@in-memory` on `@walking_skeleton` scenarios | PASS | Grep verified: the WS file uses `@real-io` exclusively. |

## Mandate 6 -- Adapter coverage audit

| Adapter | Coverage type | Spec | Tag |
|---|---|---|---|
| `ChromiumOffscreenRecorderHost` | Real I/O via Playwright + Chromium | `tests/acceptance/firefox-recording-support/walking-skeleton.spec.ts` | `@walking_skeleton @real-io @chromium` |
| `FirefoxBackgroundRecorderHost` | Manual matrix in `outcome-kpis.md` (Firefox 121 ESR + stable) | `tests/acceptance/firefox-recording-support/firefox-host-smoke.spec.ts` (skipped markers) | `@firefox @manual-fallback` |
| `MediaAPIs.getUserMedia` (Chromium variant -- via tabCapture) | Real I/O via existing parent-feature `walking-skeleton.spec.ts` and the new feature WS | (existing) and the new spec | `@real-io @chromium` |
| `MediaAPIs.getUserMedia` (Firefox variant -- via getDisplayMedia) | Manual matrix | `firefox-host-smoke.spec.ts` AC-FF-01 | `@firefox @manual-fallback` |
| `chrome.downloads` (cross-platform) | Real I/O via the new Chromium WS scenario 2 (file appears on disk) | `walking-skeleton.spec.ts` | `@real-io @chromium` |
| `patch-firefox-manifest` + `strip-chrome-only-permissions` (build-time scripts) | Pure unit test against real script imports | `tests/unit/manifest-patch-firefox-permissions.test.ts` | (no tag; vitest unit) |

Every driven adapter has at least one real-I/O test or a documented manual-
smoke entry. The `FirefoxBackgroundRecorderHost` is the only adapter without
an automated real-I/O test; that gap is documented as the explicit cost of
the Firefox automation constraint and is filled by the manual matrix in
`outcome-kpis.md`.

## Risk acknowledged

The largest residual risk in the walking-skeleton design is that the manual
Firefox smoke is run only once per release. This is the same cadence as the
parent feature uses today and is acceptable per the caller's pre-answered
decision; it is also called out in DESIGN risk row "S-1 spike" -- the
software-crafter must validate the user-gesture chain on Firefox 121 ESR
before declaring US-FF-02 done, even though no automated test will catch a
regression.
