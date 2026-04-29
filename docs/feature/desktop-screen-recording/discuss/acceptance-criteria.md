# Acceptance Criteria: desktop-screen-recording

## AC-DSR-01: Source Selector Renders

**Given** the BroShow popup is open and idle
**When** the popup loads
**Then** a source selector is visible with options "This Tab" and "Screen / Window"
**And** "This Tab" is selected by default

---

## AC-DSR-02: Screen Recording Starts

**Given** the popup is open and idle
**And** "Screen / Window" is selected
**When** I click "Start Recording"
**Then** the browser's native screen/window picker appears
**And** after I select a source, recording begins
**And** the popup shows "Recording..." with a Stop button

---

## AC-DSR-03: Tab Recording Still Works (Regression Guard)

**Given** the popup is open and idle
**And** "This Tab" is selected (default)
**When** I click "Start Recording"
**Then** the existing tab capture flow executes unchanged
**And** recording begins on the current tab

---

## AC-DSR-04: Screen Recording Produces Downloadable mp4

**Given** I am recording a screen or window
**When** I click "Stop Recording"
**Then** the popup shows "Processing..."
**And** an mp4 file downloads to the user's default downloads folder
**And** the file is playable in VLC and QuickTime without conversion
**And** the filename follows `broshow-YYYY-MM-DD-HHmmss.mp4` convention
**And** the popup returns to idle

---

## AC-DSR-05: Source Selection Persists

**Given** I select "Screen / Window" in the popup
**When** I close and reopen the popup
**Then** "Screen / Window" is still selected

---

## AC-DSR-06: Selector Disabled During Recording

**Given** I am recording (any source)
**When** I look at the popup
**Then** the source selector is disabled
**And** it re-enables after recording completes

---

## AC-DSR-07: Stream Termination Recovery

**Given** I am recording a specific window
**When** that window is closed
**Then** recording stops automatically
**And** the captured content is processed and downloaded
**And** the popup returns to idle

---

## AC-DSR-08: Graceful Degradation

**Given** the browser does not support `getDisplayMedia`
**When** the popup loads
**Then** only "This Tab" is shown (no source selector)
**And** the extension works normally

---

## AC-DSR-09: No New Permissions Required

**Given** the extension manifest
**Then** no additional permissions are declared beyond the existing set
**And** `getDisplayMedia` works with the current permission model

---

## AC-DSR-10: Screen Recording Permission Failure

**Given** I select "Screen / Window" and click "Start Recording"
**And** the browser fails to show the screen picker (activation error)
**Then** the popup displays "Screen recording requires permission. Please try again."
**And** the popup returns to idle
**And** no extension crash occurs

---

## AC-DSR-11: Screen Recording Without System Audio

**Given** I am recording a screen on a platform where system audio is unavailable
**When** the recording completes
**Then** the mp4 file contains video without audio
**And** no error message is shown (audio is best-effort)

---

## AC-DSR-12: WebM Fallback for Screen Recordings

**Given** I stop a screen recording
**And** mp4 conversion encounters an error
**Then** the recording downloads as a WebM file instead
**And** the popup displays a notice: "MP4 conversion failed. Saved as WebM instead."
**And** the notice is visible until the user dismisses it or starts a new recording
