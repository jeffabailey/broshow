# slice-02 — Crop follows active tab across switches, with indicator

**Type:** Value slice (completes R1-cropped). **Reframed** from the obsolete
tabCapture version. **Depends on:** slice-01. **Effort:** ≤ 1 day.

## Goal (one sentence)
With window capture running, switching tabs shows the new tab's content inside
the same crop region (inherent to window capture), with a clear recording
indicator and a single-gesture stop.

## IN scope
- Verify the cropped window stream **follows** tab switches with no gap (US-2,
  generalized to N switches — continuity is inherent to one window stream).
- Visible **"Recording window region"** indicator while active (US-1 AC1.3,
  US-3 AC3.1).
- Stop in ≤1 gesture, regardless of switch count (US-3 AC3.3).
- Out-of-window behavior: capture stays on the shared window (getDisplayMedia is
  bound to the chosen window) (US-3 AC3.2, D2 — satisfied for free).

## OUT scope
- Sensitive-tab pause/exclude (accepted caveat — not v1).
- Per-tab separate files (that's R3, a different feature).
- Re-selecting the crop region mid-recording.

## Learning hypothesis
- **Disproves** "window-capture follow is seamless and the indicator makes scope
  clear" if switching causes visible glitches or testers are unsure what's being
  recorded.
- **Confirms** R1-cropped delivers the reframed job (one cropped, tab-following take).

## Acceptance criteria
- AC2.1 generalized: one file; content updates as tabs switch, no gap.
- AC1.3 / AC3.1: indicator present and accurate for the whole session.
- AC3.2: switching to another window does NOT change what's captured (bound to the
  originally-shared window).
- AC3.3: single-gesture stop → mp4 download.

## Dependencies
- slice-01 (crop + capture + pipeline proven).

## Dogfood moment
- Record a 3+ tab demo in one cropped take; verify smooth follow + clear indicator.

## Taste tests
- Reuses slice-01 capture; adds an indicator + verifies inherent follow. ✅ thin.
- Disproves a UX/trust pre-commitment, not just plumbing. ✅ Production data. ✅
- Not a scale-only duplicate of slice-01 (adds follow verification + indicator). ✅
