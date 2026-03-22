# Test Scenarios: browser-tab-recorder

## Test Strategy

**Framework**: Playwright with Chromium browser extension support
**Approach**: Structured Given-When-Then scenarios as Playwright test blocks
**Extension loading**: Playwright's `--load-extension` flag via `chromium.launchPersistentContext`

### Important Constraints

Browser extension E2E testing has inherent limitations:
- **Tab capture permission**: Playwright cannot easily auto-grant tab capture. Tests may need to use `--auto-select-tab-capture-source-by-title` Chrome flag or similar automation.
- **Offscreen document**: Cannot be directly inspected by Playwright. Tested indirectly via outcomes (file downloaded).
- **Service worker**: Can be inspected via `chrome://serviceworker-internals` but Playwright tests should verify behavior through user-visible outcomes.

## Milestone Map

| Milestone | Stories | Test File | Status |
|-----------|---------|-----------|--------|
| Walking Skeleton | US-01, US-02, US-03, US-04 | `walking-skeleton.spec.ts` | @active |
| Mp4 Output | US-05, US-06 | `milestone-2-mp4-output.spec.ts` | @skip |
| Polish | US-07, US-08, US-09 | `milestone-3-polish.spec.ts` | @skip |
| Cross-Browser | US-10 | `milestone-4-firefox.spec.ts` | @skip |

## Test Execution Order

Tests within each milestone are ordered by dependency. Each milestone unlocks the next. All tests in later milestones are tagged `@skip` until prior milestones pass.

## Test Fixtures

### Extension Fixture
- Builds extension via esbuild
- Launches Chromium with `--load-extension=<path>` and `--disable-extensions-except=<path>`
- Provides extension ID for popup URL access
- Provides download directory monitoring

### Test Page Fixture
- Serves a local HTML page with known visual content and audio
- Used as the tab to record during tests
