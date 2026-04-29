<!-- markdownlint-disable MD024 -->
# User Stories: firefox-recording-support

> Companion to `docs/feature/browser-tab-recorder/discuss/user-stories.md`.
> Same job-to-be-done as the existing extension. These stories specifically
> unblock the Firefox path. US-10 from the parent feature is now superseded by
> the stories below.

## Walking Skeleton (Release 1)

## US-FF-01: Capability probe accepts the Firefox recording path

### Problem

Maria, a Firefox-first developer, installed BroShow v0.1.2 on Firefox and saw
the message "Recording is not supported in this browser." That message is now
stale because we are about to support Firefox via `getDisplayMedia`. If the
probe is not updated alongside the new path, Maria will still see the
not-supported message and never reach the new recording flow.

### Who

- Returning Firefox user who tried v0.1.2 and was blocked.
- New Firefox user installing the add-on on Firefox 121+.

### Solution

Update `src/popup-logic.ts` so the capability check accepts EITHER (a) the
existing Chromium path (`chrome.offscreen.createDocument` and
`chrome.tabCapture.getMediaStreamId`) OR (b) the Firefox path
(`navigator.mediaDevices.getDisplayMedia`). Browsers matching neither still see
the existing not-supported message.

### Domain Examples

#### Example 1: Maria on Firefox 124

Maria opens the popup. The probe finds `navigator.mediaDevices.getDisplayMedia`
even though `chrome.offscreen` is missing. The popup shows the Start Recording
button (no error message).

#### Example 2: Sam on Chrome 130

Sam opens the popup. The probe finds `chrome.offscreen` and
`chrome.tabCapture`. The popup shows the Start Recording button. Behavior is
unchanged from v0.1.2.

#### Example 3: Lin on Safari 17 (hypothetical)

Lin opens the popup. The probe finds neither path (Safari doesn't load this
build, but for completeness). The popup shows
"Recording is not supported in this browser" exactly as today.

### UAT Scenarios (BDD)

#### Scenario: Probe passes on Firefox

```gherkin
Given Maria has Firefox 124 with the BroShow add-on installed
When she clicks the BroShow toolbar icon
Then the popup shows a "Start Recording" button
And the popup does NOT show "Recording is not supported in this browser"
```

#### Scenario: Probe still passes on Chrome (no regression)

```gherkin
Given Sam has Chrome 130 with the BroShow extension installed
When he clicks the BroShow toolbar icon
Then the popup shows a "Start Recording" button
And the popup does NOT show "Recording is not supported in this browser"
```

#### Scenario: Probe still blocks unsupported browsers

```gherkin
Given Lin is on a browser that supports neither chrome.tabCapture/chrome.offscreen nor navigator.mediaDevices.getDisplayMedia
When she clicks the BroShow toolbar icon
Then the popup shows "Recording is not supported in this browser"
And the Start Recording button is disabled
```

### Acceptance Criteria

- [ ] Probe returns `{supported: true}` on Firefox 121+ where `getDisplayMedia` is available.
- [ ] Probe returns `{supported: true}` on Chrome/Edge/Brave where existing APIs are available (no regression).
- [ ] Probe returns `{supported: false, reason: ...}` on browsers matching neither path.
- [ ] Reason text remains user-friendly (no jargon like "ECONNREFUSED").

### Outcome KPIs

- **Who**: Firefox 121+ users who install BroShow.
- **Does what**: Reach the popup's Start Recording button instead of the not-supported message.
- **By how much**: 100% (every Firefox-with-getDisplayMedia install reaches Start).
- **Measured by**: Manual smoke test on Firefox stable + Firefox ESR; tracked in DELIVER UAT logs.
- **Baseline**: 0% (today every Firefox install hits the not-supported message).

### Technical Notes

- Constraint: detection MUST be feature-based, not user-agent-based.
- Constraint: detection result must be reusable by the host bootstrapper (US-FF-02), so it should expose which path was matched, not just a boolean.
- Dependency: `src/popup-logic.ts`, `src/popup.ts` (`checkRecordingCapability`).
- Effort: ~0.5 day.

