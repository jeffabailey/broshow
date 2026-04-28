# DISTILL Wave Decisions: browser-tab-recorder

> **Wave**: DISTILL (RETROFIT)
> **Reconciles**: DEVOPS wave outputs (`environments.yaml`, `wave-decisions.md` D1..D21, `upstream-changes.md` UC-1..UC-3) and the now-authoritative 3-permission DESIGN.
> **Does NOT overwrite**: existing DISTILL artifacts. Extends and reconciles them. Where existing assertions contradict the DEVOPS-driven authoritative state, the assertions are corrected here and in the underlying file.

---

## 1. Walking Skeleton Strategy

### Strategy: C — Real local

Pre-decided based on existing test patterns. The existing `tests/acceptance/walking-skeleton.spec.ts` already launches a real Chromium with `--load-extension`, real `MediaRecorder`, real `chrome.tabCapture` (via `--auto-select-tab-capture-source-by-title`), and real `chrome.downloads`. This is unambiguously Strategy C and there is no reason to change it.

| Resource | Treatment | Rationale |
|----------|-----------|-----------|
| Chrome browser | **Real** (Playwright `chromium.launchPersistentContext`) | Strategy C requires the actual runtime |
| Extension load | **Real** (`--load-extension=<path>`) | Only way to exercise MV3 + offscreen wiring |
| `chrome.tabCapture.getMediaStreamId` | **Real** (with `--auto-select-tab-capture-source-by-title`) | The whole feature; no point mocking |
| `MediaRecorder` | **Real** | Same |
| `chrome.storage.local` | **Real** (per-test profile, wiped between tests) | Required for `RecordingState` persistence and the new upgrade/stale-state specs |
| `chrome.downloads` | **Real** (per-test temp dir via CDP `Browser.setDownloadBehavior`) | Validates the user-observable outcome (file appears) |
| `mp4-muxer` | **Real** | Validated via ftyp signature in milestone-2 spec |
| Network | **Asserted absent** via `tests/acceptance/fixtures/no-network.ts` (NEW) | Per DEVOPS D10 / KPI Trust Outcomes — zero outbound network is a hard CI gate, NOT mocked-out |

### Container preference: NONE

Browser-extension testing on Linux CI runners works with a real Chromium binary (Playwright provides one). No Docker, no Kubernetes, no containerization. DEVOPS D13 confirms this scope.

### Tagging convention

| Tag | Meaning | Where |
|-----|---------|-------|
| `@walking_skeleton` | Demo-able, end-to-end, user value journey | `walking-skeleton.spec.ts` describe-block tag (in test name prefix or `test.describe.configure({ tag: '@walking_skeleton' })`) |
| `@real-io` | Touches a real adapter (chrome.* API or real subprocess) | All acceptance specs in this codebase qualify; tagged on every `test.describe` block |
| `@skip` | Not yet enabled; one-at-a-time activation | Use `test.skip(...)` per Playwright convention |
| `@infrastructure-failure` | (reserved) failure-injection scenarios when added | Not present yet; for future error-path scenarios |

Tags appear as **prefix-comments** on `test.describe` blocks (Playwright TS pattern) and the description string itself, e.g.:

```typescript
// @walking_skeleton @real-io
test.describe('Walking Skeleton: Recording Pipeline', () => { /* ... */ });
```

---

## 2. Reconciliation log (DEVOPS → DISTILL)

Each row is a real change driven by a specific DEVOPS artifact. Each is an alignment, not a contradiction (DEVOPS already loop-backed-to-DESIGN to resolve the contradictions during its own wave).

