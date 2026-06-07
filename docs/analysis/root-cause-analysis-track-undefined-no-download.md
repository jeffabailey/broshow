# Root Cause Analysis — `Cannot read properties of undefined (reading 'track')` + No Download

**Analyst:** Rex (Toyota 5-Whys RCA)
**Date:** 2026-06-07
**Repo:** `/Users/jeffbailey/Projects/foss/leading/broshow`
**Method:** Toyota 5-Whys, multi-causal, evidence-required. Code-evidence based (no live extension load — Chrome 148 blocks CLI/CDP unpacked loading; intentionally not pursued).

---

## 1. Problem Statement

On the shipped **0.2.18** extension, the console reportedly shows:

```
Uncaught TypeError: Cannot read properties of undefined (reading 'track')
    at (index):19529:1242   (frames c → T)
```

and clicking **Stop & Download** produces **no download**.

Two competing hypotheses must be disentangled:

- **H1 — Real production bug:** a genuine BroShow code path throws `reading 'track'` and suppresses the download for real users.
- **H2 — Environment artifact:** the symptom is specific to a test/CDP harness or a non-BroShow source, not a user-facing defect.

---

## 2. Reproducibility & Scope (established BEFORE 5-Whys)

### 2.1 Build is current and clean
- `npm run build` → exit 0, "Build complete: dist/" (no errors). `package.json` version is `0.2.19`; `dist/offscreen.js` mtime (1780783440) is newer than `src/` — bundles are current.

### 2.2 The download-path unit suite is fully green
`npx vitest run` on the Stop→mux→download path:
```
tests/unit/mp4.test.ts                         ✓ 1
tests/unit/offscreen.test.ts                   ✓ 13
tests/unit/offscreen-audio.test.ts             ✓ 4
tests/unit/regression-firefox-no-download.test.ts   ✓ 1
tests/unit/regression-firefox-stuck-processing.test.ts ✓ 4
tests/unit/background.test.ts                  ✓ 45
Test Files 6 passed (6) — Tests 68 passed (68)
```
`regression-firefox-no-download.test.ts` specifically asserts a full `start → stop` sequence calls `downloadFile` **exactly once** with a non-empty data URL and a `broshow-YYYY-MM-DD-HHmmss.(mp4|webm)` filename. It passes.

### 2.3 No live repro attempted
Chrome 148 blocks CLI/CDP unpacked extension loading. Per the task scope, browser automation was **not** pursued. The RCA is therefore scoped to **code evidence + a recommended manual repro protocol** (Section 8).

**Reproducibility verdict:** The reported failure is **NOT reproducible from BroShow's source or test suite.** The shipped code paths that produce a download are exercised and green. A live in-browser repro was out of scope by design.

---

## 3. Does the `reading 'track'` error originate in BroShow's code?

**No — with high confidence.**

### 3.1 There are zero `.track` property reads on a possibly-undefined value in `src/`
`grep -rn "\.track" src/` → **(none).** BroShow source never reads `.track` off any value. The only `track`-adjacent constructs are:
- `src/mp4.ts:28` `const videoTrack = stream.getVideoTracks()[0]` — guarded at line 31 (`if (!videoTrack) throw new Error('No video track in stream')`). A failure here throws a **clear** "No video track" message, **never** `reading 'track'`.
- `src/mp4.ts:85` `new MediaStreamTrackProcessor({ track: audioTrack })` — inside an `if (audioTrack)` block; `{ track: X }` is an **object-literal property assignment**, not a `.track` read on undefined.
- `src/mp4.ts:102` `new MediaStreamTrackProcessor({ track: videoTrack })` — runs only after the line-31 guard. Same: object literal, not a read.
- `src/record.ts:119,321` `getVideoTracks()[0]?.getSettings?.()` — **optional-chained**, null-safe.

`grep -rn "getVideoTracks()\[0\]\.\|getAudioTracks()\[0\]\."` → **(no unguarded chained reads).**

### 3.2 The `0.2.18` shipped source matches — guard present, no risky read
`git show 91dedd5:src/mp4.ts` (the "bump to 0.2.18" commit) shows the identical structure: `getVideoTracks()[0]`, the `throw new Error('No video track in stream')` guard, and the `{ track: ... }` object literals. The shipped build could not have produced a `reading 'track'` from BroShow's own code.