---

## US-FF-02: Firefox surface picker bootstraps a recordable MediaStream

### Problem

On Firefox, BroShow has no `chrome.tabCapture` to auto-target the active tab.
Maria expects the Start Recording button to actually start something. Without a
Firefox-aware bootstrap, the click does nothing or fails silently.

### Who

- Maria (Firefox user) who clicked Start Recording for the first time.
- Returning Firefox user who is now used to the Firefox surface picker.

### Solution

When the popup detects the Firefox path (per US-FF-01), invoke
`navigator.mediaDevices.getDisplayMedia({video: true, audio: true})` from a
recording host that has DOM access and survives long enough for Step 3
(US-FF-03 resolves the host choice). Hand the resulting `MediaStream` to the
recorder (the existing MediaRecorder + mp4-mux pipeline).

### Domain Examples

#### Example 1: Maria picks a tab

Maria clicks Start Recording. Firefox shows the surface picker. She picks the
tab "Tutorial.html" with Share audio checked. The `MediaStream` returned has 1
video track (`displaySurface: 'browser'`) and 1 audio track. Recording starts
immediately.

#### Example 2: Maria picks a window

Maria clicks Start Recording. Firefox shows the picker. She picks the entire
Firefox window. The `MediaStream` has 1 video track (`displaySurface: 'window'`)
and 0 audio tracks (windows on most OSes can't be captured with audio).
Recording starts immediately.

#### Example 3: Maria cancels the picker

Maria clicks Start Recording. Firefox shows the picker. She clicks Cancel.
`getDisplayMedia` rejects with `NotAllowedError`. The popup returns to its idle
state — no error toast, no badge, no log noise.

### UAT Scenarios (BDD)

#### Scenario: Recording starts after picking a tab

```gherkin
Given Maria is on Firefox with BroShow installed
When she clicks Start Recording
And she picks the tab "Tutorial.html" with Share audio checked in the Firefox picker
Then a MediaStream is captured with at least 1 video track and 1 audio track
And the BroShow REC badge appears
And MediaRecorder begins recording
```

#### Scenario: Cancelling the picker leaves the popup idle

```gherkin
Given Maria is on Firefox with BroShow installed
When she clicks Start Recording
And she clicks Cancel in the Firefox surface picker
Then no recording starts
And the popup returns to the idle state with the Start Recording button enabled
And no error toast is shown
```

#### Scenario: Picker error is communicated to the user

```gherkin
Given Maria is on Firefox with BroShow installed
And the Firefox picker fails for a reason other than user cancellation
When she clicks Start Recording
Then the popup shows the error: "Firefox could not start the capture. Try again or pick a different tab/window."
And the Start Recording button is enabled for retry
```

### Acceptance Criteria

- [ ] Firefox path uses `navigator.mediaDevices.getDisplayMedia({video: true, audio: true})`.
- [ ] User cancellation (`NotAllowedError`) is treated as a no-op (popup returns to idle, no error toast).
- [ ] Other picker errors surface a human-readable retry message.
- [ ] Returned `MediaStream` is wired to the same MediaRecorder pipeline used on Chrome.

### Outcome KPIs

- **Who**: Firefox users who click Start Recording.
- **Does what**: Successfully transition from "click Start" to "recording active" via the Firefox picker.
- **By how much**: >= 95% of Start clicks that result in a non-cancelled picker outcome.
- **Measured by**: DELIVER smoke test results across the matrix in `outcome-kpis.md`.
- **Baseline**: 0% (today the Start button is gated by US-FF-01).

### Technical Notes

- Constraint: `getDisplayMedia` MUST be invoked from a context that has the user-gesture flag (the popup click itself is sufficient if the host is the popup; if the host is elsewhere, the gesture must propagate).
- Constraint: ADR-001's offscreen-document option does not exist on Firefox; this story's host choice is the subject of `wave-decisions.md` DQ-1 — DESIGN owns the answer.
- Dependency: US-FF-01 (probe must report Firefox path so the popup picks the right bootstrap).

---

## US-FF-03: Recording host survives a 5-minute recording without popup interaction

### Problem

If the recording host dies before Maria clicks Stop, her recording is lost.
On Chrome the offscreen document keeps running while MediaRecorder is active.
On Firefox there is no offscreen document; popup contexts close on blur,
service workers/event pages can be unloaded, and a record-tab needs explicit
management. The riskiest assumption in this entire feature is "the host
survives."

### Who

- Maria recording a 5-minute tutorial without touching the popup.
- Maria recording a short clip (15 seconds) — also must survive but is the easy case.

### Solution

DESIGN selects a recording-host strategy (see DQ-1 in `wave-decisions.md`).
Whatever is selected, this story's UAT validates it. The popup's role becomes
a remote control: it asks the host to start/stop and is allowed to close
without interrupting the recording.

### Domain Examples

#### Example 1: 5-minute uninterrupted recording

Maria clicks Start, picks a tab, leaves Firefox to take a phone call for 5
minutes, returns, clicks Stop. The downloaded file is approximately 5 minutes
long with no gaps.

#### Example 2: 15-second recording with popup closed mid-recording

Maria clicks Start, picks a tab, recording begins, she clicks somewhere else
in Firefox (closing the popup), waits 15 seconds, opens the popup again,
clicks Stop. The file is approximately 15 seconds long.

#### Example 3: Recording survives Firefox sidebar/devtools toggle

Maria clicks Start, picks a tab, opens Firefox DevTools (separate context),
waits 30 seconds, closes DevTools, clicks Stop. The file is approximately 30
seconds long with no gaps.

### UAT Scenarios (BDD)

#### Scenario: 5-minute recording with no popup interaction

```gherkin
Given Maria has started a recording via the Firefox surface picker
When 5 minutes pass without her opening the popup
And she opens the popup and clicks Stop Recording
Then a file is downloaded
And the file duration is between 4:55 and 5:05 (allowing for stop latency)
```

#### Scenario: Recording continues after popup closes

```gherkin
Given Maria has just started a recording on Firefox
When she clicks elsewhere in Firefox, closing the popup
And 30 seconds pass
And she reopens the popup and clicks Stop Recording
Then a file is downloaded
And the file duration is between 28 and 32 seconds
```

#### Scenario: Recording continues across DevTools open/close

```gherkin
Given Maria has just started a recording on Firefox
When she opens Firefox DevTools and waits 30 seconds
And she closes DevTools and opens the popup
And she clicks Stop Recording
Then a file is downloaded
And the file has no gaps in video
```

### Acceptance Criteria

- [ ] A recording lasting 5 minutes with zero popup interaction completes successfully and downloads.
- [ ] A recording survives the popup closing and reopening multiple times.
- [ ] A recording survives common Firefox UI events (DevTools, sidebar, switching tabs in the picked window context).
- [ ] If the host genuinely cannot continue (e.g., the picked tab is closed by the user), the partial recording is downloaded with a clear notice.

### Outcome KPIs

- **Who**: Firefox users with active recordings.
- **Does what**: Their recording reaches the download step intact.
- **By how much**: >= 95% completion rate across the smoke-test matrix; 100% for the canonical 5-minute case.
- **Measured by**: UAT scenarios in DELIVER + manual smoke runs.
- **Baseline**: 0% (recording does not work at all on Firefox today).

### Technical Notes

- Constraint: This is the riskiest assumption. DESIGN should validate via spike before committing.
- Constraint: Whatever host is chosen, it MUST NOT add new permissions beyond the current set (see `outcome-kpis.md` guardrail).
- Dependency: US-FF-02; resolution of DQ-1 in `wave-decisions.md`.

---

## US-FF-04: Firefox popup shows surface-picker hint

### Problem

Maria has used Chrome's BroShow before (where clicking Start auto-records the
active tab). On Firefox she will see Firefox's surface picker, which is a new
dialog and breaks her mental model. Without a hint, she may pick the wrong
surface or hesitate.