| # | Source (DEVOPS) | Pre-retrofit DISTILL state | Post-retrofit DISTILL state | File touched |
|---|-----------------|----------------------------|------------------------------|--------------|
| R1 | `technology-stack.md` Permissions section (now authoritative: 4) and DEVOPS UC-1/UC-2 | `walking-skeleton.md`: "MV3, tabCapture + offscreen permissions" (2) | "MV3, with permissions `tabCapture`, `offscreen`, `storage`, `downloads` (authoritative 4-of-4 against KPI cap of <= 4 — cap raised from 3 to 4 on 2026-04-27 per `devops/upstream-changes.md` UC-1)" | `distill/walking-skeleton.md` |
| R2 | `environments.yaml` `browsers.firefox.ci_depth: build_unit` + DEVOPS D6, UC-3 | `acceptance-review.md`: "US-10 Firefox deferred — requires separate Playwright config" | "US-10 Firefox: deferred to future feature; out of DISTILL scope. Requires alternative architecture (background page hosting MediaRecorder). CI runs build+typecheck+unit only on Firefox; **no Playwright runtime tests**." | `distill/acceptance-review.md` |
| R3 | `kpi-instrumentation.md` "Network requests made = 0" → HARD GATE | `acceptance-review.md`: "AC-06 (no network) — Best verified via code review + CSP — Manual" | "AC-06 (no network) — **CI HARD GATE** via `tests/acceptance/fixtures/no-network.ts` and `page.on('request')` assertion in every acceptance test. Failure blocks merge." | `distill/acceptance-review.md` |
| R4 | `environments.yaml` `browsers.firefox.runtime_supported: false` + DEVOPS D6 | `test-scenarios.md` Milestone Map row: `milestone-4-firefox.spec.ts` `@skip` | Row REMOVED. Firefox runtime is deferred indefinitely as a separate feature; DISTILL acceptance tests do not target Firefox. | `distill/test-scenarios.md` |
| R5 | `environments.yaml` `install_states.upgrade_from_prior_version` + DEVOPS DP-4 | No coverage | New spec: `tests/acceptance/upgrade.spec.ts` (Milestone 4 — Upgrade Robustness). Listed in milestone map. | `tests/acceptance/upgrade.spec.ts`, `distill/test-scenarios.md`, `distill/acceptance-review.md` |
| R6 | `environments.yaml` `install_states.with_prior_recording_state` + DEVOPS DP-5 | No coverage | New spec: `tests/acceptance/stale-state-recovery.spec.ts` (Milestone 5 — Stale State Recovery). Listed in milestone map. | `tests/acceptance/stale-state-recovery.spec.ts`, `distill/test-scenarios.md`, `distill/acceptance-review.md` |
| R7 | DEVOPS DP-6 + `kpi-instrumentation.md` Network KPI | No fixture for the network-zero invariant | New fixture: `tests/acceptance/fixtures/no-network.ts` documented as test-infrastructure (no `__SCAFFOLD__` marker — it depends on no production module) | `tests/acceptance/fixtures/no-network.ts`, `distill/test-scenarios.md` |
| R8 | `environments.yaml` `coexistence_matrix.privacy_extension.test_coverage: tests/acceptance/* (network-request assertion)` | Implicit | Documented in `acceptance-review.md` as covered via the no-network fixture (since BroShow makes zero network requests, privacy extensions have nothing to interfere with) | `distill/acceptance-review.md` |
| R9 | `environments.yaml` `browsers.{chrome,edge}.ci_depth: full` + D12 fallback | Implicit | New "Browser Matrix in CI" subsection added to `test-scenarios.md` documenting which browsers run Playwright | `distill/test-scenarios.md` |

### True contradictions found?

**None.** The four pre-retrofit alignments listed in the orchestrator brief (permissions count, Firefox stance, AC-06 enforcement, milestone-4 removal) are all clarifications of an already-acknowledged shape (e.g., the design-tech-stack already mentioned `storage` was load-bearing; the milestone map already had Firefox `@skip`). DEVOPS converted these from "implicit" / "best-effort" / "stretch goal" into explicit, mechanically-enforced policy, and DISTILL is now reconciled to that policy. **No `upstream-issues.md` is required.**

---

## 3. Adapter coverage audit (Mandate 6)

For a browser extension, "adapters" are the chrome.* API integrations and external library boundaries (the equivalents of driven adapters in a hexagonal architecture). Per Mandate 6, every adapter must have at least one `@real-io` integration scenario.

