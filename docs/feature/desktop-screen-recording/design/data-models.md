# Data Models: desktop-screen-recording

## New Type: CaptureMode

```typescript
export type CaptureMode = 'tab' | 'screen';
```

## Updated: RecordingState

```typescript
export type RecordingState =
  | { readonly status: 'idle' }
  | { readonly status: 'recording'; readonly captureMode: 'tab'; readonly tabId: number; readonly startTime: number }
  | { readonly status: 'recording'; readonly captureMode: 'screen'; readonly startTime: number }
  | { readonly status: 'processing' };
```

**Change**: The `recording` variant splits into two discriminants based on `captureMode`. Screen recording has no `tabId` since it's not tied to a specific tab.

## Updated: PopupToSW Messages

```typescript
export type PopupToSW =
  | { readonly type: 'start-recording'; readonly captureMode: CaptureMode; readonly streamId?: string }
  | { readonly type: 'stop-recording' }
  | { readonly type: 'get-state' };
```

**Change**: `start-recording` now carries `captureMode`. `streamId` is optional — present for tab capture, absent for screen capture.

## Updated: SWToOffscreen Messages

```typescript
export type SWToOffscreen =
  | { readonly type: 'offscreen-start'; readonly captureMode: CaptureMode; readonly streamId?: string }
  | { readonly type: 'offscreen-stop' };
```

**Change**: `offscreen-start` carries `captureMode` so offscreen knows which stream acquisition path to use. `streamId` is optional.

## Unchanged Types

These types require no changes:

- `SWToPopup` — state updates, errors, and fallback notices work for both capture modes
- `OffscreenToSW` — offscreen result/error messages are source-agnostic
- `Message` — union of all message types (auto-updated by constituent changes)

## Storage Schema

| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `broshow:capture-mode` | `CaptureMode` | `'tab'` | User's preferred capture source |
| `broshow:recording-data` | `string` (data URL) | — | Recording blob for SW download (existing) |

## Display Media Constraints

```typescript
// Pure function in offscreen-logic.ts
const buildDisplayMediaConstraints = (): DisplayMediaStreamOptions => ({
  video: true,
  audio: true,  // Request system audio if available
});
```

Note: `getDisplayMedia` with `audio: true` will capture system audio on supported platforms. The browser picker shows whether audio is included. This is a best-effort request — if audio is unavailable, video-only recording proceeds.