### 3.3 The `(index):19529:1242` location cannot be a BroShow bundle — **mapping FAILED, deliberately**
Bundle facts:
```
dist/background.js   2777 lines  (longest line 329 chars)
dist/offscreen.js    2311 lines  (longest line 329 chars)
dist/record.js       1933 lines  (longest line 329 chars)
dist/popup.js         225 lines  (longest line 212 chars)
```
- BroShow's bundles are **NOT minified** — they are readable, multi-line esbuild output (`head` of `offscreen.js` shows commented `// src/offscreen-logic.ts` and pretty-printed code). A `:1242` column implies a minified single-line file; BroShow's longest line is 329 chars.
- **No BroShow bundle reaches 19,529 lines** (largest = 2,777). Line 19,529 cannot exist in any BroShow artifact.
- `(index)` is Chrome DevTools' label for an **inline `<script>` in an HTML document** or a directory-index document — i.e., a **page** in the captured tab, not an extension script. Extension scripts appear under `chrome-extension://<id>/…`, never `(index)`.

**Conclusion:** `(index):19529:1242` maps to a large, minified, inline script in **some web page** (the page being recorded or another open tab), **not** to BroShow. The three `.track` matches in `dist/` are all `track.samples` inside the bundled **mp4-muxer** library's `stss` box builder (`[...track.samples.entries()]`), where `track` is a defined loop variable — not user-reachable undefined reads, and not the column/line cited.

---

## 4. Download-Suppression Mechanism (Stop → download trace)

Traced path: `offscreen.ts` (stop listener) → `offscreen-logic.ts::handleStop` → `mp4.ts::createRecordingSession.stop()` → SW `background-logic.ts::handleOffscreenResult` / `handleOffscreenError` → `downloadFile`.

The design is **defensively layered against "no download"**:

1. **`mp4.ts::stop()`** always stops MediaRecorder FIRST and captures a WebM blob (`capturedWebmBlob`) before any reader cancellation. MP4 finalization is wrapped in try/catch; on any failure it returns the WebM blob (lines 293–306).
2. **`offscreen-logic.ts::handleStop`** wraps `currentSession.stop()` in try/catch; on throw it calls `currentSession.webmFallback()` and emits `offscreen-error` with `fallbackDataUrl` (lines 105–128).
3. **`background-logic.ts::handleOffscreenError`** (lines 358–389): if a `fallbackDataUrl` (inline or from storage) exists, it **still downloads** the WebM and shows a fallback notice — a thrown error does **not** suppress the download.
4. A 30s `PROCESSING_TIMEOUT_MS` recovers a stuck "processing" state.

For "no download" to genuinely occur in production, ALL of these would have to fail simultaneously, or the recording blob would have to be empty/missing AND the fallback unavailable. The test suite exercises the success path, the mux-failure→WebM-fallback path, and the missing-data path (`'Recording data missing from storage'`), all green.

**The only observed "naming" anomaly** comes from the DELIVER note: in the **headed Playwright/CDP sandbox**, the single-tab `@regression` scenario downloaded `download.webm` instead of `broshow-*`, and `git stash` proved it fails **identically at clean baseline** — a pre-existing **headed-Chrome CDP download-naming/interception quirk**, with the single-tab flow otherwise working. This is a **harness artifact**, not a production suppression.

---

## 5. Five-Whys Tree (multi-causal)

