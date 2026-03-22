# Component Boundaries: BroRecord

## Components

### 1. Popup UI (`src/popup.ts`, `src/popup.html`, `src/popup.css`)

**Responsibility**: Render recording controls, display state
**Owns**: Nothing (stateless — queries service worker on open)
**Depends on**: Service Worker (via messages)
**Boundary rule**: No direct browser API calls except `chrome.runtime.sendMessage`

### 2. Service Worker (`src/background.ts`)

**Responsibility**: Recording lifecycle orchestration, state ownership
**Owns**: `RecordingState`, badge indicator
**Depends on**: Chrome APIs (`tabCapture`, `offscreen`, `downloads`, `action`), Offscreen Document (via messages)
**Boundary rule**: No DOM access (service workers can't). Delegates all MediaRecorder work to offscreen.

### 3. Offscreen Document (`src/offscreen.ts`, `src/offscreen.html`)

**Responsibility**: Media capture and mp4 muxing
**Owns**: `MediaRecorder` instance, recorded chunks, mp4 muxer
**Depends on**: `mp4-mux` library, browser media APIs
**Boundary rule**: No chrome extension API calls except `chrome.runtime.sendMessage`. Pure media processing.

### 4. Shared Types (`src/types.ts`)

**Responsibility**: Type definitions shared across all components
**Owns**: Message types, state types
**Depends on**: Nothing
**Boundary rule**: Types only — no runtime code, no side effects

### 5. Mp4 Wrapper (`src/mp4.ts`)

**Responsibility**: Wrap `mp4-mux` library for WebM→mp4 conversion
**Owns**: Muxing pipeline
**Depends on**: `mp4-mux` npm package
**Boundary rule**: Pure function: `(webmBlob: Blob) => Promise<Blob>`. No extension API awareness.

## Dependency Diagram

```
popup.ts ──msg──▶ background.ts ──msg──▶ offscreen.ts
    │                  │                      │
    └── types.ts ◀─────┘                      ├── mp4.ts
                                              │     │
                                              │     └── mp4-mux (npm)
                                              │
                                              └── MediaRecorder (browser)
```

## Boundary Enforcement

- **No circular dependencies**: Messages flow popup → service worker → offscreen → service worker → popup
- **No shared mutable state**: Each component has its own execution context
- **Types as the only shared code**: `types.ts` is imported by all three but contains no behavior
