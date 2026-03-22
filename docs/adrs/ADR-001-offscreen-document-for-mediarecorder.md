# ADR-001: Use Offscreen Document for MediaRecorder in MV3

## Status

Accepted

## Context

Manifest V3 service workers do not have access to DOM APIs. `MediaRecorder`, which is required to capture a `MediaStream` as recorded video, is a DOM API. We need a way to run `MediaRecorder` within the extension.

## Options Considered

### Option A: Offscreen Document (Selected)
Use `chrome.offscreen.createDocument()` to create a hidden page with DOM access. The offscreen document runs `MediaRecorder` and the mp4 muxer.

- **Pros**: Official Chrome API for this exact use case. Clean separation — service worker orchestrates, offscreen processes media. Works in Brave/Edge.
- **Cons**: Extra message-passing complexity. Offscreen documents have a limited lifetime (some browsers may close them after inactivity, though recording activity keeps them alive).

### Option B: Content Script Injection
Inject a content script into the recorded tab to run `MediaRecorder`.

- **Pros**: Has DOM access.
- **Cons**: Requires `activeTab` or broad host permissions. Content script runs in the tab's context, risks interference. Tab navigation kills the script. Poor separation of concerns.

### Option C: Side Panel
Use the side panel API to host `MediaRecorder`.

- **Pros**: Has DOM access, visible to user.
- **Cons**: User must keep side panel open during recording. Unexpected UX for a simple recording tool.

## Decision

**Option A: Offscreen Document**. It is the purpose-built MV3 solution for running DOM APIs in extensions. The message-passing overhead is minimal for our simple protocol (start, stop, result).

## Consequences

- Service worker communicates with offscreen document via `chrome.runtime.sendMessage`
- Offscreen document lifecycle managed by service worker (create on start, close after download)
- Firefox compatibility requires a different approach (Firefox supports background pages, not offscreen documents)
