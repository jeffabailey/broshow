# DISTILL Wave Decisions: firefox-recording-support

> Wave: DISTILL
> Predecessor waves: DISCUSS, DESIGN
> Successor wave: DELIVER (software-crafter; functional paradigm per CLAUDE.md)
> Owner: acceptance-designer (Quinn)

## DISTILL Decisions

| # | Decision | Rationale | Source |
|---|---|---|---|
| D1 | Walking skeleton uses **Strategy C (Real local)** for the Chromium track | Caller pre-answered. Real Chromium via Playwright's `launchPersistentContext` already exists in `tests/acceptance/walking-skeleton.spec.ts`; reusing the same approach extends the existing infrastructure without duplication. | Caller pre-answered; `distill/walking-skeleton.md` §"Strategy declaration" |
| D2 | Firefox lane is **manual-fallback matrix**, not Playwright | Playwright cannot drive Firefox extensions reliably enough to assert on the `getDisplayMedia` user-gesture chain. The manual matrix in `discuss/outcome-kpis.md` is the explicit, documented Firefox test boundary. | `distill/walking-skeleton.md` §"Track 2"; `discuss/outcome-kpis.md` §"Measurement Plan" |
| D3 | **Two acceptance spec files** under `tests/acceptance/firefox-recording-support/`: `walking-skeleton.spec.ts` (@walking_skeleton @real-io @chromium) and `firefox-host-smoke.spec.ts` (@firefox @manual-fallback) | Visible separation of automated regression-guard vs. manual Firefox lane. CI test output shows the Firefox lane is intentionally manual, not silently absent. | (this file) |
| D4 | **Three new unit-level test files** under `tests/unit/`: `recorder-host-contract.test.ts`, `capability-check.test.ts`, `manifest-patch-firefox-permissions.test.ts` | Pin the new RecorderHost port shape, the 3-variant CapabilityCheckResult, and the Chromium-only permission stripping at the pure-logic boundary. Fast feedback for DELIVER inner loop. | `distill/test-scenarios.md` §"Spec-file purpose summary" |
| D5 | RED scaffolds for **`src/recorder-host.ts`**, **`src/recorder-host-chromium.ts`**, **`src/recorder-host-firefox.ts`**, **`scripts/strip-chrome-only-permissions.mjs`** | These are NEW files mandated by DESIGN's component-boundaries §3. The TS template (per skill) provides `__SCAFFOLD__` marker + `throw new Error('Not yet implemented -- RED scaffold')`. | DESIGN component-boundaries.md §3 |
| D6 | **No scaffolds** for `popup-logic.ts`, `background-logic.ts`, `popup.ts`, `background.ts`, or `patch-firefox-manifest.mjs` | These exist and have working behavior. They will be EXTENDED (not rewritten) by DELIVER. The `CapabilityCheckResult` widening goes into `popup-logic.ts` as a real edit. | Caller pre-answered |
| D7 | All new tests are **`test.skip` / `it.skip`** until DELIVER GREENs them | One-test-at-a-time TDD per Outside-In methodology. The pre-existing parent-feature suites stay green; the new feature tests start RED. | BDD methodology skill §"Outside-In Double-Loop TDD" |
| D8 | Walking-skeleton scenarios use **real local filesystem** for download verification | Strategy C requires real adapters. The user-observable outcome of this product IS a file in `~/Downloads` (or the configured DOWNLOAD_DIR). | Mandate 9d (litmus test) |
| D9 | **Reuse `tests/acceptance/fixtures/no-network.ts`** for AC-FF-09 | The zero-outbound-network KPI gate is already implemented and proven by the parent feature. Reusing it preserves the single source of truth. | `tests/acceptance/fixtures/no-network.ts` header comment |
| D10 | Manual matrix scenarios are **NOT removed in CI**; they appear as `test.skip` with `console.warn` | Visible markers in test output prevent the Firefox lane from being silently dropped. A future automation upgrade flips skip -> real assertion. | `firefox-host-smoke.spec.ts` header |
| D11 | DEVOPS `environments.yaml` is **missing**; defaults applied | Logged in `acceptance-review.md`. Browser-extension feature has one meaningful environment (clean profile) -- no environment matrix is honest here. Forwarded to platform-architect. | `acceptance-review.md` §"traceability_coverage" |
| D12 | **No new Gherkin `.feature` files** in DISTILL | Repo's existing convention is Playwright + vitest with descriptive `describe/it` strings, not pytest-bdd / cucumber. The DISCUSS-wave Gherkin (`journey-record-tab-firefox.feature`) is the canonical BDD source; DISTILL translates it into the executable equivalent. | `distill/test-scenarios.md` §"Why no Gherkin .feature files?" |
| D13 | **`@property` tag** applied to one scenario in `recorder-host-contract.test.ts` (RecorderHost shape invariant for any Target) | The "for any Target, selectHost returns a valid RecorderHost" claim is property-shaped. DELIVER crafter implements as property-based test if the harness supports it. | BDD methodology skill §"Property-shaped criteria" |

