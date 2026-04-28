# KPI Instrumentation: BroShow

For each KPI in `outcome-kpis.md`, this document specifies:
- **Event** — what fires
- **Logged** — what gets written (to local log per `observability-design.md`)
- **Stored** — where the measurement lives
- **Retrieval** — how the developer or user reads it
- **CI invariant?** — whether CI asserts it as a hard gate

`recordingId` is a UUID generated at `recording.start` and threaded through every event for that recording.

---

## Primary Outcomes

### KPI: Recording success rate >= 95%

| Field | Value |
|-------|-------|
| Event | `recording.start`, `recording.complete`, `recording.error` |
| Logged | `{ source: 'background', event: 'recording.start' \| 'recording.complete' \| 'recording.error', data: { recordingId, durationMs?, errorCode? } }` |
| Stored | `chrome.storage.local` log ring buffer (logger module) |
| Retrieval | User exports logs; developer counts `recording.complete` / (`recording.complete` + `recording.error`) |
| CI invariant? | **Indirect** — Playwright acceptance tests cover the primary success path (must pass = success path works). No CI assertion on aggregate rate (no aggregate exists). |
| Where instrumented | `src/background.ts` recording-lifecycle handlers |

### KPI: Time to first recording < 30 seconds

| Field | Value |
|-------|-------|
| Event | `extension.installed`, `recording.complete` (first one) |
| Logged | `extension.installed`: `{ source: 'background', event: 'extension.installed', data: { ts } }` (fired from `chrome.runtime.onInstalled` listener for `reason === 'install'`); `recording.complete`: as above |
| Stored | `chrome.storage.local` log ring buffer; also a one-shot `firstRecordingMs` field (`installTs - firstCompleteTs`) computed and stored once on the first complete |
| Retrieval | Developer reads `firstRecordingMs` from exported logs |
| CI invariant? | **Indirect** — Playwright acceptance test that simulates install → click → start → stop → download SHOULD complete in well under 30s in CI (target: < 10s). Test asserts the test's own duration < 30s as a soft proxy. The "real" measurement requires a fresh install in a real browser, which only manual QA can validate. |
| Where instrumented | `src/background.ts` `onInstalled` handler + first-recording bookkeeping |

### KPI: User steps to record <= 3 clicks

| Field | Value |
|-------|-------|
| Event | UI shape, not a runtime event |
| Logged | n/a — measured by inspecting the UI |
| Stored | n/a |
| Retrieval | Acceptance test |
| CI invariant? | **YES** — Playwright acceptance test asserts: (1) the popup contains exactly one primary action button at any moment, (2) the recording flow requires no configuration step, (3) the click sequence to obtain an mp4 is `[icon, Start, Stop]` (3 user-initiated clicks; the download is automatic). |
| Where instrumented | `tests/acceptance/walking-skeleton.spec.ts` (extend if needed) |

---

## Quality Outcomes

### KPI: Mp4 conversion success rate >= 90%

| Field | Value |
|-------|-------|
| Event | `mp4.start`, `mp4.ok`, `mp4.fallback`, `mp4.fail` |
| Logged | `{ source: 'offscreen', event: 'mp4.ok' \| 'mp4.fallback' \| 'mp4.fail', data: { recordingId, inputBytes, outputBytes?, errorCode? } }` |
| Stored | log ring buffer; also reflected in `lastRecording.outcome` (`'ok' | 'fallback-webm' | 'error'`) for the in-extension health surface |
| Retrieval | User exports logs; developer counts `mp4.ok` / (`mp4.ok` + `mp4.fallback` + `mp4.fail`) |
| CI invariant? | **Indirect** — Acceptance test asserts the happy path produces an mp4 (not a WebM fallback) under normal conditions. No CI assertion on aggregate rate. |
| Where instrumented | `src/offscreen.ts` mux pipeline; `src/mp4.ts` outcome reporting |

### KPI: A/V drift < 100ms

| Field | Value |
|-------|-------|
| Event | `mp4.ok` carries an `avDriftMs` field |
| Logged | `data.avDriftMs: number` — computed during muxing as `max(audioTimestamp - videoTimestamp)` across the muxed sequence (or whatever metric `mp4-muxer` exposes; if it does not, instrument by sampling `MediaRecorder` `dataavailable` timestamps from the audio track vs video track) |
| Stored | log ring buffer |
| Retrieval | Developer reads `avDriftMs` from exported logs after a recording session |
| CI invariant? | **Acceptance test** — record a known-good test page (`tests/fixtures/test-page-audio.html` exists) for ~5 seconds in CI, then post-process the resulting mp4 to extract the A/V drift. If extraction proves complex, accept this as a manual-validation KPI and note it. **Recommend: log it always; assert in CI when feasible.** |
| Where instrumented | `src/mp4.ts` muxer output → emits `mp4.ok` with `avDriftMs` |