| # | Adapter | `@real-io` coverage | Covered by | Notes |
|---|---------|---------------------|------------|-------|
| 1 | `chrome.tabCapture.getMediaStreamId` | YES | `walking-skeleton.spec.ts` ("clicking Start Recording transitions to recording state", "full pipeline ...") | Real Chromium + `--auto-select-tab-capture-source-by-title` flag |
| 2 | `chrome.offscreen` (createDocument / closeDocument) | YES | `walking-skeleton.spec.ts` ("full pipeline ..."), implicit in any recording flow | Real offscreen-document load |
| 3 | `MediaRecorder` (offscreen-context) | YES | `walking-skeleton.spec.ts` ("full pipeline ...") | Real recording → real WebM blob |
| 4 | `mp4-muxer` library | YES | `milestone-2-mp4-output.spec.ts` ("file is mp4 with ftyp signature") | Real WebM → real mp4 muxing |
| 5 | `chrome.downloads.download` | YES | `walking-skeleton.spec.ts` ("full pipeline ..."), `milestone-3-polish.spec.ts` (filename format) | Real download to per-test temp dir |
| 6 | `chrome.storage.local` (RecordingState persistence + recordingData transfer) | YES (NEW) | `tests/acceptance/upgrade.spec.ts` (NEW), `tests/acceptance/stale-state-recovery.spec.ts` (NEW); also touched implicitly by walking-skeleton via `recordingData` blob handoff | Per-test profile; `seedPriorStorage` helper is currently **inlined** in both new specs (lines 71–85). Candidate for extraction to `tests/acceptance/steps/storage-seed.ts` in DELIVER if a third consumer appears (YAGNI applied). |
| 7 | `chrome.runtime` messaging (popup ↔ SW ↔ offscreen) | YES | `walking-skeleton.spec.ts` (whole pipeline traverses messaging) | Real `chrome.runtime.sendMessage`; failure modes covered indirectly via offscreen-error path |
| 8 | `chrome.action` (badge / icon indicator) | YES | `milestone-3-polish.spec.ts` ("recording indicator", "indicator removed") | Real `chrome.action.getBadgeText` via service worker `evaluate` |
| 9 | `chrome.runtime.onInstalled` (install/upgrade lifecycle hook) | YES (NEW) | `tests/acceptance/upgrade.spec.ts` (NEW) — exercises one-time migration on `reason === 'update'` | Required for DP-4 |
| 10 | `network` (the negative invariant: zero outbound) | YES — asserted **absent** via fixture | `tests/acceptance/fixtures/no-network.ts` (NEW), wired into every spec | This is the inverse of typical adapter coverage: we prove the adapter does NOT exist at runtime |

### Audit result

**No MISSING rows.** Items 6 and 9 were the gaps; both are now covered by the two new specs (`upgrade.spec.ts`, `stale-state-recovery.spec.ts`). Item 10 is covered by the new fixture and is wired into every spec.

---

## 4. Mandate 7 — RED scaffold strategy (TypeScript pattern)

### Pattern

When DISTILL adds a scenario whose import target does not exist in production yet, scaffold the production module with this pattern:

```typescript
// src/<module>.ts — RED scaffold (DISTILL)
export const __SCAFFOLD__ = true;

export function <fnName>(): never {
  throw new Error('Not yet implemented -- RED scaffold');
}
```

- Use `Error`, not `NotImplementedError` or a sentinel — the Playwright reporter classifies `Error` as a normal RED.
- Use `throw new Error('...')`, not a return value, so the test fails on first call (assertion-shaped failure when the test asserts "the migration ran").
- Mark with `export const __SCAFFOLD__ = true;` so DELIVER can grep for `__SCAFFOLD__` to enumerate remaining scaffolds.

### What this RETROFIT actually scaffolded

After auditing the production tree (`src/background.ts`, `src/background-logic.ts`, `src/types.ts`, `src/offscreen.ts`, `src/offscreen-logic.ts`, `src/popup.ts`, `src/popup-logic.ts`, `src/mp4.ts`), **the new specs do NOT require any new production modules.**

| New spec | Production code it exercises | Already exists? | Scaffolding action |
|----------|------------------------------|-----------------|--------------------|
| `tests/acceptance/upgrade.spec.ts` | `src/background.ts` (service worker boot), `src/background-logic.ts` `createInitialState`, `chrome.storage.local` reads | YES — current cold-start logic already discards stale state (`createMessageHandler` initializes with `createInitialState()` regardless of stored state) | None. The scenarios test EXISTING boot behavior + verify graceful handling of unknown fields. May reveal a real gap (one-time migration on `onInstalled.reason === 'update'`), in which case DELIVER adds it. The test starts as RED-on-assertion, not RED-on-import. |
| `tests/acceptance/stale-state-recovery.spec.ts` | Same as above (cold-start path) | YES | None. The current code already resets to idle on cold start because the SW `let state = createInitialState()` ignores stored `RecordingState`. The spec asserts this observable behavior. |
| `tests/acceptance/fixtures/no-network.ts` | None — pure test infrastructure | n/a | None. Implemented inline as functional code (no production dependency). |

