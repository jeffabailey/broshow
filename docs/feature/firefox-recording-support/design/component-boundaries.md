# Component Boundaries: firefox-recording-support

> Wave: DESIGN
> Sibling: `architecture-design.md`, `data-models.md`
> Paradigm: Functional. Adapters are factory functions; no class hierarchy.

## 1. Purpose

This document names the new platform abstraction (`RecorderHost`), declares
how the new Firefox adapter slots into the existing pure-core / effect-shell
layout, and defines the rules that keep target-specific code out of the
shared logic.

## 2. Module map (post-feature)

```text
src/
  popup.html
  popup.ts                      // adapter -- DOM + chrome
  popup-logic.ts                // PURE -- describeUI, capability typing
  background.ts                 // adapter -- selects RecorderHost by Target
  background-logic.ts           // PURE -- state machine, badge, filename
  offscreen.html                // Chromium-only; Firefox build never loads it
  offscreen.ts                  // adapter -- chromium MediaAPIs
  offscreen-logic.ts            // PURE -- createOffscreenMessageHandler (REUSED on Firefox)
  mp4.ts                        // (existing) recorder factory used by both targets

  # NEW (Firefox path)
  firefox-host.ts               // adapter -- firefox MediaAPIs, runs in MV3 event page
  # No new pure-logic file. The Firefox adapter composes existing pure handlers.

  manifest.json                 // unchanged at source; patcher emits the Firefox variant
  types.ts                      // discriminated unions for messages, RecordingState, Target

scripts/
  patch-firefox-manifest.mjs    // unchanged
```

Notes:

- `firefox-host.ts` is the **only** new top-level module. Naming is
  illustrative; software-crafter may choose `firefox-recorder-host.ts` or
  `recorder-host-firefox.ts` -- the boundary, not the name, is what this
  document binds.
- Nothing under `*-logic.ts` is added or split. The functional core is
  reused untouched by introducing a different MediaAPIs adapter on Firefox.

## 3. The `RecorderHost` port

### 3.1 Shape (functional, not OO)

```text
type Target = 'chromium' | 'firefox';

type RecorderHost = {
  start: (input: HostInput) => Promise<HostStartResult>;
  stop:  () => Promise<HostStopResult>;
};

type HostInput =
  | { target: 'chromium'; streamId: string }
  | { target: 'firefox' };   // host invokes getDisplayMedia itself

type HostStartResult =
  | { ok: true; hadAudioTrack: boolean }
  | { ok: false; cause: 'picker-cancelled' };
  // Other failures throw — caught by SW and surfaced as 'error' messages,
  // matching the existing offscreen-error contract on Chrome.

type HostStopResult =
  | { ok: true; format: 'mp4' | 'webm'; dataUrl: string }
  | { ok: false; cause: 'mux-error'; fallbackDataUrl?: string };
```

`hadAudioTrack` is added to satisfy US-FF-07 (audio-absent note). It is
always `true` on Chromium (tabCapture currently always includes audio).

### 3.2 Adapter inventory

| Adapter | File | Target | Notes |
|---|---|---|---|
| `ChromiumOffscreenRecorderHost` | `background.ts` (factory) + `offscreen.ts` (resident behavior) | `chromium` | Wraps `chrome.offscreen.createDocument` and the existing `MediaAPIs` adapter in `offscreen.ts`. Refactor only -- no behavior change. |
| `FirefoxBackgroundRecorderHost` | `firefox-host.ts` | `firefox` | Hosts MediaRecorder + mp4-mux directly inside the MV3 background event page. Reuses `createOffscreenMessageHandler` with a Firefox-flavored `MediaAPIs`. |

### 3.3 Adapter selection (the only branch)

`background.ts` resolves `Target` once at startup from the capability probe
that the popup forwards on its first message:

```text
selectHost :: Target -> RecorderHost
selectHost = match
  | 'chromium' -> chromiumOffscreenRecorderHost(chromeAPIs)
  | 'firefox'  -> firefoxBackgroundRecorderHost(firefoxAPIs)
```

There is exactly **one** `if (target === 'firefox')` style branch in the
codebase, and it lives in this single factory. Pure logic never branches on
target; it consumes a `RecorderHost` and is target-blind.

## 4. Reuse of the existing offscreen-logic on Firefox

`createOffscreenMessageHandler` in `src/offscreen-logic.ts` already accepts
a `MediaAPIs` port:

```text
MediaAPIs = {
  getUserMedia:    (constraints) => Promise<MediaStream>,
  storeRecording:  (blob)        => Promise<boolean>,
  blobToDataUrl:   (blob)        => Promise<string>,
  sendMessage:     (msg)         => void,
}
```

Firefox adapter swaps **only `getUserMedia`**:

```text
// firefox-host.ts -- adapter (effects)
const firefoxMediaAPIs: MediaAPIs = {
  getUserMedia: async (_ignoredConstraints) =>
    navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }),
  storeRecording: chromiumStoreRecording,   // identical
  blobToDataUrl:  chromiumBlobToDataUrl,    // identical
  sendMessage:    runtimeSendMessage,       // identical
};
```

