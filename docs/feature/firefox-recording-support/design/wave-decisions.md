# DESIGN Wave Decisions: firefox-recording-support

> Companion to `../discuss/wave-decisions.md`. DISCUSS captured the
> user-visible contract (DQ-1..DQ-4 left open). DESIGN closes those
> questions and records new decisions discovered during architecture work.
>
> Format: each `D{n}` is a single, immutable architectural decision. Where
> one supersedes a DISCUSS note or fixes a forwarded question, that is
> called out explicitly.

## DESIGN Decisions

| # | Decision | Drives which DISCUSS DQ | Rationale (short) | Source artifact |
|---|---|---|---|---|
| D1 | **Recording host on Firefox = the Firefox MV3 background event page** (Option C). | DQ-1 | Cleanest analogue to Chrome's offscreen document; QA-2 (5-minute survival) satisfied by active-MediaRecorder keep-alive; QA-5 best (reuses `createOffscreenMessageHandler` with a swapped `getUserMedia` adapter). Option A eliminated by QA-2; Option B retained as documented fallback if D7 spike fails. | `architecture-design.md` §6; `ADR-003-firefox-recording-host.md` |
| D2 | **Path selection = runtime feature-detect**, single source of truth. | DQ-2 | UA sniffing is fragile; build-time flag couples runtime to build pipeline. Capability probe extends naturally. | `architecture-design.md` §7 |
| D3 | **`CapabilityCheckResult` becomes a 3-variant discriminated union** with `path: 'chromium-offscreen' \| 'firefox-display-media'` for `supported: true`. | DQ-2 | Lets popup, hint, and SW agree on the same witness. | `data-models.md` §2 |
| D4 | **New ADR-003 for Firefox host strategy.** ADR-001 unchanged (still Accepted). | DQ-3 | Independent revisability of the Firefox decision. | `docs/adrs/ADR-003-firefox-recording-host.md` |
| D5 | **mp4-mux runs unchanged inside the Firefox background event page** (it has Blob/URL/DOM access). ADR-002 unchanged. | DQ-4 | DOM-bearing context; no transcoding required, only remuxing. | `architecture-design.md` §8; `technology-stack.md` §1 |
| D6 | **New platform abstraction: `RecorderHost` port** with two adapters (`ChromiumOffscreenRecorderHost`, `FirefoxBackgroundRecorderHost`). | -- | Composes over inheritance (FP); confines the target branch to a single factory. | `component-boundaries.md` §3 |
| D7 | **Spike obligation S-1 binds D1**: software-crafter MUST validate `getDisplayMedia`'s user-gesture chain from the Firefox MV3 background page on Firefox 121 ESR before declaring US-FF-02 done. If the call rejects, fall back to Option B (record-tab) per ADR-003 alternatives. | DQ-1 risk | The user-gesture binding is the only architectural assumption with non-trivial failure probability. | `architecture-design.md` §6.1, §14 |
| D8 | **Reuse `createOffscreenMessageHandler` on Firefox** by swapping only the `getUserMedia` member of the `MediaAPIs` adapter. No new pure-logic file. | -- | Maximizes shared code; honors the FP "data + functions" reuse model. | `component-boundaries.md` §4 |
| D9 | **`RecorderHost.start` returns `hadAudioTrack: boolean`** so the SW can satisfy US-FF-07's "Audio was not captured" note. | -- | Keeps the audio-presence fact at its source (the captured `MediaStream`) and avoids round-trips. | `data-models.md` §4.1 |
| D10 | **Picker cancellation modeled as `{ ok: false, cause: 'picker-cancelled' }`** rather than an error throw. | FR-FF-05 | Ensures the SW transitions silently back to idle without surfacing an error toast. | `data-models.md` §4.2 |
| D11 | **No new permissions in `src/manifest.json`.** `getDisplayMedia` requires none, `chrome.downloads` is already declared. | NFR-FF-01 | Hard guardrail in `outcome-kpis.md`. | `architecture-design.md` §6.2 |
| D12 | **`webextension-polyfill` is OPTIONAL**, decided during S-1 spike. If Firefox 121 ESR is promise-clean across `chrome.downloads`, `chrome.runtime`, `chrome.storage` -- omit the polyfill (saves ~6KB). Else add it (BSD-2-Clause, Mozilla-maintained). | -- | Smallest viable bundle; polyfill is a known-good escape hatch if needed. | `technology-stack.md` §3.1 |
| D13 | **No new outbound network requests; no telemetry SDK; no analytics.** | NFR-FF-03 | Hard guardrail. | `technology-stack.md` §3.2 |
| D14 | **Architecture-rule enforcement = `dependency-cruiser`** (MIT, JS/TS-native), with rules: (R1) `*-logic.ts` may not import `chrome`/`browser`/`navigator`; (R2) `*-logic.ts` may not import `*-host.ts`; (R3) `firefox-host.ts` may not import `chrome.offscreen`; (R4) Firefox build does not bundle `offscreen.ts`. | -- | Prevents target-specific code from leaking into pure logic. Recommendation forwarded to platform-architect. | `component-boundaries.md` §7; `architecture-design.md` §9 |
| D15 | **Popup remains a remote control, not a host, on either target.** Once `start-recording` is dispatched, the popup may close without affecting the recording. | QA-2 | Host survival is the host's responsibility, not the popup's. | `architecture-design.md` §4 notes |
| D16 | **One target branch only**, located in `background.ts`'s `selectHost` factory. Pure logic is target-blind. | QA-5 | Concentrates platform divergence at a single boundary. | `component-boundaries.md` §3.3 |
| D17 | **No C4-L3 component diagram produced** (system has fewer than 5 internal components). C4-L1 (System Context) and C4-L2 (Container) are the deliverables. | -- | C4 hygiene per architect skill: L3 only when warranted. | `architecture-design.md` §3, §4 |
| D18 | **`tabId` in `RecordingState.recording` becomes advisory** on Firefox. Concrete handling (sentinel `-1` vs `number \| null`) is software-crafter's call during GREEN -- both are non-breaking architecturally. | -- | DISCUSS does not require the recording state to expose a tab id; it was an artifact of Chrome's tabCapture origin. | `data-models.md` §5 |