### Who

- Returning Chrome-user-now-on-Firefox who expects auto-targeting.
- New Firefox user who has not seen our extension before.

### Solution

When the popup detects the Firefox path, render a one-line hint above or
below the Start Recording button: "Firefox will ask you to choose a tab,
window, or screen." When the popup detects the Chrome path, the hint is not
rendered.

### Domain Examples

#### Example 1: Maria on Firefox sees the hint

Maria opens the popup on Firefox. Below the Start Recording button she reads
"Firefox will ask you to choose a tab, window, or screen." She clicks Start
expecting the picker, and the picker appears as promised.

#### Example 2: Sam on Chrome does NOT see the hint

Sam opens the popup on Chrome. He sees only the Start Recording button. There
is no hint about a picker (because Chrome auto-targets).

#### Example 3: Maria on Firefox already knows; hint is unobtrusive

Maria, after several uses, knows about the picker. The hint does not push the
button below the fold; the popup remains compact.

### UAT Scenarios (BDD)

#### Scenario: Firefox popup shows the hint

```gherkin
Given Maria is on Firefox with BroShow installed
When she clicks the BroShow toolbar icon
Then the popup shows the hint "Firefox will ask you to choose a tab, window, or screen"
```

#### Scenario: Chrome popup does NOT show the hint

