# Journey Map: Record a Browser Tab (Firefox)

> Companion to `docs/feature/browser-tab-recorder/discuss/journey-record-tab-visual.md`.
> Same job-to-be-done. Different host platform. Honors Firefox's surface-picker UX
> rather than forcing parity with Chrome's auto-targeted `tabCapture`.

## Happy Path

```
+---------+    +----------+    +-------------+    +-----------+    +----------+    +----------+
| INSTALL |--> |  CLICK   |--> |  PICK       |--> | RECORDING |--> |   STOP   |--> |  SAVED   |
| Firefox |    |  Icon    |    | SURFACE     |    | Active    |    | Recording|    | as mp4*  |
| add-on  |    |          |    | (FF picker) |    |           |    |          |    | or webm  |
+---------+    +----------+    +-------------+    +-----------+    +----------+    +----------+
 "Available!"   "Same as     "Oh, I pick a tab,   "It's working"    "Done"        "It worked
                 Chrome"      window, or screen?"  Reassured        Satisfied      on Firefox"
   Hopeful       Confident    Curious->Informed    Assured          Satisfied      Delighted
```

\* mp4 if `mp4-mux` succeeds (ADR-002 unchanged); webm fallback per US-06 if it fails.

## Divergence From Chrome Journey

The Chrome journey auto-targets the active tab via `chrome.tabCapture.getMediaStreamId()`.
Firefox does not implement `chrome.tabCapture`. The honest replacement is
`navigator.mediaDevices.getDisplayMedia({video, audio})`, which renders Firefox's
**native surface picker** (a system dialog showing tabs, windows, and entire screens).

This means the Firefox journey gains a **Step 2.5 ("Pick Surface")** that does not
exist in the Chrome flow. We accept this divergence rather than try to hide it,
because:

1. The picker is owned by Firefox, not by us — we cannot suppress it.
2. The picker is a familiar pattern (Google Meet, Zoom, etc. show the same UX).
3. Trying to fake auto-target on Firefox would silently capture the wrong surface.

Capture this honestly in copy: the popup hint should set the expectation
("Firefox will ask you which tab or window to record.") so the user is not
surprised.

## Steps

### 1. Install Add-on

- **Action**: User installs the signed Firefox add-on (same `.xpi` we ship via `scripts/patch-firefox-manifest.mjs`).
- **Sees**: BroShow icon appears in the Firefox toolbar; existing v0.1.2 capability probe stops surfacing the "not supported" message.
- **Feels**: Hopeful — "I heard recording would actually work this time."
- **Shared artifact**: Toolbar icon (same icon asset as Chrome).

### 2. Click Extension Icon

- **Action**: User clicks the toolbar icon. Popup opens.
- **Sees**: Identical popup chrome to Chrome (Start Recording button), plus a small one-line hint: "Firefox will ask you to choose a tab, window, or screen."
- **Feels**: Confident — recognizable UX, expectation set for the next step.
- **Shared artifact**: Popup UI — `${recordButtonLabel}`, `${browserHint}`.

### 2.5. Pick Surface (Firefox-only)

- **Action**: Popup invokes the recording-host bootstrap (DESIGN decides: popup vs record-tab vs background-scripts page) which calls `navigator.mediaDevices.getDisplayMedia({video: true, audio: true})`.
- **Sees**: Firefox's native surface-picker dialog. Lists open tabs (with favicons + titles), open windows, and entire-screen options. Includes "Share audio" checkbox.
- **Feels**: Curious -> Informed. May briefly wonder which to pick; the popup hint and the picker's own labels resolve it.
- **Shared artifact**: `${capturedSurface}` (tab|window|screen) — produced by the picker, consumed by the recording host and the filename generator (informational only).

### 3. Recording Active

