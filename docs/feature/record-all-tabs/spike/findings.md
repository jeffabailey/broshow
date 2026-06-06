# SPIKE Findings — record-all-tabs

**Date:** 2026-06-06
**Assumption under test (UNKNOWN-1):** On Chromium MV3, can capture switch to a
newly-activated tab mid-recording — i.e. can a `tabs.onActivated` handler in the
service worker mint a new capture source — **without a fresh user gesture**, and
yield a single continuous file (UNKNOWN-2)?

---

## ⚠️ Evidence basis (honesty note)

The live throwaway-extension run **did not complete**. Current Chrome (148) blocks
every programmatic path to *loading/driving* an unpacked extension that I tried:

- `--load-extension` is disabled by default; `--disable-features=DisableLoadExtensionCommandLineSwitch` no longer re-enables it in 148.
- `/json/new` (open-tab-over-HTTP) is disabled.
- Browser-level CDP WebSocket is origin-gated (`--remote-allow-origins`).
- A manually-loaded copy landed in the user's everyday Chrome, not the debug
  instance my CDP could reach (`developerPrivate.getExtensionsInfo` → `[]` there).

So the verdict below is **evidence-based (high confidence), not live-measured.**
It rests on (a) documented Chromium `tabCapture` behavior and (b) the **production
BroShow capture architecture** surfaced during the session (`offscreen.js` bundle:
`createRecordingSession` / `createWebCodecsPipeline` / `mediaAPIs.getUserMedia`).
A 5-minute manual confirmation (load the probe at `/tmp/spike_record-all-tabs`,
click ▶, switch tabs, read the `PROBE[UNKNOWN-1]` line) is still available if DESIGN
wants certainty before committing — see "Recommended confirmation" below.

---

## Verdict

**The feature as specified in DISCUSS (D1: a tab-scoped, continuous, single file
that auto-follows the active tab) has NO clean Chromium primitive.** Each candidate
mechanism fails the D1 intent:

| Mechanism | Auto-follows active tab? | Tab-scoped (no browser chrome)? | Verdict |
|---|---|---|---|
| **A. `tabCapture.getMediaStreamId` per switch** (SW on `onActivated`) | Would need a NEW streamId per switch | Yes | ❌ **Blocked** — `tabCapture` requires a user gesture / extension invocation; an `onActivated` handler has no user activation. Minting a follow streamId from the SW on tab switch is not permitted. (High confidence; not live-verified.) |
| **B. `getDisplayMedia({video:{displaySurface:'browser'\|'tab'}})`** | ❌ No — locks to the *chosen* tab; keeps capturing it even after you switch away | Yes | ❌ Doesn't follow. Already partially wired as the production `getUserMedia` fallback, but it pins to one tab. |
| **C. `getDisplayMedia` window/monitor surface** | ✅ Visually yes (captures the window's pixels) | ❌ No — includes the browser toolbar/tab strip; = recording the browser window | ❌ Violates D1 (that's `desktop-screen-recording`, explicitly out of scope). |
| **D. Per-switch gesture** (user re-confirms each tab) | ✅ | Yes | ⚠️ Mechanically possible but destroys the UX the job asked for ("one take," "follow my eyes"). |

**Conclusion:** UNKNOWN-1 ≈ **DOESN'T WORK** (no-gesture follow is blocked), and
even setting it aside, no mechanism delivers *tab-scoped + auto-follow + single
file* together. The continuity mechanism (UNKNOWN-2, canvas-capture pipeline) is
sound in principle, but it's moot if no mechanism can supply the per-tab source
without a gesture.

---

## Why mechanism A is blocked (detail)

- `chrome.tabCapture` is gated on the extension being *invoked* (action click /
  user gesture) for the tab being captured. The production popup acquires the
  streamId inside the popup's gesture context (`src/popup.ts:70-79`) precisely
  because of this.
- A `tabs.onActivated` listener fires from a browser event, carrying **no user
  activation**. Calling `getMediaStreamId({targetTabId})` there for the freshly
  activated tab is the exact case the gating rejects.
- The production pipeline compounds it: `createWebCodecsPipeline(stream)` binds a
  `MediaStreamTrackProcessor` to **one** track at start. Following would require
  re-piping the encoder input to a new track mid-recording — a non-trivial change
  even if a new source could be acquired.

## What the production architecture tells us (from the pasted `offscreen.js`)

- Single-`streamId` model: offscreen starts from one `streamId` (URL param or
  `offscreen-start` message). There is no notion of switching source.
- Existing fallback chain `tab capture → getDisplayMedia → getUserMedia` means
  mechanism B is low-effort to reach — but B doesn't follow tabs, so it doesn't
  satisfy D1.
- WebCodecs + mp4-muxer for mp4, MediaRecorder/webm fallback. A canvas
  re-compositing layer (for continuity across a source swap) does **not** exist
  today and would be net-new.

---

## Design implications (for DESIGN / back to DISCUSS)

1. **D1 is likely infeasible as written.** "Tab-scoped, auto-follow, single
   continuous file" has no supporting Chromium primitive without per-switch
   gestures. This should go back to DISCUSS (see `upstream-issues.md`).
2. **Realistic reframings** (pick in DISCUSS):
   - **R1 — Window-surface "follow" (accept browser chrome):** use `getDisplayMedia`
     window surface; it visually follows tab switches but records the whole browser
     window. Re-scopes the feature toward "record my browser window." Overlaps
     `desktop-screen-recording`.
   - **R2 — Gesture-per-tab "segments":** keep tab-scoped capture; each tab switch
     is a deliberate user action that starts a new segment; BroShow stitches
     segments into one file at stop. Honest about the gesture; still "one file."
   - **R3 — Multi-tab as separate files (the OTHER `/nw:new` interpretation):**
     concurrent per-tab recordings, one mp4 each. Sidesteps follow entirely.
3. **Continuity tech (canvas-capture) is viable** and reusable for R1/R2 if/when a
   source-swap path exists — but it's net-new code, not in production today.
4. **Testability constraint (new):** acceptance/E2E for any capture-following
   behavior cannot use plain CDP — Chrome 148 blocks CLI/CDP extension loading.
   DISTILL/DELIVER must plan for a Puppeteer/Playwright **persistent-context**
   harness (headed, `--load-extension` via the test runner) or a human-in-loop
   manual gate. This is a real cost to budget.

---

## Recommended confirmation (optional, ~5 min)

If DESIGN wants UNKNOWN-1 verified empirically before accepting the pivot:
load `/tmp/spike_record-all-tabs` via `chrome://extensions` → Developer mode →
Load unpacked, open its **service worker** console, click the probe's ▶, switch
tabs, and read the single `PROBE[UNKNOWN-1] ✅/❌` line. Expected: ❌ THREW on the
no-gesture follow. (The probe is built to isolate exactly this.)

---

## Promoted?

**No — PIVOT (2026-06-06).** The probe verdict is "doesn't work as specified," so
no walking skeleton was produced. The user reframed the feature to **R1-cropped**
(window-surface capture + user-drawn crop region, which follows the active tab and
hides browser chrome). See `wave-decisions.md` (promotion-gate decision) and
`upstream-issues.md` (D1 → D1′ reconciliation). Probe code deleted post-pivot.
