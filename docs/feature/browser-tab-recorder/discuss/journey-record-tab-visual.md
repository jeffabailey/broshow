# Journey Map: Record a Browser Tab

## Happy Path

```
┌─────────┐    ┌──────────┐    ┌───────────┐    ┌──────────┐    ┌──────────┐
│ INSTALL  │───▶│  CLICK   │───▶│ RECORDING │───▶│   STOP   │───▶│  SAVED   │
│Extension │    │  Icon    │    │  Active   │    │ Recording│    │  as mp4  │
└─────────┘    └──────────┘    └───────────┘    └──────────┘    └──────────┘
  "That's it?"  "Let's go"    "It's working"   "Done"         "That was easy"
   Curious       Confident     Assured          Satisfied       Delighted
```

## Steps

### 1. Install Extension
- **Action**: User installs from Chrome Web Store / loads unpacked
- **Sees**: Extension icon appears in toolbar
- **Feels**: Curious → reassured (no scary permissions dialog)
- **Shared artifact**: Extension icon in toolbar

### 2. Click Extension Icon
- **Action**: User clicks the extension icon on toolbar
- **Sees**: Small popup with a "Start Recording" button (and optional: include tab audio toggle)
- **Feels**: Confident — it's just one button
- **Shared artifact**: Popup UI with record button

### 3. Recording Active
- **Action**: Recording begins immediately after click
- **Sees**: Extension icon changes to indicate recording (red dot or pulsing). Browser shows tab-sharing indicator.
- **Feels**: Assured — clear visual feedback that recording is happening
- **Shared artifact**: Recording indicator on icon, browser's native sharing indicator

### 4. Stop Recording
- **Action**: User clicks extension icon again or clicks "Stop" in popup
- **Sees**: Popup shows "Processing..." briefly, then triggers download
- **Feels**: Satisfied — quick turnaround
- **Shared artifact**: Stop button in popup

### 5. File Saved
- **Action**: Browser downloads the mp4 file
- **Sees**: mp4 file in downloads with a sensible filename (e.g., `tab-recording-2026-03-22.mp4`)
- **Feels**: Delighted — universal format, no conversion needed
- **Shared artifact**: Downloaded mp4 file

## Error Paths

| Step | Error | Recovery |
|------|-------|----------|
| 2 | User denies tab capture permission | Show message: "Permission needed to record this tab" with retry |
| 3 | Tab navigates away during recording | Continue recording the tab (follows navigation within same tab) |
| 3 | Tab is closed during recording | Stop recording, save what was captured, notify user |
| 5 | WebM-to-mp4 conversion fails | Fall back to saving as WebM with explanation |
