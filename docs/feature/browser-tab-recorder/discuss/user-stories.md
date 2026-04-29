# User Stories: browser-tab-recorder

## Walking Skeleton (Slice 1)

### US-01: Install Extension
**As a** browser user
**I want to** install the BroShow extension
**So that** the recording tool is available in my toolbar

**Job trace**: Primary Job (one-click tab recording)

**Acceptance Criteria**:
- [ ] Extension loads in Chrome/Brave without errors
- [ ] Extension icon appears in the browser toolbar
- [ ] Manifest V3 format, minimal permissions declared

---

### US-02: Start Tab Recording
**As a** browser user
**I want to** click a button to start recording the current tab
**So that** I can capture what's happening in the tab

**Job trace**: Primary Job, Job 2 (tutorials), Job 3 (live content), Job 4 (bug reports)

**Acceptance Criteria**:
- [ ] Clicking the extension icon opens a popup with a "Start Recording" button
- [ ] Clicking "Start Recording" triggers the browser's tab sharing prompt
- [ ] After granting permission, the tab's video and audio streams are captured
- [ ] MediaRecorder begins recording the captured stream

---

### US-03: Stop Tab Recording
**As a** browser user
**I want to** click a button to stop the recording
**So that** I can end the capture when I'm done

**Job trace**: Primary Job

**Acceptance Criteria**:
- [ ] While recording, the popup shows a "Stop Recording" button
- [ ] Clicking "Stop Recording" stops the MediaRecorder
- [ ] All recorded data chunks are collected

---

### US-04: Download as WebM (Skeleton)
**As a** browser user
**I want to** automatically receive my recording as a downloaded file
**So that** I have the recording saved locally

**Job trace**: Primary Job

**Acceptance Criteria**:
- [ ] After stopping, the recording is assembled into a blob
- [ ] A download is triggered automatically
- [ ] File is saved with a timestamped name

---

## Slice 2: Mp4 Output

### US-05: Convert Recording to Mp4
**As a** browser user
**I want to** receive my recording as an mp4 file
**So that** I can use it anywhere without format conversion

**Job trace**: Primary Job (push: output format hassles)

**Acceptance Criteria**:
- [ ] WebM recording is muxed to mp4 (H.264+AAC) client-side before download
- [ ] Conversion completes within reasonable time (< 2x recording duration)
- [ ] Output file plays correctly in VLC, QuickTime, and Windows Media Player

---

### US-06: WebM Fallback
**As a** browser user
**I want to** still get my recording if mp4 conversion fails
**So that** I never lose a recording due to a technical glitch

**Job trace**: Primary Job (anxiety: reliability)

**Acceptance Criteria**:
- [ ] If mp4 muxing throws an error, the WebM file is downloaded instead
- [ ] User sees a brief message explaining the fallback

---

## Slice 3: Polish

### US-07: Recording Indicator
**As a** browser user
**I want to** see a visual indicator that recording is active
**So that** I know the extension is working and don't forget to stop

**Job trace**: Primary Job (emotional: feel in control)

**Acceptance Criteria**:
- [ ] Extension icon changes appearance during recording (red badge or icon swap)
- [ ] Indicator clears when recording stops

---

### US-08: Tab Audio Capture
**As a** browser user
**I want to** include the tab's audio in my recording
**So that** my tutorials and captured content have sound

**Job trace**: Job 2 (tutorials), Job 3 (live content)

**Acceptance Criteria**:
- [ ] Audio from the recorded tab is included in the output file
- [ ] Audio and video remain in sync

---

### US-09: Sensible Filename
**As a** browser user
**I want to** my recording to have a descriptive filename
**So that** I can find it later in my downloads

**Job trace**: Primary Job

**Acceptance Criteria**:
- [ ] Filename follows pattern: `broshow-YYYY-MM-DD-HHmmss.mp4`
- [ ] Filename uses local timezone

---

## Slice 4: Cross-Browser

### US-10: Firefox Compatibility
**As a** Firefox user
**I want to** use BroShow in Firefox
**So that** I'm not locked into Chromium browsers

**Job trace**: Primary Job

**Acceptance Criteria**:
- [ ] Extension loads in Firefox using WebExtensions API
- [ ] Tab capture works via `browser.tabCapture` or equivalent
- [ ] Same UX as Chromium version
- [ ] If Firefox doesn't support `tabCapture`, document the limitation