## Mandate compliance evidence (CM-A / CM-B / CM-C / CM-D)

### CM-A -- Driving port imports only

```
$ grep -rn "from '\.\./\.\./src/" tests/acceptance/firefox-recording-support/ tests/unit/recorder-host-contract.test.ts tests/unit/capability-check.test.ts tests/unit/manifest-patch-firefox-permissions.test.ts
```

Expected matches (driving ports only):

- `tests/acceptance/firefox-recording-support/walking-skeleton.spec.ts`: imports
  only test infrastructure (`fixtures/no-network`) and Playwright; never
  imports `src/`. The driving port is invoked indirectly via the loaded
  extension. PASS.
- `tests/acceptance/firefox-recording-support/firefox-host-smoke.spec.ts`:
  imports `@playwright/test` only; all driving ports are referenced via
  `console.warn` markers in skipped tests. PASS.
- `tests/unit/recorder-host-contract.test.ts`: imports
  `selectHost`, types `RecorderHost`, `HostStartInput`, `HostStartResult`,
  `HostStopResult`, `Target` -- ALL from `src/recorder-host.ts` (the new
  driving port factory). No internal-component imports. PASS.
- `tests/unit/capability-check.test.ts`: imports only `initializePopup`
  and `CapabilityCheckResult` from `src/popup-logic.ts` (THE popup driving
  port). No internal imports. PASS.
- `tests/unit/manifest-patch-firefox-permissions.test.ts`: imports
  `stripChromeOnlyPermissions`, `CHROME_ONLY_PERMISSIONS` from the new
  build script, and `patchManifestForFirefox` from the existing build
  script. Both are user-facing build entry points, NOT internal
  components. PASS.

### CM-B -- Business language; zero technical jargon in user-facing scenario titles

Grep for forbidden technical terms in `describe`/`it` strings:

- `database`, `API`, `HTTP`, `REST`, `JSON`: only allowed when describing
  the manifest file (a JSON file by definition; the scenario asserts user-
  observable manifest content, not a JSON parse). PASS.
- `status code`, `Redis`, `Kafka`, `Lambda`: zero matches.
- Domain terms (`mp4`, `webm`, `tabCapture`, `offscreen`, `getDisplayMedia`,
  `manifest`, `permissions`): present and correct -- these are part of the
  ubiquitous language of a browser-extension product. PASS per Dim 3.

### CM-C -- User-journey completeness

Every scenario in the acceptance specs has the four-part structure:

1. User trigger (Given a Sam-on-Chrome OR Maria-on-Firefox actor)
2. Single business event (When clicks Start, OR opens popup, OR
   inspects manifest)
3. Observable outcome (Then file in Downloads, OR Start button visible,
   OR hint absent, OR network panel empty, OR permissions list specific)
4. Business value implicit in the outcome (a recording, a trustworthy UI,
   a privacy-respecting product)

PASS for all 30 scenarios.

### CM-D -- Pure-function extraction inventory

