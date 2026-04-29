# Data Models: firefox-recording-support

> Wave: DESIGN
> Sibling: `architecture-design.md`, `component-boundaries.md`
> Scope: only the message and state shapes that change. All other types in
> `src/types.ts` carry forward unchanged.

## 1. Summary of changes

This feature touches three type families:

- `CapabilityCheckResult` (popup probe; **discriminant added**).
- `PopupToSW` (start-recording variants; **path discriminant added**).
- `RecorderHost` port (**new** -- introduced by this feature).

`RecordingState`, `SWToPopup`, `OffscreenToSW`, `SWToOffscreen` are
unchanged. The Firefox path produces the same end-states (`idle`,
`recording`, `processing`) and the same outbound popup messages
(`state-update`, `error`, `fallback-notice`).

## 2. `CapabilityCheckResult` (popup-logic.ts)

### 2.1 Before (current)

```text
CapabilityCheckResult =
  | { supported: true }
  | { supported: false; reason: string }
```

### 2.2 After (this feature)

```text
type RecordingPath = 'chromium-offscreen' | 'firefox-display-media';

CapabilityCheckResult =
  | { supported: true;  path: 'chromium-offscreen' }
  | { supported: true;  path: 'firefox-display-media' }
  | { supported: false; reason: string }
```

### 2.3 Probe semantics (informational)

```text
probe :: () -> CapabilityCheckResult
probe ()
  | hasFn(chrome.offscreen?.createDocument)
      && hasFn(chrome.tabCapture?.getMediaStreamId)
                                              = { supported: true,  path: 'chromium-offscreen' }
  | hasFn(navigator.mediaDevices?.getDisplayMedia)
                                              = { supported: true,  path: 'firefox-display-media' }
  | otherwise                                 = { supported: false, reason: '...' }
```

Order matters: a Firefox build that somehow exposed both APIs (currently
impossible) would deterministically pick the chromium path. A Chromium
build that loses tabCapture but retains getDisplayMedia would fall through
to the Firefox path. Both branches are typesafe via the discriminated
union.

## 3. `PopupToSW` (types.ts)

### 3.1 Before (current)

```text
PopupToSW =
  | { type: 'get-state' }
  | { type: 'start-recording'; streamId: string }
  | { type: 'stop-recording' }
```

### 3.2 After (this feature)

```text
PopupToSW =
  | { type: 'get-state' }
  | { type: 'start-recording'; path: 'chromium-offscreen';   streamId: string }
  | { type: 'start-recording'; path: 'firefox-display-media' }
  | { type: 'stop-recording' }
```

The `path` field is the runtime witness of the capability probe. The SW
uses it to:

1. Select the `RecorderHost` adapter on first `start-recording`.
2. Validate that subsequent messages match the same path (defensive; a
   path mismatch should never happen because the popup re-probes only on
   reload).

### 3.3 Backward compatibility

The shape with no `path` field never reaches a Firefox-aware SW (the
popup is updated in lockstep). On Chromium the new `path: 'chromium-offscreen'`
is informational; the existing field `streamId` carries the same load-bearing
content as before. The handler treats a missing `path` as
`'chromium-offscreen'` for safety during the transitional release, but
this is an adapter-level concession, not a model concession.

## 4. `RecorderHost` port (new)

Belongs to a new file (e.g., `src/recorder-host.ts`) or co-located with
`background-logic.ts`. Naming is software-crafter's call.

```text
type Target = 'chromium' | 'firefox';

type HostStartInput =
  | { target: 'chromium'; streamId: string }
  | { target: 'firefox' };

type HostStartResult =
  | { ok: true;  hadAudioTrack: boolean }
  | { ok: false; cause: 'picker-cancelled' };
  // Other failures throw and are handled by the SW timeout / error path,
  // matching the existing offscreen-error contract.

type HostStopResult =
  | { ok: true;  format: 'mp4' | 'webm'; dataUrl: string }
  | { ok: false; cause: 'mux-error'; fallbackDataUrl?: string };

type RecorderHost = {
  start: (input: HostStartInput) => Promise<HostStartResult>;
  stop:  ()                       => Promise<HostStopResult>;
};
```

### 4.1 Why `hadAudioTrack` is on the start result

US-FF-07 ("Audio not captured" note) requires knowing at recording start
whether an audio track exists. Putting it on `HostStartResult` keeps the
fact close to its source (the captured `MediaStream`) and avoids a separate
out-of-band query. The SW stashes the boolean and includes it in the
post-stop popup notice.

### 4.2 Why `picker-cancelled` is its own non-error variant

`getDisplayMedia`'s `NotAllowedError` is a normal user choice (FR-FF-05).
Modeling it as a discriminated `ok: false; cause: 'picker-cancelled'` lets
the SW treat it as a no-op transition back to idle, **without going through
the error broadcast path** that would render a toast.

## 5. `RecordingState` (background-logic.ts)

**Unchanged.**

```text
RecordingState =
  | { status: 'idle' }
  | { status: 'recording'; tabId: number; startTime: number }
  | { status: 'processing' }
```

Note on `tabId`: on Firefox, no `tabId` is available because the user
picks the surface (tab/window/screen) in Firefox's own picker; we do not
get a tab id back. Two acceptable resolutions, software-crafter's choice
during GREEN:

- (a) Set `tabId = -1` (sentinel) on Firefox. Cheapest, no model change.
- (b) Loosen `tabId` to `number | null`. Slightly more honest; touches all
  consumers of `RecordingState.recording`.

DESIGN does **not** mandate either; both are non-breaking at the
architecture level. The architecture-level fact is that `tabId` is
**advisory** in this feature -- nothing in DISTILL or DELIVER consumes it.

## 6. `SWToPopup` (types.ts)

**Unchanged shape.** Existing variants `state-update`, `error`,
`fallback-notice` carry the new flows:

- Picker cancellation -> `state-update` with `state: { status: 'idle' }`,
  no `error` message.
- Audio-absent (US-FF-07) -> `fallback-notice` with message
  `"Audio was not captured."` (a new use of the existing variant).

Reusing `fallback-notice` keeps the type set minimal.

## 7. Wire-format examples

### 7.1 Chrome start (existing)

```json
{ "type": "start-recording", "path": "chromium-offscreen", "streamId": "abc..." }
```

### 7.2 Firefox start (new)

```json
{ "type": "start-recording", "path": "firefox-display-media" }
```

### 7.3 Audio-absent notice (new use)

```json
{ "type": "fallback-notice", "message": "Audio was not captured." }
```

### 7.4 mp4-mux failure on Firefox (existing variant, new context)

```json
{ "type": "fallback-notice", "message": "Mp4 conversion failed; downloaded as WebM instead." }
```

## 8. Validation

These shapes are pure TypeScript discriminated unions. Vitest unit tests
in DISTILL will cover:

- Probe -> `CapabilityCheckResult` mapping (3 cases).
- `messageForAction(action, capability) -> PopupToSW` produces the right
  variant.
- `selectHost(path) -> RecorderHost` adapter identity.

No runtime schema validation library is needed; the boundaries are
process-internal (`chrome.runtime.sendMessage` between extension contexts
we own).
