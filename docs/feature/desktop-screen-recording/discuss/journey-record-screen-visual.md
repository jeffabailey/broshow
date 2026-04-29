# Journey: Record Screen or Window

## Overview
User opens BroShow, selects a capture source (tab, screen, or window), records, and downloads the mp4.

## Journey Map

```
Step 1          Step 2              Step 3          Step 4          Step 5          Step 6
OPEN POPUP  ->  CHOOSE SOURCE  ->  GRANT PERM  ->  RECORDING   ->  STOP & PROCESS -> DOWNLOAD

[Click icon]    [Tab | Screen]      [Browser         [Content       [Click Stop]     [Auto-download]
                                    picker]          captured]

Emotion:        Emotion:            Emotion:         Emotion:       Emotion:         Emotion:
Neutral         Curious/            Brief tension    Confident      Anticipation     Satisfied
                Empowered           (will it work?)  (indicator                      (got my file)
                                                     shows active)
```

## Steps Detail

### Step 1: Open Popup
- **Action**: User clicks BroShow extension icon
- **UI**: Popup opens showing source selection and record button
- **Artifact**: `${popup-state}` = idle with source selector visible

### Step 2: Choose Source
- **Action**: User selects capture mode: "This Tab" or "Screen / Window"
- **UI**: Toggle or radio group with two options, defaulting to "This Tab" (preserves existing behavior)
- **Artifact**: `${capture-mode}` = 'tab' | 'screen'
- **Note**: Selection persists across popup opens via `chrome.storage.local`

### Step 3: Grant Permission
- **Action**: Browser shows native permission prompt
- **For Tab**: Chrome tab-sharing prompt (existing flow)
- **For Screen**: `getDisplayMedia` picker showing screens and windows
- **Artifact**: `${stream-id}` (tab) or `${media-stream}` (screen)
- **Error path**: User cancels -> return to idle with "Permission denied" message

### Step 4: Recording Active
- **Action**: MediaRecorder captures the selected source
- **UI**: Button changes to "Stop Recording", status shows "Recording..."
- **Artifact**: `${recording-state}` = recording
- **Note**: For screen/window capture, recording continues even if user switches tabs

### Step 5: Stop & Process
- **Action**: User clicks Stop, recording is muxed to mp4
- **UI**: Button disabled, status shows "Processing..."
- **Artifact**: `${recording-blob}` -> mp4 muxing pipeline

### Step 6: Download
- **Action**: mp4 file auto-downloads
- **UI**: Returns to idle with source selector
- **Artifact**: `${filename}` = `broshow-YYYY-MM-DD-HHmmss.mp4`

## Error Paths

| Error | Step | Recovery |
|-------|------|----------|
| Permission denied | 3 | Return to idle, show message |
| Stream ends unexpectedly | 4 | Auto-stop, process what was captured |
| getDisplayMedia not supported | 3 | Hide "Screen / Window" option, show tab-only |
| mp4 muxing fails | 5 | Fall back to WebM download |

## Key Difference from Tab Recording

The existing tab recording journey is **unchanged** — this adds a branching point at Step 2. Users who never touch the selector get the same one-click experience. The new path diverges at the permission prompt (Step 3) and reconverges at recording (Step 4).
