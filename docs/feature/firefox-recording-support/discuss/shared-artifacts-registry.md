# Shared Artifacts Registry: firefox-recording-support

Tracks every `${variable}` referenced in the Firefox journey and identifies its
single source of truth. Cross-references the existing browser-tab-recorder
registry where artifacts are inherited unchanged.

## Inherited (unchanged from Chrome journey)

| Artifact | Source of Truth | Consumers | Risk | Notes |
|---|---|---|---|---|
| `${broshowIcon}` | `src/icons/*` | Chrome toolbar, Firefox toolbar | LOW | Same icon assets, no fork. |
| `${version}` | `src/manifest.json` (version) | about:addons, Chrome Web Store, AMO listing | HIGH | Single manifest, patched per-target by `patch-firefox-manifest.mjs`. Patcher MUST NOT diverge the version. |
| `${recordButtonLabel}` | `src/popup-logic.ts` | Chrome popup, Firefox popup | MEDIUM | Identical labels across browsers (DoR check). |
| `${recordingState}` | `src/background-logic.ts` state machine | popup UI, REC badge, recording host | HIGH | One state machine drives both browsers. Forking it is a smell. |
| `${recBadge}` | `src/background.ts` (`setBadge`) | Chrome action badge, Firefox action badge | MEDIUM | Same `chrome.action.setBadgeText` API works on Firefox via WebExtension polyfill. |
| `${downloadedFilename}` | `src/filename-generator.ts` | Chrome downloads, Firefox downloads | HIGH | US-09 pattern unchanged: `broshow-YYYY-MM-DD-HHmmss.{mp4,webm}`. |
| `${containerFormat}` | mp4-mux outcome in `src/offscreen-logic.ts` (or its Firefox equivalent) | filename extension, fallback notice copy | HIGH | ADR-002 still in effect. WebM fallback path (US-06) reused. |

## New (Firefox-specific)

| Artifact | Source of Truth | Consumers | Risk | Notes |
|---|---|---|---|---|
| `${browserHint}` | `src/popup-logic.ts` (NEW: per-browser hint resolver) | Firefox popup only | MEDIUM | MUST be hidden on Chrome. Resolver detects browser via the existing capability probe, not user-agent sniffing. |
| `${capturedSurface}` | `MediaStreamTrack.getSettings().displaySurface` ('browser'\|'window'\|'monitor') | recording host (start), filename generator (informational only) | LOW | We do not modify behavior based on surface type; we only log/display it. |
| `${audioCaptured}` | Recording host: presence of an audio track in the MediaStream returned by `getDisplayMedia` | popup success message ("Audio was not captured" line) | MEDIUM | Driven by the user's "Share audio" choice in Firefox's picker. |

## Integration Risks

### HIGH RISK: Recording host lifetime
**Symptom**: A Firefox recording dies before the user clicks Stop because the host context (popup / background.scripts / record-tab) was unloaded.
**Why this is shared-artifact territory**: `${recordingState}` is the artifact. If the host dies, the state machine on the service-worker side has no observer to drive transitions. The whole journey breaks at Step 3.
**Resolution owner**: solution-architect (DESIGN wave). Captured as DQ-1 in `wave-decisions.md`.

### HIGH RISK: Capability probe drift
**Symptom**: A browser slips past the probe and shows "Start Recording" but recording fails silently (no surface stream, no error).
**Why**: The probe in `src/popup.ts` currently checks `chrome.offscreen` and `chrome.tabCapture`. After this feature, the probe must ALSO accept `navigator.mediaDevices.getDisplayMedia` as a valid path on Firefox.
**Resolution**: New AC (US-FF-01) — probe accepts EITHER the Chromium path OR the Firefox path; rejects everything else.

### MEDIUM RISK: Hint visibility leakage
**Symptom**: Firefox hint shows up on Chrome (or vice versa).
**Why**: A naive boolean might leak across browsers if the resolver is misimplemented.
**Resolution**: Probe is the single source of truth for which path the popup is using; hint is computed from the probe result, not from a separate flag.

### MEDIUM RISK: Filename pattern fork
**Symptom**: Firefox files use a different pattern than Chrome files.
**Why**: A Firefox-specific code path might re-implement filename generation.
**Resolution**: filename-generator.ts MUST remain the single source. Firefox host calls the same generator.

## Validation Checks (for DESIGN handoff)

- [ ] Every `${variable}` in Firefox TUI mockups maps to an entry above.
- [ ] No duplicate sources of truth between Chrome and Firefox paths.
- [ ] State machine (`background-logic.ts`) is not forked between browsers.
- [ ] Filename generator is not forked.
- [ ] mp4-mux + WebM fallback path is reused, not reimplemented.
- [ ] Capability probe accepts both paths and only blocks browsers that match neither.