```
PROBLEM: 0.2.18 console shows "reading 'track'" at (index):19529:1242 AND
         "Stop & Download" produced no download.

────────────────────────────────────────────────────────────────────────
BRANCH A — The "reading 'track'" TypeError
────────────────────────────────────────────────────────────────────────
WHY 1A: Console shows "Cannot read properties of undefined (reading 'track')"
   [Evidence: user report; stack frames c→T at (index):19529:1242]
  WHY 2A: The throwing frame is at (index):19529:1242 — a minified, 19.5k-line,
          inline-script location.
     [Evidence: (index) = inline/page <script> in DevTools; column 1242 ⇒ minified]
    WHY 3A: BroShow cannot be the source — its bundles are unminified, ≤2,777
            lines, ≤329 chars/line; no bundle reaches line 19,529.
       [Evidence: wc -l dist/*.js; awk longest-line=329; head shows pretty-printed JS]
      WHY 4A: BroShow source has ZERO `.track` reads on possibly-undefined values;
              every track access is guarded (mp4.ts:31) or optional-chained
              (record.ts:119,321); `{ track: X }` sites are object literals.
         [Evidence: grep -rn "\.track" src/ → none; mp4.ts:28-33,85,102;
          git show 91dedd5:src/mp4.ts confirms 0.2.18 identical]
        WHY 5A: The error originates in a DIFFERENT, minified inline script — i.e.
                a web page open/recorded in the browser (the captured tab or an
                unrelated tab), not BroShow.
           [Evidence: only (index)/inline scripts match the location class;
            extension code is served from chrome-extension:// and is unminified]
        ─► ROOT CAUSE A: Symptom MIS-ATTRIBUTION. The `reading 'track'` TypeError
           is page/third-party JavaScript noise surfaced in the same console,
           coincidentally co-observed with the recording attempt. It is NOT
           BroShow code.

────────────────────────────────────────────────────────────────────────
BRANCH B — "No download" after Stop
────────────────────────────────────────────────────────────────────────
WHY 1B: Clicking Stop & Download produced no broshow-* file.
   [Evidence: user report]
  WHY 2B (candidate i — env/harness): "no download" / wrong-name was observed in
          the HEADED Playwright/CDP sandbox, where the single-tab scenario saved
          `download.webm` not `broshow-*`.
     [Evidence: DELIVER crafter note; git stash proved identical failure at
      clean baseline ⇒ pre-existing CDP download-naming/interception quirk]
    WHY 3B-i: CDP intercepts/renames downloads and supplies fake media; this is
              a test-rig behavior, not chrome.downloads.download() in production.
       [Evidence: baseline-identical via git stash; flow otherwise works]
      WHY 4B-i: The acceptance harness asserts on a path subject to CDP download
                naming, which diverges from real Chrome.
         [Evidence: download.webm vs broshow-* mismatch only headed/CDP]
        WHY 5B-i: ─► ROOT CAUSE B1 (H2): Test-harness artifact — headed-Chrome
                  CDP download naming differs from production; not a user defect.

  WHY 2B (candidate ii — would-be real bug): production download genuinely
          suppressed.
     [Evidence sought: NONE found in code or tests]
    WHY 3B-ii: For real suppression, stop()→fallback→downloadFile must all fail,
               or the blob is empty and no fallback exists.
       [Evidence AGAINST: mp4.ts:281 stops MediaRecorder & captures WebM first;
        :293-306 try/catch returns WebM on mux failure; offscreen-logic.ts:110-124
        webmFallback path; background-logic.ts:376-389 downloads fallback on error;
        :342-345 emits explicit 'Recording data missing' if truly empty]
      WHY 4B-ii: A regression test asserts start→stop calls downloadFile exactly
                 once with a non-empty dataUrl.
         [Evidence: regression-firefox-no-download.test.ts PASSES; 68/68 green]
        WHY 5B-ii: ─► No evidence supports a real production suppression path.
                   This branch terminates as UNSUPPORTED (hypothesis only).

────────────────────────────────────────────────────────────────────────
CROSS-VALIDATION
────────────────────────────────────────────────────────────────────────
- Root Cause A (page-script noise) + Root Cause B1 (CDP harness naming):
  CONSISTENT and mutually reinforcing — both place the symptoms OUTSIDE
  BroShow production code (one in the recorded page, one in the test rig).
- Branch B-ii (real suppression) CONTRADICTS the green regression suite and the
  layered fallback design; it is rejected for lack of evidence.
- All observed symptoms explained: YES.
    • "reading 'track'" ⇒ Root Cause A (non-BroShow inline page script).
    • "no download / download.webm" ⇒ Root Cause B1 (CDP harness), if the report
      derives from the headed test run; OR unverified in real Chrome (Section 8).
```

---

## 6. H1 vs H2 Verdict

**Verdict: H2 (environment/attribution artifact) — strongly supported. H1 (real production bug) — unsupported by available evidence.**

Evidence for H2:
- The `reading 'track'` error provably cannot be BroShow code (unminified ≤2.7k-line bundles vs a 19.5k-line minified `(index)` inline script; zero `.track` undefined reads in `src/`; 0.2.18 source identical). → It is **page/third-party** script noise. (Root Cause A)
- The only concrete "no download / wrong name" observation is the headed-CDP `download.webm` quirk, proven baseline-identical by `git stash`. (Root Cause B1)
- The production download path is covered green, including the explicit no-download regression test. (Section 2.2)

Evidence for H1: **none located.** No code path, test, or bundle artifact reproduces a real, user-facing download suppression caused by a `reading 'track'` throw.

**Honest residual uncertainty:** The original report came from a real user's console on a *running* 0.2.18, which this environment cannot drive (Chrome 148 CDP block). I cannot 100% exclude an in-browser, environment-specific real defect (e.g., a specific site's `getDisplayMedia` returning a video-less stream → the **guard** throws "No video track" → fallback still downloads; that still wouldn't say `reading 'track'`). The cheapest way to convert "strongly supported H2" into "confirmed" is the manual protocol in Section 8.

---

## 7. Root Causes & Proposed Fixes (with backward validation)