### Decision: no scaffolds were created in this retrofit.

Rationale: **most of the production code already exists**, and the new scenarios test EXISTING behavior in a way that has not been previously asserted. This is the correct DISTILL outcome — Mandate 7 only requires scaffolds for genuinely-new modules, not for new test angles on existing modules.

If during DELIVER the upgrade scenarios reveal that `src/background.ts` does not actually run a one-time migration on `chrome.runtime.onInstalled.reason === 'update'` (and the AC requires it), DELIVER will add a small `runMigrationIfNeeded(prior: unknown): RecordingState` pure function in `src/background-logic.ts` and call it from `src/background.ts`. That is a DELIVER decision, not a DISTILL one.

---

## 5. Decisions made for new install-state scenarios (DP-4, DP-5)

### DP-4 — Upgrade robustness

| Question | Decision | Rationale |
|----------|----------|-----------|
| What "prior version" state shapes do we test against? | (a) Valid `RecordingState{status:'idle'}` + valid `LastRecording`; (b) Object with unknown extra fields (forward-compat); (c) Object with explicitly-incompatible status (`'archived'` — fictional) | These three cover: prior-shape-still-valid, forward-compat (additive), and explicit-migration (subtractive) |
| How is the upgrade simulated in Playwright? | Step 1: launch context, set storage to old shape; Step 2: close context; Step 3: relaunch with the new extension build (same persistent profile); Step 4: assert observable state | Approximates real upgrade: `chrome.storage.local` survives extension reload; runtime `let` state does not |
| Where does the storage seeding live? | `tests/acceptance/steps/storage-seed.ts` (NEW helper, test code only) | Co-locates seeding helpers; reuse across upgrade + stale-state specs |
| What is the observable "did not crash" assertion? | Popup loads, shows "Ready to record" status, Start button is enabled and clickable. Negative assertion: no `pageerror` fires during boot. | User-observable, no internal-state poking |

### DP-5 — Stale-state recovery

| Question | Decision | Rationale |
|----------|----------|-----------|
| How do we simulate "SW evicted mid-recording"? | Pre-seed `chrome.storage.local` with `{recordingState: {status:'recording', tabId: 999, startTime: <past>}}` before launching the context. The SW boots, sees no in-memory state, and (per current code) resets to idle. | The actual SW eviction is hard to force in Playwright; pre-seeded stale state is observationally equivalent for the user journey we care about |
| What is the user-observable outcome? | Popup shows "Ready to record"; Start button is enabled; clicking Start initiates a fresh recording successfully | This is the user goal: "after a crash, can I record again without uninstalling?" |
| What is the negative regression test? | Clean profile (no storage seed) → cold start → idle → Start works | Confirms the test apparatus itself is not the cause of any pass |

---

## 6. Open questions (none blocking; for DELIVER)

- Whether to extract a tiny pure helper `runMigrationIfNeeded(prior: unknown): RecordingState` if `upgrade.spec.ts` reveals a real gap (see §4). Recommendation: yes, in DELIVER, only if needed.
- Whether `no-network.ts` fixture should be enforced via Playwright `globalSetup` (every test inherits) or imported per-spec (explicit). Recommendation: per-spec import + `afterEach` assertion, for transparency. DELIVER decides.
- Whether the `--auto-select-tab-capture-source-by-title` flag will continue to work on Edge runners (DEVOPS D12 fallback path). If not, Edge drops to build+unit only. No DISTILL action.

---

## 7. Cross-references

- `docs/feature/browser-tab-recorder/devops/wave-decisions.md` (D1..D21, DP-1..DP-15)
- `docs/feature/browser-tab-recorder/devops/environments.yaml` (browsers, install_states, coexistence_matrix)
- `docs/feature/browser-tab-recorder/devops/upstream-changes.md` (UC-1, UC-2, UC-3)
- `docs/feature/browser-tab-recorder/design/technology-stack.md` (Permissions section — authoritative 4-of-4)
- `docs/feature/browser-tab-recorder/distill/walking-skeleton.md` (updated R1)
- `docs/feature/browser-tab-recorder/distill/test-scenarios.md` (updated R4, R5, R6, R7, R9)
- `docs/feature/browser-tab-recorder/distill/acceptance-review.md` (updated R2, R3, R5, R6, R8)
