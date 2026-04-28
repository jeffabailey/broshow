# Test Scenarios: browser-tab-recorder

## Test Strategy

**Framework**: Playwright with Chromium browser extension support
**Approach**: Structured Given-When-Then scenarios as Playwright `test.describe` / `test()` blocks. Given/When/Then captured as inline comments. (This codebase uses `.spec.ts`, not `.feature` files — the BDD methodology mandates business language and GWT structure, not a specific file format.)
**Extension loading**: Playwright's `--load-extension` flag via `chromium.launchPersistentContext`
**WS Strategy**: C — Real local (see `distill/wave-decisions.md` §1)

### Important Constraints

Browser extension E2E testing has inherent limitations:
- **Tab capture permission**: Playwright cannot easily auto-grant tab capture. Tests use the `--auto-select-tab-capture-source-by-title` Chrome flag.
- **Offscreen document**: Cannot be directly inspected by Playwright. Tested indirectly via outcomes (file downloaded, badge visible).
- **Service worker**: Can be inspected via `context.serviceWorkers()` but tests verify behavior through user-visible outcomes wherever possible.
- **MV3 SW eviction**: Aggressive in production; pre-seeding `chrome.storage.local` is the test-time approximation (see `stale-state-recovery.spec.ts`).

## Browser Matrix in CI

Sourced from `devops/environments.yaml` `browsers:` block.

| Browser | CI Depth | Playwright runtime tests? | Rationale |
|---------|----------|---------------------------|-----------|
| Chrome (>=116) | Full (build + typecheck + unit + acceptance/Playwright) | YES | Primary target. Chrome Web Store is the primary distribution channel. |
| Edge (>=116) | Full (with `channel: msedge`); fallback to build+unit if Linux runners prove awkward (DEVOPS D12) | YES (or fallback) | Chromium-equivalent APIs. |
| Firefox (>=115 ESR) | Build + typecheck + unit ONLY | **NO** | Firefox does not implement `chrome.offscreen`. Runtime support deferred to a future architectural change feature. The CI Firefox leg's purpose is **early API-drift detection**, not runtime validation. (DEVOPS D6, UC-3.) |

**DISTILL acceptance tests do NOT execute on Firefox.** The `milestone-4-firefox.spec.ts` file is removed from the milestone map (see Reconciliation R4 in `distill/wave-decisions.md`). When and if a future feature delivers a Firefox-compatible architecture, that feature's DISTILL wave will produce its own acceptance tests.

## Milestone Map

| Milestone | Stories / Install States | Test File | Status |
|-----------|--------------------------|-----------|--------|
| 1. Walking Skeleton | US-01, US-02, US-03, US-04 | `walking-skeleton.spec.ts` | @active |
| 2. Mp4 Output | US-05, US-06 | `milestone-2-mp4-output.spec.ts` | @skip |
| 3. Polish | US-07, US-08, US-09 | `milestone-3-polish.spec.ts` | @skip |
| 4. Upgrade Robustness | install_states.upgrade_from_prior_version (DP-4) | `upgrade.spec.ts` | @skip |
| 5. Stale State Recovery | install_states.with_prior_recording_state (DP-5) | `stale-state-recovery.spec.ts` | @skip |

> Cross-Browser (Firefox) is NOT a milestone in this DISTILL. It is deferred indefinitely as a separate feature requiring an alternative architecture. See `devops/environments.yaml` `browsers.firefox.deferred_blocker` and `distill/wave-decisions.md` R4.

## Test Execution Order

Tests within each milestone are ordered by dependency. Each milestone unlocks the next. All tests in later milestones are tagged `@skip` (via `test.skip(...)`) until prior milestones pass. Within a milestone, only one test is enabled at a time per Outside-In TDD discipline.

## Test Fixtures

### `tests/acceptance/fixtures/no-network.ts` (NEW — DP-6)

Pure test infrastructure that asserts the zero-network KPI on every acceptance spec.

- `attachNetworkRecorder(context)` — wires `page.on('request')` listeners to every page in the context (existing and future).
- `assertZeroExternalNetwork(context)` — fails the test if any captured request URL has scheme `http:` or `https:`. Allowed schemes: `chrome-extension:`, `blob:`, `data:`, `about:`, `file:`, `chrome:`, `devtools:`.
- `resetNetworkRecorder(context)` — clears the bucket without removing listeners (use between tests if reusing a context).

**Usage contract**: every acceptance spec MUST call `attachNetworkRecorder(context)` once during setup and `assertZeroExternalNetwork(context)` in `afterEach` or after each user-flow assertion.

> **CI hard gate**: this fixture is the runtime arm of `kpi-instrumentation.md` "Network requests made = 0 — HARD GATE". Failure blocks merge.

### Extension Fixture (existing pattern)

- Builds extension via `npm run build` (`esbuild`) before the suite (or relies on `dist/` being prebuilt — current specs guard with `ensureDistBuilt()`).
- Launches Chromium with `--load-extension=<dist>` and `--disable-extensions-except=<dist>` via `chromium.launchPersistentContext`.
- Provides extension ID via `context.serviceWorkers()[0].url()`.
- Provides per-test temp download directory via CDP `Browser.setDownloadBehavior`.

### Test Page Fixtures (existing)

- `tests/fixtures/test-page.html` — visual content fixture for video-only recording tests.
- `tests/fixtures/test-page-audio.html` — content fixture with audio for `milestone-3-polish` audio-capture scenarios.

### Storage Seed Helper (NEW — used by upgrade.spec.ts and stale-state-recovery.spec.ts)

`seedPriorStorage(profileDir, payload)` is currently inlined in both new specs. If/when a third spec needs it, lift to `tests/acceptance/steps/storage-seed.ts`. (Decision deferred to DELIVER per YAGNI.)

## Coverage of `environments.yaml` install states

| Install state (environments.yaml) | Covered by | Status |
|-----------------------------------|------------|--------|
| `clean_install` | `walking-skeleton.spec.ts` (clean profile, fresh start) and `stale-state-recovery.spec.ts` ("clean profile, no prior RecordingState") | YES |
| `upgrade_from_prior_version` | `upgrade.spec.ts` (3 scenarios: valid prior, forward-compat, incompat-migration) | YES (NEW) |
| `with_prior_recording_state` | `stale-state-recovery.spec.ts` (3 scenarios: stale recording, stale processing, clean baseline) | YES (NEW) |

## Coverage of `environments.yaml` coexistence_matrix

| Coexistence case | Covered by | Status |
|------------------|------------|--------|
| `other_tab_recorder` (Loom, etc. — exclusive tabCapture) | Manual release-checklist (per `environments.yaml`) | NOT automated — accepted as low-severity |
| `ad_blocker` | n/a — BroShow loads no remote content | n/a |
| `privacy_extension` | All acceptance specs via `no-network.ts` fixture (BroShow has zero outbound network, so privacy extensions have nothing to interfere with) | YES |
