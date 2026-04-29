# Acceptance Criteria: firefox-recording-support

> Story-level acceptance criteria live in `user-stories.md`.
> This file collects the cross-cutting end-to-end acceptance tests for the feature as a whole.
> Reuses Gherkin from `journey-record-tab-firefox.feature`; this is the curated subset that gates DoD.

## End-to-End Acceptance Tests

### AC-FF-01: Complete Firefox recording flow (mp4)

```gherkin
Given the BroShow add-on is installed in Firefox 121+
When Maria clicks the BroShow toolbar icon
And she clicks Start Recording
And she picks a tab in the Firefox surface picker with "Share audio" checked
And she waits 10 seconds
And she clicks Stop Recording
Then an mp4 file is downloaded
And the filename matches "broshow-YYYY-MM-DD-HHmmss.mp4"
And the file plays correctly with video and audio
```

### AC-FF-02: Picker cancellation is a graceful no-op

```gherkin
Given Maria is on Firefox with BroShow installed
When she clicks Start Recording
And she clicks Cancel in the Firefox surface picker
Then BroShow returns to the idle state
And no error toast is shown
And the REC badge is NOT shown
```

### AC-FF-03: Recording survives popup close (riskiest assumption)

```gherkin
Given Maria has started recording a Firefox tab
When she clicks elsewhere in Firefox, closing the popup
And 60 seconds pass with no popup interaction
And she reopens the popup and clicks Stop Recording
Then a file is downloaded
And the file is approximately 60 seconds long
```

### AC-FF-04: Native "Stop sharing" produces the same outcome as the Stop button

```gherkin
Given Maria is recording a tab on Firefox
When she clicks Firefox's native "Stop sharing" affordance
Then a file is downloaded automatically
And the REC badge is cleared
```

### AC-FF-05: WebM fallback works on Firefox

```gherkin
Given Maria recorded for 10 seconds on Firefox
And mp4-mux fails during muxing
When she clicks Stop Recording
Then a file matching "broshow-YYYY-MM-DD-HHmmss.webm" appears in Downloads
And the popup shows the existing fallback notice
```

### AC-FF-06: Chrome flow is unchanged (regression guard)

```gherkin
Given Sam is on Chrome with BroShow installed
When he clicks the BroShow toolbar icon
Then the popup does NOT show the Firefox surface-picker hint
When he clicks Start Recording
Then no surface picker is shown
And BroShow records the active tab automatically
And after Stop, an mp4 is downloaded with the same filename pattern
```

### AC-FF-07: Capability probe still blocks unsupported browsers

```gherkin
Given Lin is on a browser that supports neither chrome.tabCapture/chrome.offscreen nor navigator.mediaDevices.getDisplayMedia
When she clicks the BroShow toolbar icon
Then the popup shows "Recording is not supported in this browser"
And the Start Recording button is disabled
```

### AC-FF-08: No new permissions added to the manifest

```gherkin
Given the Firefox add-on is built via scripts/patch-firefox-manifest.mjs
When the resulting manifest is inspected
Then it declares no permissions beyond the current set in src/manifest.json
And the patcher's behavior on Chrome's manifest is unchanged
```

### AC-FF-09: No outbound network requests on Firefox

```gherkin
Given the BroShow add-on is in use on Firefox
When Maria performs a complete recording flow
Then no outbound network requests are made by the extension at any point
```

### AC-FF-10: Filename pattern parity

```gherkin
Given Maria recorded on Firefox at 14:15:22 local time on 2026-04-29
And Sam recorded on Chrome at the same moment
When both files are downloaded
Then both filenames equal "broshow-2026-04-29-141522.{mp4|webm}" using the same generator
```
