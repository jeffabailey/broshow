# User Stories: desktop-screen-recording

## Personas

- **Maria** — Content creator who records tutorials showing design tools (Figma, Canva) alongside her browser. Needs to capture her full screen so viewers see the complete workflow.
- **Dev** — Software engineer who records bug reproductions spanning terminal + browser + IDE. Needs to capture a specific app window to share focused context in bug reports.
- **Jordan** — Casual user on an older MacBook whose browser may lack `getDisplayMedia` support. Just wants tab recording to keep working.

## Concrete Examples

### Example 1: Maria records a design tutorial (happy path)
Maria opens BroShow, selects "Screen / Window", clicks Start. The browser picker shows her external monitor (2560x1440) running Figma. She selects it and records a 12-minute tutorial. She clicks Stop, and `broshow-2026-03-23-143000.mp4` downloads — playable in QuickTime immediately.

### Example 2: Dev records a window that closes mid-capture (edge case)
Dev selects "Screen / Window", picks the Terminal app, and starts recording a bug reproduction. 45 seconds in, the terminal crashes. BroShow detects the stream ended, auto-stops recording, and downloads the 45-second partial capture as mp4.

### Example 3: Jordan on an unsupported browser (graceful degradation)
Jordan opens BroShow on an older browser without `getDisplayMedia`. The popup shows only the "Start Recording" button with no source selector — identical to the original experience. Tab recording works normally.

---

## Slice 1: Core Screen Recording (Walking Skeleton)

### US-DSR-01: Source Selector in Popup
**As a** browser user
**I want to** choose between recording "This Tab" or "Screen / Window"
**So that** I can capture content beyond the current browser tab

**Acceptance Criteria**:
- [ ] Popup displays a source selector with two options: "This Tab" and "Screen / Window"
- [ ] "This Tab" is selected by default
- [ ] Selector is visible when in idle state
- [ ] Selecting an option does not start recording (Start button still required)

---

### US-DSR-02: Start Screen/Window Recording
**As a** browser user
**I want to** click Start Recording with "Screen / Window" selected
**So that** I can record my desktop or a specific application window

**Acceptance Criteria**:
- [ ] Clicking Start with "Screen / Window" selected invokes `getDisplayMedia`
- [ ] Browser shows its native screen/window picker
- [ ] After selecting a source, recording begins
- [ ] Popup shows "Recording..." status and Stop button
- [ ] Recording captures video from the selected screen or window

---

### US-DSR-03: Screen Recording Produces Same Output as Tab Recording
**As a** browser user (Maria, Dev)
**I want to** my screen recording to produce the same mp4 output as tab recordings
**So that** I get a universally playable file regardless of capture source

**Acceptance Criteria**:
- [ ] Stopping a screen/window recording produces an mp4 download
- [ ] Downloaded file follows same naming convention: `broshow-YYYY-MM-DD-HHmmss.mp4`
- [ ] mp4 is playable in VLC and QuickTime without conversion
- [ ] WebM fallback works for screen recordings just as it does for tab recordings

---

## Slice 2: Persistence & Polish

### US-DSR-04: Persist Source Selection
**As a** browser user
**I want to** my source choice to be remembered
**So that** I don't have to re-select it every time I open the popup

**Acceptance Criteria**:
- [ ] Selected source is saved to `chrome.storage.local` on change
- [ ] On popup open, saved selection is restored
- [ ] If no saved selection exists, defaults to "This Tab"

---

### US-DSR-05: Disable Source Selector During Recording
**As a** browser user
**I want to** not accidentally change the source while recording
**So that** my recording is not interrupted

**Acceptance Criteria**:
- [ ] Source selector is disabled when state is `recording` or `processing`
- [ ] Source selector re-enables when state returns to `idle`

---

### US-DSR-06: Handle Unexpected Stream End
**As a** browser user
**I want to** still get my recording if the captured window is closed
**So that** I don't lose what was already captured

**Acceptance Criteria**:
- [ ] Extension listens for MediaStream `ended` / track `ended` events
- [ ] On unexpected end, recording auto-stops
- [ ] Captured data is processed and downloaded normally
- [ ] Popup returns to idle state

---

## Slice 3: Graceful Degradation

### US-DSR-07: Hide Screen Option When Unsupported
**As a** browser user on an older browser
**I want to** not see options that don't work
**So that** I'm not confused by broken functionality

**Acceptance Criteria**:
- [ ] On popup load, check if `getDisplayMedia` is available
- [ ] If unavailable, hide "Screen / Window" option entirely
- [ ] Extension works normally in tab-only mode
- [ ] No errors logged for missing API