```gherkin
Given Sam is on Chrome with BroShow installed
When he clicks the BroShow toolbar icon
Then the popup does NOT show the Firefox surface-picker hint
```

#### Scenario: Hint disappears once recording starts

```gherkin
Given Maria is on Firefox and the popup shows the hint
When she clicks Start Recording and picks a tab
And she reopens the popup mid-recording
Then the popup shows "Recording..." UI
And the surface-picker hint is hidden (no longer relevant)
```

### Acceptance Criteria

- [ ] Hint text is exactly: "Firefox will ask you to choose a tab, window, or screen."
- [ ] Hint is shown only when the capability probe reports the Firefox path.
- [ ] Hint is hidden during recording and after stop.
- [ ] Popup stays compact (hint does not push core controls below visible area).

### Outcome KPIs

- **Who**: Firefox users opening the popup.
- **Does what**: Anticipate the surface picker rather than be surprised by it.
- **By how much**: Qualitative — measured by whether smoke-test users can describe what will happen next without prompting (>= 4 of 5 testers).
- **Measured by**: Smoke-test interviews during DELIVER.
- **Baseline**: N/A (no Firefox flow exists today).

### Technical Notes

- Constraint: hint visibility MUST be derived from the capability probe (single source of truth), not from a separate flag.
- Dependency: US-FF-01.

---

## US-FF-05: Firefox recording stops and downloads as mp4 (or webm fallback)

### Problem

After Maria clicks Stop, she expects the same outcome she gets on Chrome: an
mp4 file in Downloads with a sensible filename. The download path on Firefox
must reuse the existing pipeline so the user-visible artifact is identical.

### Who

- Maria, who just finished her recording.
- Maria again, this time mp4-mux fails (rare but possible) and she gets a webm fallback.

### Solution

Reuse the existing `src/offscreen-logic.ts` -> mp4-mux -> WebM fallback (US-06)
-> `chrome.downloads.download` pipeline. The Firefox host calls into the same
filename generator (`src/filename-generator.ts`) so output is identical.

### Domain Examples

#### Example 1: Maria gets an mp4 on Firefox

Maria recorded for 10 seconds. She clicks Stop. Within 2 seconds, a file
named `broshow-2026-04-29-141522.mp4` appears in her Downloads. The file plays
in VLC.

#### Example 2: Maria gets a webm fallback on Firefox

Maria recorded for 10 seconds. mp4-mux throws an error during muxing. The popup
shows "Saved as WebM (mp4 conversion failed)." A file named
`broshow-2026-04-29-141522.webm` appears in her Downloads.

