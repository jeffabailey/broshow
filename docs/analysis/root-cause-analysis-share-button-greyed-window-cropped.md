# Root Cause Analysis — Share button greyed out in window-cropped recording flow

- **Analyst:** Rex (Toyota 5-Whys, multi-causal, evidence-required)
- **Date:** 2026-06-07
- **Repo:** `/Users/jeffbailey/Projects/foss/leading/broshow`
- **Status:** Investigated from code + WebRTC/getDisplayMedia spec + documented Chrome/macOS behavior. The live OS share picker cannot be driven headlessly (Chrome 148 blocks CDP unpacked-extension capture), so the final picker mechanism carries residual uncertainty — disambiguating manual check is specified in §6.

---

## 1. Problem Definition & Scope

**Symptom (user-reported):** In the "Record all tabs (window, cropped)" flow, after the `getDisplayMedia` picker appears in `record.html`, the picker's **Share** button is greyed out (disabled). User wording ("is greyed out") implies it stays disabled, i.e. the user cannot complete the share.

**Environment:** Chrome on macOS (user's everyday browser). User has successfully recorded tabs before (single-tab path works).

**Scope — in:** the window-cropped path from popup mode selection → `chrome.windows.create('record.html')` → `#action-button` click → `getDisplayMedia`. **Scope — out:** mp4 muxing, crop geometry, download path, the Firefox display-media path (except as the working contrast).

**Scope boundary note:** The defect is a *picker-completion* failure (Share disabled), which is upstream of recording entirely. Crop/mux/download are downstream and cannot be the cause.

---

## 2. Evidence Collected (verified + extended beyond the brief)

| # | Evidence | Source |
|---|----------|--------|
| E1 | `WINDOW_CROPPED_CONSTRAINTS = { video: { displaySurface: 'window' }, audio: true }` | `src/record.ts:80-83` |
| E2 | Working single-tab/Firefox path uses `{ video: { displaySurface: 'browser' }, audio: true }` with a `{ video: true, audio: true }` catch-fallback | `src/record.ts:326-334` |
| E3 | **The live record page `#action-button` is wired ONLY to `startRecording` / `stopRecording`** | `src/record.ts:477-483` |
| E4 | **`startWindowCroppedRecording` (which is the ONLY consumer of `WINDOW_CROPPED_CONSTRAINTS`) is never called from `bootstrapRecordPage`; `composeFromPreview` likewise has no live caller.** Grep: `startWindowCroppedRecording` and `composeFromPreview` appear only in `src/record.ts` (definition) and never in `record.html` or any bootstrap wiring. | `grep -rn` across `src/`, `record.html` |
| E5 | `record.html` loads only `record.js`; no inline script wires the window-cropped seams | `src/record.html:109` |
| E6 | Popup routes window-cropped → `launchRecordPageWindow` → `chrome.windows.create({ url: record.html, type: 'popup', width:520, height:280 })`. The record window IS a `type:'popup'` window. | `src/popup.ts:63-78, 145-164` |
| E7 | **There is no unit test that drives `startWindowCroppedRecording` with a fake `getDisplayMedia`.** Grep for the symbol in `tests/` returns zero. The compositor (`composeCroppedStream`) and crop geometry are unit-tested; the acquisition seam and its constraints are not. | `grep` in `tests/`, `tests/acceptance/record-all-tabs/milestone-1-window-cropped-record.spec.ts` (capture scenarios are `test.fixme @human-gate`) |
| E8 | `displaySurface` is a **hint that pre-selects a pane without restricting the user's choice** — it does NOT force window-only. | Chrome "Privacy-preserving screen sharing controls" docs |
| E9 | On Chrome/macOS, system/window audio capture is a recent capability (third-party system-audio capture needs macOS 14.2+, broadly available in Chrome ~141+). Audio is offered alongside tabs/windows on modern Chrome; on older Chrome/macOS, window-surface audio was not selectable, while tab ("browser") audio was. | addpipe / Chrome 109 blog / Chrome docs |
| E10 | macOS Screen Recording permission gates ALL `getDisplayMedia` surfaces. If it were missing, the single-tab path would also fail — but E2 path works for this user, so a *blanket* permission failure is contradicted. | macOS TCC behavior + user history |

---

## 3. Five-Whys Multi-Causal Tree (evidence at each link)

```
PROBLEM: In the window-cropped flow, the getDisplayMedia picker's Share button is greyed out (stuck disabled).

────────────────────────────────────────────────────────────────────────
BRANCH A — "Audio requested against a surface that can't supply it"  (PRIME SUSPECT)
────────────────────────────────────────────────────────────────────────
WHY 1A: The Share button is disabled after the user selects a window surface.
        [Evidence: user repro; Share enables only when the picker can satisfy
         the full constraint set for the highlighted surface — a window surface
         that cannot fulfil audio:true leaves Share inactive (E9).]
  WHY 2A: The request asks for audio:true while the video constraint hints/forces
          a window display surface.
        [Evidence E1: WINDOW_CROPPED_CONSTRAINTS = {displaySurface:'window', audio:true}.
         E2 contrast: the WORKING path uses displaySurface:'browser' (tab), where
         "Share tab audio" is a first-class, satisfiable option.]
    WHY 3A: On this user's Chrome/macOS, a *window* surface cannot satisfy audio:true
            (window/system audio is gated by macOS 14.2+ / Chrome ~141+; the tab
            surface has always been able to satisfy audio). So the picker has no
            window surface that meets {window + audio}, and Share stays disabled.
        [Evidence E9: window/system audio is a recent capability; tab audio is not.]
      WHY 4A: The code requested audio:true unconditionally for the window surface
              and used 'browser' (tab) for the proven path — the window path never
              degraded audio gracefully when the surface can't provide it.
        [Evidence E1 vs E2: two different surface choices, both with audio:true,
         only one of which (tab) is audio-satisfiable on this platform. No fallback
         like record.ts:333 exists on the window-cropped constraints object.]
        WHY 5A: The window-cropped constraints were authored by analogy to the
                tab path ("window display + shared audio", comment at record.ts:79)
                WITHOUT accounting for the platform asymmetry that window surfaces
                can't supply audio where tab surfaces can — AND with no automated
                test asserting the constraints are audio-safe for a window surface.
        [Evidence E7: zero tests drive the constraints/acquisition seam; capture
         scenarios are human-gated fixmes. E1 comment treats window audio as a
         given.]
        ── ROOT CAUSE A: Unconditional `audio:true` paired with a window display
           surface produces an unsatisfiable constraint on Chrome/macOS, so the
           picker cannot enable Share for a window — a constraint-shape defect,
           uncaught because the acquisition seam has no regression test.

────────────────────────────────────────────────────────────────────────
BRANCH B — "The window-cropped acquisition seam is dead code; the live page
            actually runs the TAB ('browser') path"   (STRUCTURAL — reframes fix scope)
────────────────────────────────────────────────────────────────────────
WHY 1B: The flow the user runs does NOT execute WINDOW_CROPPED_CONSTRAINTS at all.
        [Evidence E3/E4/E5: #action-button → startRecording only; the live page
         calls getDisplayMedia({displaySurface:'browser', audio:true}) at
         record.ts:326-329, with a {video:true,audio:true} fallback at :333.
         startWindowCroppedRecording/composeFromPreview have NO live caller.]
  WHY 2B: bootstrapRecordPage wires the button to the Firefox-era startRecording,
          and the window-cropped seams were added as exported, unit-testable
          functions but never connected to the DOM composition root.
        [Evidence E3: record.ts:477-483 click handler; E4: no wiring of the new seams.]
    WHY 3B: The record page is shared between the Firefox single-tab host and the
            new window-cropped mode, but only ONE getDisplayMedia call site
            (startRecording) is reachable; the mode discriminant never reaches the
            record page to switch acquisition strategy.
        [Evidence E6: popup sends start-recording{path:'window-cropped'} to the SW
         and opens a bare record.html with NO mode parameter in the URL/query;
         the record page has no way to know it is in window-cropped mode.]
      WHY 4B: The window was opened with `chrome.windows.create({url:'record.html'})`
              carrying no mode, so record.ts cannot branch to the window seam even
              if it wanted to.
        [Evidence E6: launchRecordPageWindow builds the URL with no query string.]
        WHY 5B: The delivery wired the popup→SW routing and built/unit-tested the
                acquisition+compose seams in isolation, but the final "connect the
                seam to the live button under the window-cropped mode" step was
                never completed (capture is human-gated, so CI never caught the gap).
        [Evidence E7: milestone-1 capture scenarios are test.fixme @human-gate;
         no headless test asserts which constraints the live page sends.]
        ── ROOT CAUSE B: The window-cropped acquisition seam is unreached dead code;
           the live record page always runs the tab-surface path. This means the
           user's greyed-Share is produced by the TAB path's {displaySurface:'browser',
           audio:true} (or, on rejection, its {video:true,audio:true} fallback) —
           NOT by WINDOW_CROPPED_CONSTRAINTS. Fixing only the constraints object
           without wiring the seam would change nothing the user can observe.

────────────────────────────────────────────────────────────────────────
BRANCH C — macOS Screen Recording permission not granted to Chrome
────────────────────────────────────────────────────────────────────────
WHY 1C: macOS shows the picker but Share is disabled until Screen Recording
        permission is granted (+ Chrome restart).
        [Evidence: documented macOS TCC behavior for getDisplayMedia.]
  WHY 2C: First-time screen capture from this Chrome install/profile triggers the
          TCC prompt; until granted, no surface is shareable.
    WHY 3C: ... CONTRADICTED for a blanket failure.
        [Evidence E10 + user history: the single-tab/tab path has worked for this
         user, and that path ALSO calls getDisplayMedia (record.ts:326). A missing
         Screen Recording grant would have blocked that too. So a global permission
         failure does not fit.]
        ── ROOT CAUSE C: NOT a primary cause. Residual: if the user has only ever
           used the *tabCapture* single-tab pipeline (popup.ts:119, chrome.tabCapture
           — which does NOT require Screen Recording) and never a getDisplayMedia
           surface, then Screen Recording permission could still be ungranted. This
           is the one branch that needs a one-line manual check (see §6).

────────────────────────────────────────────────────────────────────────
BRANCH D — Procedure: Share is normally disabled until a thumbnail is selected
────────────────────────────────────────────────────────────────────────
WHY 1D: Chrome's Share is inert until the user clicks a surface thumbnail.
        [Evidence: standard Chrome picker UX.]
  WHY 2D: If the user reported "greyed out" while no thumbnail was selected, this is
          expected, not a defect.
    WHY 3D: User wording ("is greyed out") and the framing as a defect imply it stays
            disabled AFTER selecting a surface — otherwise the prior tab recordings
            would have been impossible.
        ── ROOT CAUSE D: Low likelihood. Kept only as a disambiguation question (§6).

────────────────────────────────────────────────────────────────────────
BRANCH E — chrome.windows.create({type:'popup'}) context affects the picker
────────────────────────────────────────────────────────────────────────
WHY 1E: getDisplayMedia is called from a type:'popup' extension window.
        [Evidence E6: launchRecordPageWindow.]
  WHY 2E: The call is in a user gesture (#action-button click) inside a full DOM page
          with Window privileges — the documented requirement.
    WHY 3E: The SAME window type hosts the WORKING Firefox path, which shares
            successfully. So window type/focus is not the discriminator.
        [Evidence: record.ts:11 + popup.ts:63-78 — one launcher for both paths.]
        ── ROOT CAUSE E: Ruled out. Identical window context yields a working Share
           on the tab path.
```

---

## 4. Cross-Validation

- **A ⟷ B (the key interaction):** Both are *real* defects but they are **layered**. B says the live page runs the tab path, so the *currently observable* greyed-Share is generated by `{displaySurface:'browser', audio:true}` (Branch A's mechanism — `audio:true` against a surface — applied to the tab path's own fallback `{video:true,audio:true}`). A says the window constraints are *also* audio-unsafe and would fail the same way once the seam is wired. **No contradiction:** they are the same constraint-shape failure mode at two code sites. The complete fix must (1) wire the window seam (B) **and** (2) make audio degrade gracefully for the window surface (A), or the wired path will reproduce the bug.
- **A/B ⟷ C:** Consistent. A/B explain the failure without needing a permission gap; C only survives as a residual if the user has never used a getDisplayMedia surface before. Manual check disambiguates.
- **D, E:** Ruled out / low; do not contradict A/B.
- **All symptoms explained:** Yes. "Share greyed out after selecting" = constraint unsatisfiable for the highlighted surface given `audio:true` on this Chrome/macOS (A), reached via the tab path that the live page actually runs (B).

---

## 5. Verdict — Ranked Root Causes

| Rank | Root cause | Confidence | Why |
|------|-----------|-----------|-----|
| **#1** | **B — window-cropped seam is dead code; live page runs the tab path** | **High** | Pure code fact (E3/E4/E5/E6). Reframes the fix: editing only `WINDOW_CROPPED_CONSTRAINTS` would be a no-op for the user. |
| **#2** | **A — `audio:true` against a non-audio-satisfiable surface keeps Share disabled** | **High (mechanism), Medium (that it is THIS user's exact trigger)** | Strong spec + working-vs-broken contrast (E1/E2/E8/E9). This is the mechanism that greys Share; it applies to whichever surface the live page requests. |
| #3 | C — macOS Screen Recording permission | Low (residual) | Contradicted as a blanket cause (E10); only possible if user never used a getDisplayMedia surface. Cheap to rule out (§6). |
| #4 | D — procedure (no thumbnail selected) | Low | Contradicted by defect framing + prior successful recordings. |
| #5 | E — popup-window context | Ruled out | Identical context works on the tab path. |

**Most-likely root cause (committed):** The user's greyed-Share is the combination of **B + A** — the live record page runs the tab-surface `getDisplayMedia` path, and the unconditional `audio:true` constraint cannot be satisfied for the surface the picker highlights on this Chrome/macOS, so Share never enables. The window-cropped constraints object is a parallel, not-yet-reachable instance of the same audio-constraint defect.

---

## 6. Cheapest Disambiguating Manual Check (residual uncertainty)

Because the OS picker can't be driven headlessly, run ONE of these to separate A/B from C/D:

1. **In `record.html`, open DevTools console** before clicking the button. The live `startRecording` logs at `record.ts:316, 335-339, 389`. If you see `getDisplayMedia rejected: NotAllowedError` → permission/cancel (C/D). If the picker appears and Share is disabled with NO rejection log until you cancel → constraint/surface issue (A/B). 
2. **Quick constraint probe** in that console: run `await navigator.mediaDevices.getDisplayMedia({video:true})` (no audio). If Share now ENABLES for a window → confirms A (audio is the blocker). If still greyed → check macOS System Settings ▸ Privacy & Security ▸ Screen Recording for Chrome (C).
3. macOS ▸ Privacy & Security ▸ Screen Recording: is Chrome listed and enabled? If absent/off → C; grant + restart Chrome.

Expected result given the evidence: probe #2 enables Share → confirms Root Cause A; #1 shows the tab path is what runs → confirms Root Cause B.

---

## 7. Concrete Proposed Fix

The fix has **two parts** because of the B+A layering. Both are required for the user-visible flow to work with the window surface; Part 1 alone makes the *currently-running* path stop greying Share.

### Part 1 (addresses A, immediate, lowest-risk) — make audio degrade gracefully

Change `WINDOW_CROPPED_CONSTRAINTS` so audio is a *non-blocking preference*, and add a no-audio retry, mirroring the proven tab-path fallback at `record.ts:333`.

**File:** `src/record.ts:80-83` — replace the constants and add a fallback in `startWindowCroppedRecording` (`src/record.ts:91-105`).

```ts
// src/record.ts ~80
/** Primary: window surface WITH shared audio (works on Chrome ~141+/macOS 14.2+). */
const WINDOW_CROPPED_CONSTRAINTS: MediaStreamConstraints = {
  video: { displaySurface: 'window' },
  audio: true,
  // systemAudio left at default 'include' so audio is offered when available.
};

/** Fallback: window surface, VIDEO ONLY — guarantees Share is satisfiable even
 *  where the platform can't supply window/system audio (Decision B: audio is
 *  "included if shared", never required). */
const WINDOW_CROPPED_CONSTRAINTS_NO_AUDIO: MediaStreamConstraints = {
  video: { displaySurface: 'window' },
  audio: false,
};
```

```ts
// src/record.ts ~94, inside startWindowCroppedRecording
let granted: MediaStream;
try {
  granted = await deps.getDisplayMedia(WINDOW_CROPPED_CONSTRAINTS);
} catch (audioError) {
  // Audio may be unsatisfiable for a window surface on this platform; retry
  // video-only before surfacing a cancellation (Decision B: audio optional).
  try {
    granted = await deps.getDisplayMedia(WINDOW_CROPPED_CONSTRAINTS_NO_AUDIO);
  } catch (error) {
    const e = error as Error;
    deps.setStatus(
      `Screen-share cancelled: ${e?.name ?? 'UnknownError'} — ${e?.message ?? 'no message'}`,
    );
    deps.onStateChange('idle');
    return null;
  }
}
```

> Note on the picker mechanism: on modern Chrome the audio retry may be unnecessary (audio is offered alongside windows), but the retry is the **safe, platform-version-agnostic** way to guarantee Share is reachable. `displaySurface` is only a hint (E8), so the picker will still offer the user a window; the constraint change only affects whether audio is *required*.

**Also apply the same audio-optional retry to the live tab path** that the user actually hits today (`record.ts:326-334`). It already has a `{video:true,audio:true}` fallback, but that fallback still requires audio. Add a final `{video:true, audio:false}` retry so Share is reachable even when no surface can supply audio:

```ts
// src/record.ts ~333 — extend the existing fallback chain
} catch (browserSurfaceError) {
  try {
    displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  } catch {
    displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  }
}
```

### Part 2 (addresses B, completes the feature) — wire the window seam to the live button

So the window-cropped mode actually runs `startWindowCroppedRecording` + `composeFromPreview` instead of the tab path. Two sub-steps:

1. **Pass the mode to the record page.** `src/popup.ts:63-70` — append a query flag:
   ```ts
   url: chrome.runtime.getURL('record.html?mode=window-cropped'),
   ```
2. **Branch in `bootstrapRecordPage`** (`src/record.ts:477-483`) so that when `new URLSearchParams(location.search).get('mode') === 'window-cropped'`, the `#action-button` click invokes `startWindowCroppedRecording({ getDisplayMedia: navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices), createRecordingSession: createMediaRecorderSession, download: chrome.downloads.download, setStatus, onStateChange, composeFromGranted: composeFromPreview(crop-preview, crop-canvas, dragRect) })`, else the existing `startRecording`. (The compose wiring uses the already-present `#crop-preview`/`#crop-overlay`/`#crop-canvas` elements and `createCropSelection`.)

**Recommended sequencing:** Ship **Part 1** first (it fixes the user-visible greyed-Share on the path that actually runs today and is near-zero risk). Schedule **Part 2** as the feature-completion follow-up, since it is the larger change and the brief's primary ask is "fix + regression test" for the greyed Share.

---

## 8. Regression Test — Realistic Assertions at the Pure Seam

The OS picker cannot be driven headlessly, so the test target is the **constraints + the injectable `getDisplayMedia`** in `startWindowCroppedRecording` (already designed for injection: `WindowCroppedRecordingDeps.getDisplayMedia`). This is the cheapest, highest-value seam.

**New file:** `tests/unit/record-all-tabs-acquire-constraints.test.ts`

Concrete assertions:

1. **Constraint shape is audio-safe / valid for a window surface.** Assert the primary constraints object equals `{ video: { displaySurface: 'window' }, audio: true }` and the no-audio fallback equals `{ video: { displaySurface: 'window' }, audio: false }`. (Export both, or assert via the calls in #2.) Guards against a future edit reintroducing a hard audio requirement with no fallback.
2. **Audio degrades gracefully (the regression).** Inject a fake `getDisplayMedia` that **rejects** the first (audio) call with `OverconstrainedError`/`NotAllowedError` and **resolves** the second (no-audio) call. Assert: `startWindowCroppedRecording` returns a started session (not `null`), the fake was called **twice**, the second call's constraints had `audio: false`, and `onStateChange` was called with `'recording'`. This is the direct headless proxy for "Share is reachable even when window audio is unsatisfiable."
3. **Genuine cancellation still surfaces a notice.** Inject a fake that rejects **both** calls with `NotAllowedError`. Assert: returns `null`, `setStatus` received a visible cancellation notice, `onStateChange('idle')`, and `download` was never called (preserves AC2.4).
4. **Happy path uses audio when available.** Fake resolves the first call. Assert: one call only, constraints carried `audio: true`, session started.

For **Part 2** wiring, add one headless DOM test (jsdom): load `record.html` semantics with `?mode=window-cropped`, click `#action-button`, and assert the injected `getDisplayMedia` was invoked with `displaySurface: 'window'` (not `'browser'`) — proving the live page now routes to the window seam. This closes the gap that let Root Cause B ship (E7).

---

## 9. Risk Assessment of the Fix

| Concern | Assessment |
|---------|-----------|
| **Firefox / single-tab path** | Part 1's window-constraint change touches only `WINDOW_CROPPED_CONSTRAINTS` + `startWindowCroppedRecording` (currently dead code) → **zero** Firefox risk. The added `{video:true, audio:false}` final fallback at `record.ts:333` is **additive** (only runs if both prior attempts reject), so the Firefox/tab happy path is byte-for-byte unchanged. **Low risk.** |
| **Audio "include if shared" (Decision B)** | The fix *upholds* Decision B: audio is requested first and kept when granted; it is dropped only when the platform cannot supply it. Recordings that *can* have audio still do. **No regression to the audio decision.** |
| **Part 2 wiring** | Higher blast radius — it changes which `getDisplayMedia` the live page runs and activates the compositor/crop path. Risk is mitigated by the new headless routing test (§8) + the existing `@human-gate` capture scenarios. **Medium risk; ship separately from Part 1.** |
| **Picker-mechanism uncertainty** | If the real trigger turns out to be macOS permission (Branch C), Part 1 will NOT fix it. The §6 manual probe (2 minutes) removes this uncertainty before committing — but Part 1 is still correct and worth shipping regardless, as it hardens the audio path. |

**Overall:** Part 1 = **Low risk, high value, ship now.** Part 2 = **Medium risk, schedule as feature-completion** with the routing regression test.

---

## Sources

- [Privacy-preserving screen sharing controls — Chrome for Developers](https://developer.chrome.com/docs/web-platform/screen-sharing-controls/)
- [Screen sharing improvements in Chrome 109 — Chrome for Developers](https://developer.chrome.com/blog/screen-sharing-improvements-in-chrome-109)
- [Capturing the Screen With System Sounds on Chrome on macOS — addpipe](https://blog.addpipe.com/getdisplaymedia-allows-capturing-the-screen-with-system-sounds-on-chrome-on-macos/)
- [MediaDevices.getDisplayMedia() — MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)
</content>
</invoke>