- **Action**: Recording host starts MediaRecorder against the picked `MediaStream`.
- **Sees**: Two indicators: (a) BroShow's existing `REC` badge (US-07); (b) Firefox's native sharing indicator (a small "Sharing" pill in the URL bar / tab strip).
- **Feels**: Assured — same visual confirmation as Chrome plus a Firefox-native cue.
- **Shared artifact**: `${recordingState}` ('recording'), `${recBadge}`.
- **Note**: The recording host's lifetime determines whether the recording survives. If popup-hosted, the recording dies when the popup closes. DESIGN must resolve this — see `wave-decisions.md`.

### 4. Stop Recording

- **Action**: User reopens the popup (if needed) and clicks "Stop Recording", OR clicks the Firefox sharing-indicator's "Stop sharing" affordance.
- **Sees**: Popup briefly shows "Processing...", then a download is triggered.
- **Feels**: Satisfied — quick turnaround, same as Chrome.
- **Shared artifact**: `${recordingState}` ('stopping' -> 'idle').
- **Note**: Stopping via Firefox's native control must also gracefully end the recording — the host listens for `MediaStreamTrack#ended`.

### 5. File Saved

- **Action**: `chrome.downloads.download()` (Firefox WebExtension polyfilled) saves the file.
- **Sees**: A file in Downloads named `broshow-YYYY-MM-DD-HHmmss.mp4` (or `.webm` if mp4 muxing failed — same fallback path as Chrome via US-06).
- **Feels**: Delighted — "It works on Firefox now."
- **Shared artifact**: `${downloadedFilename}` — produced by filename generator, consumed by Firefox's downloads API.

## Popup Hint Mockup

```
+-- BroShow ----------------------------------+
|                                              |
|   [ Start Recording ]                        |
|                                              |
|   Firefox will ask you to choose a tab,      |
|   window, or screen.                         |
|                                              |
+----------------------------------------------+
```

While recording (assumes recording host survives — see DESIGN fork):

```
+-- BroShow ----------------------------------+
|                                              |
|   * Recording...   00:14                     |
|                                              |
|   [ Stop Recording ]                         |
|                                              |
+----------------------------------------------+
```

After stop, before download fires:

```
+-- BroShow ----------------------------------+
|                                              |
|   Processing...                              |
|                                              |
+----------------------------------------------+
```

## Error Paths

| Step | Error | Recovery |
|------|-------|----------|
| 2.5  | User cancels Firefox surface picker | Popup returns to idle state, no error toast (cancellation is a normal outcome). |
| 2.5  | User picks a surface that produces no `MediaStream` (rare) | Surface error: "Firefox could not start the capture. Try again or pick a different tab/window." |
| 2.5  | User picks "Share audio" off but a tutorial expected sound | Recording proceeds video-only; popup notes "Audio not captured" in success message. |
| 3    | Recording host is unloaded (popup closes / background script idles) before stop | DESIGN-dependent. If host is popup, recording dies; treat as a known-and-flagged limitation OR resolve via record-tab/background-scripts host. See wave-decisions.md. |
| 3    | User clicks Firefox's native "Stop sharing" | Recording host detects `track.ended`, stops MediaRecorder, triggers download as if user pressed Stop. |
| 4    | Same fallback chain as Chrome: `mp4-mux` fails | WebM file downloaded; popup shows fallback notice (US-06 reused). |

## Emotional Arc Coherence

Chrome arc: Curious -> Confident -> Assured -> Satisfied -> Delighted.

Firefox arc: Hopeful -> Confident -> Curious -> Informed -> Assured -> Satisfied -> Delighted.

The Firefox arc has one extra "Curious -> Informed" beat at the picker. We absorb
that beat with the popup hint so the curiosity is anticipated, not jarring.
Confidence is preserved because the picker UX is industry-standard.

## CLI/UX Vocabulary Consistency

| Term | Chrome surface | Firefox surface |
|------|---------------|-----------------|
| "Start Recording" | popup button | popup button (unchanged) |
| "Stop Recording" | popup button | popup button (unchanged) |
| "Tab" | what gets captured | what *might* get captured (also "window" or "screen") |
| Hint copy | none | "Firefox will ask you to choose a tab, window, or screen." |

Vocabulary is consistent for the controls. We add (we do not replace) terminology
to honor the picker.