### KPI: Output plays in VLC / QuickTime / Windows Media Player (100%)

| Field | Value |
|-------|-------|
| Event | n/a — runtime cannot validate this without those players |
| Logged | n/a |
| Stored | n/a |
| Retrieval | Manual QA per release |
| CI invariant? | **Proxy assertion** — CI runs the produced mp4 through a structural validator (e.g., `mp4-muxer`'s own output validation, or `ffprobe` if added as a CI-only dev dependency) to confirm well-formed mp4 boxes. Full player validation remains a manual pre-release step; results recorded in the release checklist (see `branching-strategy.md` release lifecycle). |
| Where instrumented | CI: optional `ffprobe`-based smoke check on the mp4 produced by an acceptance test |

---

## Trust Outcomes

### KPI: Network requests made = 0

| Field | Value |
|-------|-------|
| Event | `page.on('request')` callback in Playwright |
| Logged | n/a at runtime — runtime cannot observe its own non-network |
| Stored | CI test report |
| Retrieval | CI log |
| CI invariant? | **YES — HARD GATE.** Acceptance test attaches `page.on('request', req => requests.push(req.url()))` to every page (popup, offscreen, any tab opened during the test) and asserts that no request URL has scheme `http:` or `https:` outside the extension's own `chrome-extension://` origin. This is the single most important KPI gate. |
| Where instrumented | All `tests/acceptance/*.spec.ts` via a shared fixture (`tests/acceptance/fixtures/no-network.ts` to be created or wired into existing setup). |
| Notes | The assertion must allow `chrome-extension://`, `blob:`, `data:`, and `about:blank` schemes; deny everything else. Failure is a privacy regression and blocks merge. |

### KPI: Permissions requested <= 4

| Field | Value |
|-------|-------|
| Event | n/a — manifest is static |
| Logged | n/a |
| Stored | `src/manifest.json` |
| Retrieval | CI step reads file, counts `permissions` array length |
| CI invariant? | **YES — HARD GATE.** See `ci-cd-pipeline.md` "Permission-count gate". `jq '.permissions \| length' src/manifest.json` must be `<= 4`. |
| Notes | **Currently failing**: manifest declares 6 permissions (`activeTab`, `tabs`, `tabCapture`, `offscreen`, `downloads`, `storage`). Authoritative target is 4: `tabCapture`, `offscreen`, `storage`, `downloads`. See `upstream-changes.md` UC-1 for history (the cap was raised from 3 to 4 on 2026-04-27 when DELIVER discovered the design's claim that `chrome.downloads.download()` works without the `downloads` permission for blob URLs was incorrect). |

### KPI: Extension size < 500KB (excl. mp4 muxer)

| Field | Value |
|-------|-------|
| Event | n/a — build artifact is static |
| Logged | n/a |
| Stored | `dist/` after `npm run build` |
| Retrieval | CI step measures `du -sb dist` minus the mp4-muxer chunk |
| CI invariant? | **YES — HARD GATE.** See `ci-cd-pipeline.md` "Size-budget gate". |
| Notes | The exclusion of the mp4 muxer must be precise. Recommended approach: configure esbuild to emit `mp4-muxer` as a separately-named chunk (e.g., via `splitting: true` or by importing it from a known wrapper file) so the size step can identify and subtract it deterministically. Until that's wired, the heuristic in the CI snippet (filename pattern match) is acceptable for v0.1.x. |

---

## Cross-cutting: `recordingId` correlation

Generated in `src/background.ts` at the moment of `chrome.tabCapture.getMediaStreamId` success. Threaded through:

- All `recording.*` events (background)
- `offscreen-start` message payload (so offscreen knows it)
- All `mp4.*` events (offscreen)
- `lastRecording` record (storage)

This is the single piece of correlation glue that lets a developer reading exported logs reconstruct one recording's full lifecycle without ambiguity.

## Summary table

| KPI | Hard CI gate? | Runtime log? | Manual QA? |
|-----|---------------|--------------|------------|
| Recording success rate >= 95% | No | Yes | Recommended pre-release |
| Time to first recording < 30s | Soft (test duration proxy) | Yes (one-shot field) | Recommended pre-release on fresh profile |
| Steps to record <= 3 clicks | Yes (UI shape assertion) | No | No |
| Mp4 success rate >= 90% | No | Yes | Recommended pre-release |
| A/V drift < 100ms | Aspirational (if feasible) | Yes | Recommended pre-release |
| Plays in VLC/QT/WMP | Proxy (well-formed mp4) | No | **Required pre-release** |
| Network requests = 0 | **Yes** | No | No |
| Permissions <= 4 | **Yes** | No | No |
| Size < 500KB excl. muxer | **Yes** | No | No |