#### Example 3: Maria's recording was interrupted; partial file still downloads

Maria recorded for 30 seconds, but the picked tab was closed at the 25-second
mark. The host detects the ended track, finalizes what it has, and downloads
a 25-second file. The popup shows "Recording ended early; saved 25 seconds."

### UAT Scenarios (BDD)

#### Scenario: Successful Firefox recording is mp4

```gherkin
Given mp4-mux is available and succeeds
And Maria recorded for 10 seconds on Firefox
When she clicks Stop Recording
Then a file matching "broshow-YYYY-MM-DD-HHmmss.mp4" appears in Downloads
And the file plays in VLC, QuickTime, and Windows Media Player
```

#### Scenario: Firefox webm fallback when mp4-mux fails

```gherkin
Given Maria recorded for 10 seconds on Firefox
And mp4-mux fails
When she clicks Stop Recording
Then a file matching "broshow-YYYY-MM-DD-HHmmss.webm" appears in Downloads
And the popup shows the fallback notice
```

#### Scenario: Filename pattern matches Chrome

```gherkin
Given Maria recorded a tab on Firefox at 14:15:22 local time on 2026-04-29
When the file is downloaded
Then the filename equals "broshow-2026-04-29-141522.mp4" or "broshow-2026-04-29-141522.webm"
And the same filename pattern would be produced by Chrome under identical conditions
```

### Acceptance Criteria

- [ ] Download triggered automatically when MediaRecorder finishes.
- [ ] Filename pattern is identical to Chrome (`broshow-YYYY-MM-DD-HHmmss.{mp4,webm}`).
- [ ] mp4-mux primary path produces a playable mp4.
- [ ] WebM fallback path produces a playable webm and surfaces the existing US-06 fallback notice.
- [ ] No new permissions added to the manifest.

### Outcome KPIs

- **Who**: Firefox users who clicked Stop Recording.
- **Does what**: Receive a downloadable file matching the Chrome filename pattern.
- **By how much**: 100% of completed recordings produce a download; mp4-success-rate on Firefox >= 90% (parity with Chrome).
- **Measured by**: DELIVER smoke matrix; `outcome-kpis.md` quality table.
- **Baseline**: 0% on Firefox.

### Technical Notes

- Constraint: ADR-002 (mp4-mux) MUST still apply on Firefox. If DESIGN finds that the chosen recording host cannot host mp4-mux (e.g., service-worker-only context with no DOM), DESIGN must flag this as an ADR amendment.
- Dependency: US-FF-03 (host must produce a stable Blob); reuses US-05 (mp4 conversion) and US-06 (webm fallback) from the parent feature.

---

## Release 2 (Polish)

## US-FF-06: Stopping via Firefox native "Stop sharing" matches Stop button behavior

### Problem

Firefox shows its own "Stop sharing" affordance during a `getDisplayMedia`
session. If Maria clicks it instead of our Stop button, BroShow must still
finalize and download the file. Otherwise the recording disappears and Maria
loses her work.

### Who

- Maria who reaches for the closer Firefox-native control.
- Maria who switches windows and clicks Firefox's URL-bar "Stop sharing" out of habit.

### Solution

The recording host listens for `MediaStreamTrack#ended` events on the captured
stream. When ended (regardless of cause), the host runs the same stop-and-
download flow as the popup's Stop button.

### Domain Examples

#### Example 1: Maria clicks Firefox's "Stop sharing"

Maria recorded for 12 seconds, then clicked "Stop sharing" in Firefox's URL
bar. The MediaStreamTrack `ended` event fires. The host stops MediaRecorder,
mp4-muxes the result, and downloads a file. The REC badge clears.

#### Example 2: Maria's recorded tab is closed

Maria recorded for 12 seconds, then closed the recorded tab. The track's
`ended` event fires. The host stops, mp4-muxes, and downloads.

#### Example 3: Maria clicks our Stop button (regression check)

