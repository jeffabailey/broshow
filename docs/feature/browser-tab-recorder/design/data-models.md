# Data Models: BroRecord

## Recording State

```typescript
type RecordingState =
  | { status: 'idle' }
  | { status: 'recording'; tabId: number; startTime: number }
  | { status: 'processing' }
```

## Messages (Popup ↔ Service Worker)

```typescript
type PopupToSW =
  | { type: 'start-recording' }
  | { type: 'stop-recording' }
  | { type: 'get-state' }

type SWToPopup =
  | { type: 'state-update'; state: RecordingState }
  | { type: 'error'; message: string }
  | { type: 'fallback-notice'; message: string }
```

## Messages (Service Worker ↔ Offscreen)

```typescript
type SWToOffscreen =
  | { type: 'offscreen-start'; streamId: string }
  | { type: 'offscreen-stop' }

type OffscreenToSW =
  | { type: 'offscreen-result'; blobUrl: string; format: 'mp4' | 'webm' }
  | { type: 'offscreen-error'; error: string; fallbackBlobUrl?: string }
```

## Union Message Type

```typescript
type Message = PopupToSW | SWToPopup | SWToOffscreen | OffscreenToSW
```

## Download Metadata

```typescript
type DownloadInfo = {
  url: string           // blob: URL
  filename: string      // e.g., "brorecord-2026-03-22-143052.mp4"
  mimeType: string      // "video/mp4" or "video/webm"
}
```