| Pure function | Where extracted | Test coverage |
|---|---|---|
| `formatRecordingFilename(date, ext)` | existing (`background-logic.ts`) | `tests/unit/background.test.ts` (existing); reused on Firefox per design |
| `shouldShowFirefoxHint(capability)` | NEW in `popup-logic.ts` (DELIVER edit) | covered indirectly by `capability-check.test.ts`; software-crafter adds direct unit test in DELIVER |
| `stripChromeOnlyPermissions(manifest)` | NEW in `scripts/strip-chrome-only-permissions.mjs` | `tests/unit/manifest-patch-firefox-permissions.test.ts` |
| `patchManifestForFirefox(manifest)` | existing | (existing test; not in this feature's scope) |
| `selectHost(target)` | NEW in `src/recorder-host.ts` | `tests/unit/recorder-host-contract.test.ts` |
| `messageForAction(action, capability)` | existing in `popup-logic.ts`; widening in DELIVER for `path` field | covered by `capability-check.test.ts` indirectly + existing `popup.test.ts` |

Impure code (real chrome APIs, real getDisplayMedia, real filesystem) is
exercised exclusively at the WS layer through real adapters. No fixture
parametrization at the test level beyond the clean-profile setup that the
existing infrastructure provides. PASS.

## Open items handed forward to DELIVER

1. **S-1 spike** (carried from DESIGN): software-crafter validates the
   `getDisplayMedia` user-gesture chain on Firefox 121 ESR. If it rejects,
   ADR-003 alternatives kick in.
2. **S-2 spike** (carried from DESIGN): confirm active MediaRecorder keeps
   the Firefox MV3 event page alive. If it doesn't, add the documented
   no-op heartbeat.
3. **`shouldShowFirefoxHint` direct unit test**: add in DELIVER alongside
   the implementation.
4. **Wire the new `path` field** in `messageForAction`: per data-models.md
   §3.2, software-crafter widens the function signature and the existing
   `popup.test.ts` mocks. The `capability-check.test.ts` scenarios already
   pin the user-observable behavior; the unit test for the wire-format
   variant is software-crafter's call.
5. **Firefox `recorder-host-firefox.ts`**: implement the factory. S-1 must
   pass first.
6. **`stripChromeOnlyPermissions`** integration into
   `patch-firefox-manifest.mjs`: software-crafter chooses whether to compose
   the two scripts or merge them. The contract test pins both options.
7. **US-FF-07 popup copy scenario**: add in DELIVER Release 2 once the
   "Audio was not captured" UI lands.
8. **Optional**: feature-specific `environments.yaml` if platform-architect
   determines one is needed (single env: `clean-profile`).

## What this resolves from DESIGN forwarding

Per `../design/wave-decisions.md` §"Open items forwarded to DISTILL /
DELIVER":

1. ✓ AC-FF-01..AC-FF-10 translated into executable Playwright + vitest tests.
   (10 ACs -> 30 scenarios across 5 files; see `distill/test-scenarios.md`
   AC traceability table.)
2. (forward to DELIVER) S-1 and S-2 spikes -- not actionable in DISTILL.
3. (forward to platform-architect) dependency-cruiser rule integration.

## Risk register (refresh)

| Risk | Status after DISTILL | Owner |
|---|---|---|
| Chrome path regression from refactor | Mitigated by `walking-skeleton.spec.ts` AC-FF-06 + AC-FF-08 + AC-FF-09 scenarios | acceptance-designer (DISTILL) |
| Firefox automation gap | Documented as `@manual-fallback` with explicit pointers to `outcome-kpis.md`. Visible in CI test output. | acceptance-designer (DISTILL) |
| `getDisplayMedia` user-gesture rejection | S-1 spike still pending in DELIVER; no automated test will catch it; must be checked manually before declaring US-FF-02 done. | software-crafter (DELIVER) |
| RED scaffold accidentally GREENed | Each scaffold throws "Not yet implemented -- RED scaffold" with explicit phrasing. Tests must fail with this exact text or the scaffold is being smuggled past TDD. | software-crafter (DELIVER) |
| Future addition of a 4th CapabilityCheckResult variant | Pinned by `capability-check.test.ts` "exhaustiveness" scenario (24). | acceptance-designer |

## Handoff checklist

- [x] All 30 scenarios written
- [x] All marked `test.skip`/`it.skip` (one-at-a-time TDD)
- [x] Walking skeleton strategy declared (Strategy C)
- [x] Adapter coverage audit complete (Mandate 6)
- [x] RED scaffolds present with `__SCAFFOLD__` markers (Mandate 7)
- [x] AC traceability table populated (`distill/test-scenarios.md`)
- [x] US traceability table populated
- [x] Error-path ratio 47% (above 40% threshold)
- [x] Self-review complete (`distill/acceptance-review.md`)
- [x] Mandate compliance evidence (CM-A/B/C/D) recorded
- [x] No production code beyond RED scaffolds (Chrome path untouched)
- [x] No `@in-memory` tag on any `@walking_skeleton` scenario (Strategy C compliance)

DELIVER may proceed.