Maria clicks our Stop button after 12 seconds. MediaRecorder.stop() is
called, the file downloads, the REC badge clears. (Same as today on Chrome.)

### UAT Scenarios (BDD)

#### Scenario: Native stop produces a download

```gherkin
Given Maria is recording a tab on Firefox
When she clicks "Stop sharing" in Firefox's URL bar
Then a file is downloaded automatically
And the REC badge is cleared
```

#### Scenario: Tab closed mid-recording produces a download

```gherkin
Given Maria is recording a tab on Firefox
When she closes the recorded tab
Then a file is downloaded with whatever was captured before close
And the popup shows a notice that the recording ended early
```

#### Scenario: BroShow Stop button still works (regression)

```gherkin
Given Maria is recording a tab on Firefox
When she clicks Stop Recording in the BroShow popup
Then a file is downloaded
And the REC badge is cleared
```

### Acceptance Criteria

- [ ] `track.ended` triggers the same stop-and-download flow as the Stop button.
- [ ] REC badge clears in both stop paths.
- [ ] BroShow Stop button still works on Firefox.

### Outcome KPIs

- **Who**: Firefox users who use the native stop control.
- **Does what**: Still receive their downloaded file.
- **By how much**: 100% (no recording is lost via native stop).
- **Measured by**: UAT.
- **Baseline**: 0% (today no Firefox recording produces a file at all).

### Technical Notes

- Dependency: US-FF-03 (host must observe the ended event reliably).

---

## US-FF-07: "Audio not captured" success note when user declines share-audio

### Problem

When Maria unchecks "Share audio" in Firefox's picker (or the OS doesn't allow
audio capture for that surface, e.g., a window), her recording is video-only.
She may not realize this until she opens the file later. She wants to know
immediately.

### Who

- Maria recording a tutorial who needs sound and would re-record if told upfront.
- Maria recording a silent UI demo who is fine with no sound.

### Solution

After recording stops, inspect whether the captured `MediaStream` contained an
audio track. If not, append a one-line note to the popup's success/processing
message: "Audio was not captured." Do not block the download.

### Domain Examples

#### Example 1: Tutorial without audio

Maria intended to record a tutorial with narration. She unchecked "Share
audio" by accident. After Stop, the popup shows: "Saved.
Audio was not captured." She immediately re-records.

#### Example 2: Silent UI demo

Maria is recording a silent UI flow. She left "Share audio" unchecked. After
Stop, the popup shows: "Saved. Audio was not captured." She doesn't care; she
moves on.

#### Example 3: Audio captured (no note)

Maria recorded with audio. After Stop, the popup shows: "Saved." (no audio note).

### UAT Scenarios (BDD)

#### Scenario: Audio note appears when audio not captured

```gherkin
Given Maria recorded a Firefox tab with "Share audio" unchecked
When she clicks Stop Recording
Then the popup shows: "Audio was not captured"
And the file is still downloaded
```

#### Scenario: No audio note when audio is present

```gherkin
Given Maria recorded a Firefox tab with "Share audio" checked
When she clicks Stop Recording
Then the popup does NOT show "Audio was not captured"
And the file is downloaded
```

#### Scenario: No audio note on Chrome (where audio is implicit)

```gherkin
Given Sam is recording on Chrome (where tabCapture always includes audio per current behavior)
When he clicks Stop Recording
Then the popup does NOT show "Audio was not captured"
```

### Acceptance Criteria

- [ ] Note appears iff the captured MediaStream had no audio track at recording start.
- [ ] Note text is exactly: "Audio was not captured."
- [ ] Note does not block the download.
- [ ] Note does not appear on Chrome.

### Outcome KPIs

- **Who**: Firefox users who unintentionally disabled share-audio.
- **Does what**: Realize the audio gap before discovering it in the saved file.
- **By how much**: 100% of audio-less Firefox recordings show the note.
- **Measured by**: UAT.
- **Baseline**: N/A.

### Technical Notes

- Dependency: US-FF-05 (success message exists to append to).