## What this resolves from the DISCUSS forwarding list

Per `../discuss/wave-decisions.md` "Decision Forwarding":

1. ✓ This document closes DQ-1..DQ-4 with D1, D2, D3+D14, and D5 respectively.
2. ✓ ADR-003 created (D4); ADR-001 and ADR-002 not retracted.
3. ✓ No DISCUSS user-story acceptance criterion is violated by any chosen
   option, so no kick-back is required.

## Open items forwarded to DISTILL / DELIVER

- **S-1 (DELIVER spike via software-crafter):** validate the
  `getDisplayMedia` user-gesture chain on Firefox 121 ESR. Failure path
  documented in D7.
- **S-2 (DELIVER, low risk):** confirm active-MediaRecorder keeps the
  Firefox MV3 event page alive without an explicit heartbeat. If needed,
  add a no-op `setInterval` heartbeat in the host adapter (zero pure-logic
  impact).
- **DISTILL (acceptance-designer):** translate AC-FF-01..AC-FF-10 into
  executable Playwright + vitest tests. The data-model shapes in
  `data-models.md` are stable inputs.
- **DEVOPS (platform-architect):** integrate the `dependency-cruiser`
  rules from D14 into CI. No new contract tests are required (no external
  HTTP services).

## Risk register (carried over and refreshed)

| Risk | Status after DESIGN | Owner |
|---|---|---|
| Recording host dies mid-recording on Firefox | Mitigated by D1 + S-2; fallback path documented (Option B) | software-crafter |
| Capability probe drift | Mitigated by D2 + D3 (single source of truth) | software-crafter |
| New permission required on Firefox | Eliminated by D11 (none required) | -- |
| mp4-mux fails in chosen host context | Eliminated by D5 (DOM-bearing context); WebM fallback covers residual risk per ADR-002 | -- |
| Chrome path regression from refactor | Mitigated by D16 (single target branch) and AC-FF-06 explicit regression test | acceptance-designer (DISTILL) |
| Surface-picker UX confuses users | Mitigated by US-FF-04 hint copy (DISCUSS-owned) | DELIVER smoke tests |
| `getDisplayMedia` user-gesture rejection | New; tracked as S-1 spike in D7 | software-crafter |