The MediaRecorder + mp4-mux + WebM-fallback pipeline that lives inside
`createOffscreenMessageHandler` is reused **byte-for-byte**. ADR-002 holds.

## 5. Popup contract changes

The popup remains a pure-core + effect-shell module. Behavioral additions:

### 5.1 Capability probe (effect)

```text
checkRecordingCapability :: () -> CapabilityCheckResult

CapabilityCheckResult =
  | { supported: true,  path: 'chromium-offscreen' }
  | { supported: true,  path: 'firefox-display-media' }
  | { supported: false, reason: string }
```

### 5.2 Hint visibility (pure)

```text
shouldShowFirefoxHint :: CapabilityCheckResult -> boolean
shouldShowFirefoxHint = match
  | { path: 'firefox-display-media' } -> true
  | _                                  -> false
```

This is a **pure** addition to `popup-logic.ts` -- no DOM, no chrome.

### 5.3 Start-recording message

The popup's `start-recording` message gains an optional `path` discriminant
so the SW can pick the host without re-probing:

```text
PopupToSW =
  | { type: 'get-state' }
  | { type: 'start-recording', path: 'chromium-offscreen', streamId: string }
  | { type: 'start-recording', path: 'firefox-display-media' }
  | { type: 'stop-recording' }
```

(See `data-models.md` for the full schema.)

## 6. Background contract changes

`background.ts` (effect shell):

- On startup, select the `RecorderHost` once based on the first
  `start-recording` message's `path`.
- Existing chrome-native effects (`getActiveTab`, `setBadge`,
  `downloadFile`, broadcast helpers) are **unchanged**.
- The `offscreen.*` chrome API calls (`createOffscreenDocument`,
  `closeOffscreenDocument`, `sendMessageToOffscreen`) become methods of the
  Chromium adapter only. They MUST NOT be referenced from the Firefox host
  adapter.

`background-logic.ts` (pure):

- **No change** to the state machine, the timeout helpers, the badge
  computation, or the filename generator.
- The `ChromeAPIs` port type is renamed conceptually to `BackgroundAPIs`
  (an optional refactor; software-crafter's call). Either way, the API
  shape `getActiveTab`, `downloadFile`, `setBadge`, `now`, `setTimeout`,
  `clearTimeout`, `broadcastState`, `broadcastError`, `broadcastFallbackNotice`,
  `getRecordingData`, `clearRecordingData` is reused.
- The four offscreen-specific entries (`createOffscreenDocument`,
  `closeOffscreenDocument`, `sendMessageToOffscreen`) are removed from the
  generic port and moved to the Chromium adapter's internal scope. This
  is the only refactor required of pure logic, and it is type-only -- no
  behavior changes.

## 7. Boundary rules (what dependency-cruiser will enforce)

| Rule | Spec |
|---|---|
| R1 | `*-logic.ts` MUST NOT import from `chrome`, `browser`, `navigator`, or any DOM-only module. |
| R2 | `*-logic.ts` MUST NOT import any `*-host.ts` module. |
| R3 | `firefox-host.ts` MUST NOT import `chrome.offscreen` directly (it has none on Firefox; symbolic safety). |
| R4 | `offscreen.ts` MUST NOT be loaded by the Firefox build (the Firefox build does not include `offscreen.html`). Enforced by the patcher omitting offscreen entry; soft check via the dependency rule that `firefox-host.ts` does not import `./offscreen`. |
| R5 | The Firefox host adapter MAY import `offscreen-logic.ts` (the pure handler factory). This is the explicit reuse channel. |

## 8. Lifecycle ownership

| Concern | Owner on Chromium | Owner on Firefox |
|---|---|---|
| MediaRecorder lifetime | Offscreen document (closed by SW after download) | Background event page (kept alive by active MediaRecorder; no explicit close) |
| MediaStream cleanup | Tracks stop on `MediaRecorder.stop()` | Same; plus `track.ended` listener triggers stop-and-download (FR-FF-04) |
| Download trigger | SW calls `chrome.downloads.download` | Same -- background event page calls `chrome.downloads.download` |
| Badge update | SW calls `chrome.action.setBadge*` | Same -- the Firefox event page is the SW analogue |
| Storage of dataUrl | `chrome.storage.local` (offscreen writes, SW reads) | `chrome.storage.local` (single context; both write and read happen in the event page) |

## 9. Test boundaries (informational)

The pure modules (`*-logic.ts`) remain target-agnostic and unit-testable
without a browser. Two new unit tests are anticipated (acceptance-designer's
call to formalize):

- `popup-logic`: `shouldShowFirefoxHint` and the discriminated
  `CapabilityCheckResult` return shape.
- A target-selection table-test for `selectHost` (input `Target`, expected
  adapter identity).

End-to-end tests live in playwright projects (chromium, firefox) and are
authored in DISTILL.

## 10. Migration / rollout note

This is **purely additive**. The Chromium build's runtime behavior is
unchanged once the type-only refactor of the `BackgroundAPIs` port lands.
No data migration. No version bump beyond the standard release.