### Root Cause A — Symptom mis-attribution (page-script TypeError, not BroShow)
- **Type:** Diagnostic/attribution, not a code defect.
- **Fix (P2, optional hardening):** No production code change required. Optionally namespace/log BroShow errors with a `[broshow]` prefix and surface the *recorder's own* errors to the popup distinctly, so a recorded page's console noise is never mistaken for BroShow. BroShow already prefixes most logs (`[mp4]`, `[offscreen]`, `[record]`); extend this to any user-visible error string.
- **Backward validation:** *If* the throw were BroShow's, it would appear under `chrome-extension://…` at a line ≤2,777 in an unminified file with a real `.track` read — none of which hold. Therefore attributing it to BroShow is incorrect; the fix (clearer namespacing) prevents recurrence of the *mis-attribution*, which matches the symptom (confusing console noise). ✔

### Root Cause B1 — Headed-Chrome CDP download-naming/interception artifact (H2)
- **Type:** Test-harness, not production.
- **Fix (P2):** Correct the acceptance harness — assert `chrome.downloads.download` *invocation arguments* (url + `broshow-*` filename) at the API boundary rather than the on-disk CDP-named file, OR configure CDP `Page.setDownloadBehavior`/`Browser.setDownloadBehavior` to preserve suggested filenames. Mark the single-tab `@regression` headed assertion as known-quirk until corrected.
- **Backward validation:** *If* the rig renames downloads to `download.webm` regardless of code, then asserting the on-disk name will fail at clean baseline — which `git stash` confirmed. Asserting the API arguments (which the green unit `regression-firefox-no-download.test.ts` already does) removes the false signal. Matches the observed `download.webm` symptom. ✔

### Branch B-ii (real suppression) — **No fix proposed; unsupported.**
Creating a "fix" here would be a guess. Declined per RCA discipline.

**Immediate mitigation (P0/P1):** None warranted — no evidence of an active production defect. If the user can still reproduce in their own Chrome, run Section 8 first.

---

## 8. Disambiguating Manual Repro Protocol (cheapest experiment to confirm/deny H1)

Run in the user's **own** Chrome (not CDP/headed test). This converts "strongly-supported H2" to a verdict in ~5 minutes.

1. Load the **unpacked** 0.2.19 `dist/` (or install the signed build). Open `chrome://extensions` → enable **Developer mode** → **Errors** panel for BroShow (this isolates *extension* errors from page errors).
2. Open a **simple, trusted page** with no heavy third-party JS (e.g. `chrome://version` is not capturable; use a minimal local `about:blank`-style page or a plain HTML file you control). This removes page-script noise.
3. Open DevTools on the **offscreen document**: `chrome://extensions` → BroShow → "service worker" link, and for the offscreen doc inspect via `chrome://inspect/#other`. Filter console to `[mp4]`/`[offscreen]`/`[broshow]`.
4. Record ~5s, click **Stop & Download**. Observe:
   - **(a)** Does a `broshow-YYYY-MM-DD-HHmmss.(mp4|webm)` land in Downloads? → If **yes**, H1 is **disproven**; the original report was page-noise + harness (H2 confirmed).
   - **(b)** In the *extension* error panel (step 1), is there ANY error originating from `chrome-extension://…/offscreen.js` or `mp4.js`? Note: a real BroShow track failure would read **"No video track in stream"**, NOT `reading 'track'`.
   - **(c)** If `reading 'track'` appears, click the stack frame: confirm whether the source file is `chrome-extension://…` (→ escalate, real H1, send the de-minified frame) or `(index)`/`https://…` page script (→ H2 confirmed, it's the recorded page).
5. If no download AND `[mp4]` logs show `MediaRecorder stopped, blob size: 0` (or `Recording data missing from storage`), capture the full `[mp4]`/`[offscreen]` log trail and re-open this RCA with that evidence — that would be the first real H1 signal.

**Decision rule:** Download appears on a clean page ⇒ close as H2. Extension-origin `reading 'track'` or `blob size: 0` ⇒ reopen as H1 with the new logs.

---

## 9. Summary

- **Reproducibility:** Not reproducible from source/tests; build clean (0.2.19), 68/68 download-path tests green. No live load (Chrome 148 CDP block, out of scope).
- **Is the error BroShow's code?** **No (high confidence).** Zero `.track` undefined reads in `src/`; bundles are unminified ≤2.7k lines; `(index):19529:1242` is a minified inline **page** script, not any BroShow artifact; 0.2.18 source identical and guarded.
- **H1 vs H2:** **H2 (environment/attribution artifact) strongly supported; H1 unsupported.** `reading 'track'` = recorded-page/third-party noise (Root Cause A); the only concrete "no download/wrong name" = headed-CDP naming quirk proven at clean baseline (Root Cause B1).
- **Root causes / experiment:** RC-A symptom mis-attribution; RC-B1 CDP harness naming. Real production suppression branch terminates UNSUPPORTED. If the user wants certainty, run the Section 8 manual protocol (decision rule: clean-page download ⇒ close H2; extension-origin error or `blob size: 0` ⇒ reopen H1).
</content>
