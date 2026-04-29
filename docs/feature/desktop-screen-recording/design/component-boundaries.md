# Component Boundaries: desktop-screen-recording

## Changes from browser-tab-recorder

This feature modifies 4 of 5 existing components and adds no new components. The mp4 wrapper (`src/mp4.ts`) is unchanged.

## Components

### 1. Popup UI (`src/popup.ts`, `src/popup-logic.ts`, `src/popup.html`, `src/popup.css`)

**New responsibility**: Source selection (tab / screen toggle), persisting choice
**Existing responsibility**: Render recording controls, display state (unchanged)

**Changes**:
- `popup.html`: Add source selector UI (radio group or toggle)
- `popup-logic.ts`:
  - New pure function: `describeCaptureUI(getDisplayMediaSupported: boolean)` → whether to show selector
  - Update `describeUI` to include selector disabled state during recording
  - Update `messageForAction` to include `captureMode` in start message
- `popup.ts`:
  - Read `broshow:capture-mode` from `chrome.storage.local` on init
  - Write to storage on selector change
  - Check `navigator.mediaDevices.getDisplayMedia` existence for graceful degradation
  - For tab mode: call `chrome.tabCapture.getMediaStreamId()` as before
  - For screen mode: omit streamId from start message

**Boundary rule**: No direct media API calls. Source selector is a UI concern; actual stream acquisition happens in offscreen.

### 2. Service Worker (`src/background.ts`, `src/background-logic.ts`)

**New responsibility**: Route capture mode to offscreen document with correct offscreen reason
**Existing responsibility**: Recording lifecycle orchestration, state ownership (unchanged)

**Changes**:
- `background-logic.ts`:
  - `handleStartRecording`: Accept optional `captureMode` parameter
  - For `'screen'` mode: skip `getActiveTab()` call (no tab needed)
  - Pass `captureMode` through to offscreen message
  - Update `RecordingState` to carry `captureMode`
- `background.ts`:
  - `createOffscreenDocument`: Accept capture mode, use `DISPLAY_MEDIA` reason for screen, `USER_MEDIA` for tab

**Boundary rule**: No DOM access. Does not call `getDisplayMedia` — delegates to offscreen.

### 3. Offscreen Document (`src/offscreen.ts`, `src/offscreen-logic.ts`)

**New responsibility**: Acquire screen/window stream via `getDisplayMedia`
**Existing responsibility**: Media capture and mp4 muxing (unchanged after stream acquired)

**Changes**:
- `offscreen-logic.ts`:
  - New pure function: `buildDisplayMediaConstraints()` → `DisplayMediaStreamOptions`
  - Update `handleStart` to branch on capture mode:
    - `'tab'`: `getUserMedia(buildMediaConstraints(streamId))` (existing)
    - `'screen'`: `getDisplayMedia(buildDisplayMediaConstraints())` (new)
  - Add stream track `ended` event handler for auto-stop on source loss
- `offscreen.ts`:
  - Inject `getDisplayMedia` as a dependency alongside `getUserMedia`
  - Wire track ended events to auto-stop logic

**Boundary rule**: Pure media processing. No chrome extension API calls except `chrome.runtime.sendMessage`.

### 4. Shared Types (`src/types.ts`)

**New responsibility**: `CaptureMode` type and updated message types
**Existing responsibility**: Type definitions (unchanged)

**Changes**:
- Add `CaptureMode = 'tab' | 'screen'`
- Update `PopupToSW` `start-recording` variant: add `captureMode`, make `streamId` optional
- Update `SWToOffscreen` `offscreen-start` variant: add `captureMode`, make `streamId` optional
- Update `RecordingState` `recording` variant: split into tab/screen discriminants

**Boundary rule**: Types only — no runtime code.

### 5. Mp4 Wrapper (`src/mp4.ts`) — NO CHANGES

The mp4 muxing pipeline is source-agnostic. It receives a WebM blob and produces an mp4 blob regardless of whether the source was a tab or screen.

## Updated Dependency Diagram

```
popup.ts ──msg──▶ background.ts ──msg──▶ offscreen.ts
    │                  │                      │
    │  storage.local   │                      ├── mp4.ts
    │  (capture-mode)  │                      │     │
    │                  │                      │     └── mp4-mux (npm)
    └── types.ts ◀─────┘                      │
                                              ├── getUserMedia (tab path)
                                              └── getDisplayMedia (screen path)
```

## Boundary Enforcement

- **No circular dependencies**: Message flow unchanged (popup → SW → offscreen → SW → popup)
- **No shared mutable state**: Each component has its own execution context
- **Types as the only shared code**: `types.ts` remains behavior-free
- **Stream acquisition is offscreen's concern**: Popup and SW never touch MediaStream objects
- **Storage is popup's concern**: Only popup reads/writes `broshow:capture-mode`; SW receives mode via message
