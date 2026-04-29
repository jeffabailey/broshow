# Story Map: firefox-recording-support

## User: Maria — Firefox-first developer who installed BroShow v0.1.2 hoping it would record on Firefox

## Goal: Click Start Recording on Firefox and end up with a downloaded mp4 (or webm fallback)

## Backbone

| Install Add-on | Open Popup | Pick Surface | Record | Stop | Download |
|---|---|---|---|---|---|
| Capability probe accepts Firefox path | Show Firefox-specific hint | Invoke `getDisplayMedia` | Host MediaRecorder so it survives popup blur | Stop via popup OR Firefox native control | Save as mp4 (webm fallback) |
| (Existing) Manifest patched by `patch-firefox-manifest.mjs` | (Existing) Same Start button | Handle picker cancel as no-op | REC badge during recording | `track.ended` triggers download flow | Same filename pattern as Chrome |
|  |  | Handle "Share audio" off | (Stretch) recording-time elapsed indicator |  | (Stretch) "Audio not captured" success note |

---

### Walking Skeleton (thinnest end-to-end Firefox slice)

The minimum slice that produces ONE downloadable file on Firefox:

1. **Install Add-on**: probe accepts Firefox path -> popup is interactive (not "not supported").
2. **Open Popup**: same Start button (hint can come later).
3. **Pick Surface**: `getDisplayMedia` invoked from a host that survives long enough to record.
4. **Record**: MediaRecorder runs against the picked stream.
5. **Stop**: popup Stop button works.
6. **Download**: file saved (webm or mp4 — either is acceptable for the skeleton; mp4 is the Release-1 outcome).

Walking skeleton stories: US-FF-01 + US-FF-02 + US-FF-03 + US-FF-05.

### Release 1: "Firefox users can record" (Walking Skeleton + mp4 parity)

Targets KPI: Firefox-recording-success-rate >= 95% (parity with Chrome).

- US-FF-01: Capability probe accepts Firefox recording path
- US-FF-02: Surface picker bootstrap on Firefox
- US-FF-03: Recording host survives a 5-minute recording without popup interaction
- US-FF-04: Firefox popup hint sets surface-picker expectation
- US-FF-05: Stop and download produce the same mp4-or-webm output as Chrome

### Release 2: "Polish" (post-skeleton enhancements)

Targets KPI: Firefox-recording-quality-parity (audio note clarity, native-stop parity).

- US-FF-06: Stopping via Firefox native "Stop sharing" matches Stop button behavior
- US-FF-07: "Audio not captured" success note when user declines share-audio

### Out of Scope (deferred)

- Firefox-specific picker styling (we cannot style it).
- Auto-retry on picker cancel (cancel is a normal outcome, not an error).
- Surface-type-aware filenames (the filename does not need to know it was a tab vs window vs screen).

---

## Scope Assessment: PASS

- 7 user stories
- 1 bounded context (the existing browser-tab-recorder feature)
- 4 integration points (capability probe, recording host bootstrap, state machine, download path)
- Estimated total effort: ~5-7 days
- One coherent user outcome: "I can record on Firefox"

This is right-sized. No splitting required. Walking skeleton (5 stories) is itself releasable.
