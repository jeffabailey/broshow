# Feature Delta — record-all-tabs

> Single narrative file (SSOT-bootstrap model). DISCUSS findings live here as
> `## Wave: DISCUSS / [REF|WHY|HOW]` sections. Density: **lean** — Tier-1 only.
> Created 2026-06-05 via `/nw:new` → DISCUSS (Luna / nw-product-owner).

---

## Wave: DISCUSS / [REF] Persona

**demo-dana** — Developer advocate / solo founder who records product
walkthroughs and bug repros that move across several browser tabs. Wants demos
in "one take," seamless, local/private. (SSOT: `docs/product/personas/demo-dana.yaml`)

---

## Wave: DISCUSS / [REF] JTBD One-liner

**`capture-multi-tab-workflow`** — *When I'm recording a workflow that moves
across several tabs (docs → app → dashboard), I want the recording to follow
whichever tab I'm actively looking at, so I can produce one continuous video
without stopping, restarting, and stitching for each tab.*

- Functional: one gap-free mp4 across multiple tabs, capture follows the active tab.
- Emotional: in-control, unworried — "it just works," no lost footage at the seams.
- Social: polished demos, no "let me restart the recording," no stitch artifacts.

Four forces (full detail in `docs/product/jobs.yaml`): **Push** = recording is
locked to the starting tab; **Pull** = a recording that follows the active tab;
**Anxiety** = gaps/glitches, accidental capture of a sensitive tab, repeated
permission prompts; **Habit** = keep everything in one tab, or fall back to
desktop recording.

---

## Wave: DISCUSS / [REF] Locked Decisions

| ID | Decision | Verdict | Rationale |
|----|----------|---------|-----------|
| D1 | **Meaning of "record all tabs" = follow active tab** | LOCKED | User-selected in `/nw:new`. One continuous mp4 whose capture source switches as the active tab changes. NOT concurrent one-file-per-tab; NOT whole-screen capture (that's `desktop-screen-recording`). |
| D2 | **Scope = the originating browser window only (v1)** | LOCKED | Following across windows multiplies surface and privacy risk. Out-of-window activation pauses/holds, never chases. |
| D3 | **Capture-follow mechanism is UNVERIFIED → SPIKE before DESIGN** | LOCKED (risk) | On Chromium, `tabCapture.getMediaStreamId` runs in the popup's **user-gesture context** (`src/popup.ts:70-79`); the service worker cannot mint a new streamId on tab activation. Seamless follow may be infeasible via tabCapture alone. SPIKE (slice-00) decides the mechanism: per-switch re-capture vs. window-surface `getDisplayMedia('browser')` vs. degrade. **This gates DESIGN.** |
| D4 | **Honest indicator over silent capture** | LOCKED | The user must always have a visible signal of *which* tab is being captured. v1 = existing REC badge + a "now following" indicator. Per-tab exclusion list is out of scope v1. |
| D5 | **Firefox path: follow may reduce to window capture, or defer** | LOCKED | Firefox already uses `getDisplayMedia` (window/display surface), which can inherently span tabs. v1 may satisfy Firefox via existing surface capture or mark it out of scope pending the SPIKE. |
| D6 | **No gap-glitch acceptance until SPIKE quantifies the seam** | LOCKED | "Gap-free" is the goal; the measurable threshold (max acceptable seam ms) is set by the SPIKE, then becomes a hard AC in slice-01. |

---

## Wave: DISCUSS / [REF] User Stories

### US-1 — Arm follow-active-tab mode
**As** Demo Dana, **I want** to choose a "Follow active tab" recording mode in
the popup before I start, **so that** I opt in deliberately and the default
single-tab behavior is unchanged.

`job_id: capture-multi-tab-workflow`

#### Elevator Pitch
Before: the popup only offers single-tab recording; switching tabs ruins the take.
After: open the popup → toggle **Follow active tab** → click **Record** → sees the REC badge plus a "Following: <active tab title>" indicator.
Decision enabled: Dana decides to do a multi-tab take in one shot instead of pre-planning a single-tab script or reaching for a screen recorder.

#### Acceptance Criteria
- AC1.1: The popup exposes a mode control with at least `Single tab` (default) and `Follow active tab`. Default selection is `Single tab` — existing behavior is byte-for-byte unchanged when the user never touches the control.
- AC1.2: Selecting `Follow active tab` then `Record` starts a recording session whose start message carries the follow-mode discriminant to the service worker.
- AC1.3: While following, the popup (and/or toolbar) shows which tab is currently being captured ("Following: <title>").
- AC1.4: On an unsupported target (per capability probe), the mode control is hidden or disabled with a one-line reason — no dead control.

### US-2 — Continuous capture across a tab switch
**As** Demo Dana, **I want** the recording to continue into the tab I switch to
**so that** the final video is one continuous file covering the whole workflow.

`job_id: capture-multi-tab-workflow`

#### Elevator Pitch
Before: switching tabs keeps recording the old, now-hidden tab — the new tab's content is never captured.
After: with follow mode on, switch from tab A to tab B mid-record, click **Stop** → downloads `broshow-YYYY-MM-DD-HHmmss.mp4` that shows tab A's content then tab B's content with no manual stitching.
Decision enabled: Dana decides the single downloaded file is share-ready as-is, with no editor step.

#### Acceptance Criteria
- AC2.1: Starting in follow mode on tab A, activating tab B (same window), then stopping, produces **exactly one** output file (mp4, webm fallback) that contains footage from both tabs in activation order.
- AC2.2: The seam between tab A and tab B footage is within the maximum-gap threshold established by the SPIKE (slice-00). Until set, this AC is `@pending-spike`.
- AC2.3: The filename and download path are unchanged from single-tab recording (`broshow-YYYY-MM-DD-HHmmss.{mp4|webm}`).
- AC2.4: If capture cannot re-acquire on tab B, the system degrades per D3/journey error-path (hold last valid source OR mark a gap) **and surfaces a visible notice** — it never silently records the wrong tab or silently drops footage.

### US-3 — Know (and bound) what is being recorded
**As** Demo Dana, **I want** a clear signal of which tab is being captured and a
predictable boundary **so that** I never accidentally record a sensitive tab or
a different window.

`job_id: capture-multi-tab-workflow`

#### Elevator Pitch
Before: nothing tells Dana that following into a banking tab would capture it.
After: switch to any tab while following → sees the "Following: <title>" indicator update live; switch to another browser window → recording holds on the last armed-window tab instead of chasing.
Decision enabled: Dana decides, in the moment, whether to keep following or stop — with enough signal to avoid capturing something private.

#### Acceptance Criteria
- AC3.1: The "Following: <tab>" indicator updates within one activation event of the tab change.
- AC3.2: Activating a tab in a **different** window does not extend capture to that window (D2); follow holds on the originating window per the journey error-path.
- AC3.3: Stopping always works in ≤1 user gesture regardless of how many tab switches occurred.

---

## Wave: DISCUSS / [REF] Definition of Done (feature-level)

1. All three stories implemented with ACs green (AC2.2 unblocked by SPIKE).
2. Default single-tab recording behavior provably unchanged (regression covered).
3. Capture-follow mechanism chosen, documented (ADR in DESIGN), and within the SPIKE's measured seam threshold.
4. Visible "following" indicator present on every captured tab (D4).
5. Cross-target behavior defined: Chromium follows; Firefox follows-or-documented-out-of-scope (D5).
6. Privacy posture documented (PRIVACY.md touched if capture surface changes).
7. Unit + acceptance tests pass; per-feature mutation kill rate ≥ 80% on modified files.
8. Out-of-window and re-acquire-failure error paths covered by tests.
9. CWS/AMO listing copy updated if a new permission or capability is introduced.

---

## Wave: DISCUSS / [REF] Out of Scope (v1)

- Concurrent recording of multiple tabs into **separate** files (one mp4 per tab).
- Whole-screen / whole-window pixel capture (already `desktop-screen-recording`).
- Following capture across **multiple browser windows**.
- Per-tab exclusion / allow lists, or auto-pause on "sensitive" tabs by heuristic.
- Picture-in-picture / multi-source composition (e.g. tab + webcam).
- Editing, trimming, or re-ordering captured segments.

---

## Wave: DISCUSS / [REF] Walking Skeleton Strategy

**Strategy C — extend the existing skeleton.** The end-to-end recording skeleton
already exists (popup gesture → SW state machine → offscreen/host capture →
mp4 mux → download). `record-all-tabs` threads a new `mode` through that
existing path and adds a tab-activation handler; it does **not** stand up a new
skeleton. The first *new* end-to-end proof is slice-01 (continuous file across a
single switch), preceded by the slice-00 SPIKE that de-risks the mechanism.

---

## Wave: DISCUSS / [REF] Driving Ports (inbound surfaces)

- **Popup UI** — new mode control (`Single tab` | `Follow active tab`) + "Following: <tab>" indicator. (`src/popup.ts`, `src/popup-logic.ts`, `src/popup.html`, `src/popup.css`)
- **Popup → SW message** — `start-recording` gains a follow-mode discriminant (extends `PopupToSW` in `src/types.ts`).
- **SW tab-activation listener** — new effect boundary subscribing to active-tab changes within the originating window, driving capture re-acquire/hold. (`src/background.ts`, pure logic in `src/background-logic.ts`)
- **RecorderHost port** — capture-source switch operation may extend `src/recorder-host.ts` (target-blind), with chromium/firefox adapters implementing follow per the SPIKE outcome.

---

## Wave: DISCUSS / [REF] Pre-requisites

- ✅ `browser-tab-recorder` (single-tab capture skeleton) — shipped.
- ✅ `firefox-recording-support` (RecorderHost port + capability probe) — shipped.
- ⛔ **slice-00 SPIKE** — capture-follow mechanism on Chromium. **Blocks DESIGN.**
- Decision needed in DESIGN: extend `RecordingState` to carry follow context (current tabId already present; add mode + originating windowId).

---

## Wave: DISCUSS / [REF] DoR Validation

| # | DoR item | Status | Evidence |
|---|----------|--------|----------|
| 1 | Business value clear | ✅ | JTBD `capture-multi-tab-workflow`; each story has an elevator pitch ending in a decision. |
| 2 | Acceptance criteria testable | ⚠️ conditional | All ACs testable **except AC2.2** (seam threshold) which is `@pending-spike` by design. |
| 3 | Dependencies identified | ✅ | Pre-requisites section; SPIKE flagged as DESIGN-blocker. |
| 4 | Sized / estimable | ✅ | 3 slices, each ≤1 day after SPIKE; SPIKE timeboxed. |
| 5 | Job traceability | ✅ | All 3 stories → `capture-multi-tab-workflow`. |
| 6 | No blocking ambiguity | ⚠️ flagged | Capture-follow feasibility (D3) is the one open risk; **explicitly routed to SPIKE rather than hidden.** |
| 7 | Demoable | ✅ | Each pitch's "After" line is a concrete popup action + observable output. |
| 8 | Out-of-scope explicit | ✅ | Out-of-scope section. |
| 9 | Persona/stakeholder identified | ✅ | demo-dana (SSOT). |

**Verdict: CONDITIONAL PASS.** Two items (AC2.2, feasibility) are gated on the
slice-00 SPIKE. Honest recommendation: **run the SPIKE (`/nw:spike record-all-tabs`)
before DESIGN.** Do not treat this as a clean green DoR — the central mechanism
is unproven.

---

## Wave: SPIKE / Changed Assumptions (back-propagation, 2026-06-06)

The SPIKE found the original mechanism infeasible and the user reframed the
feature. Per the back-propagation contract, the original DISCUSS decisions above
are preserved; the supersedes are recorded here. Source: `spike/findings.md`,
`spike/wave-decisions.md`, `spike/upstream-issues.md`.

**Superseded — D1 → D1′.** Original D1: *"follow active tab; one continuous mp4
whose capture source switches as the active tab changes; NOT whole-screen."*
SPIKE verdict: no Chromium primitive delivers *tab-scoped + auto-follow + single
file* — `tabCapture` follow is gesture-blocked from `tabs.onActivated`,
`getDisplayMedia` tab-surface won't follow, window-surface follows but includes
chrome. **New D1′ (locked):** "record all tabs" = **capture the active browser
window's content via `getDisplayMedia` window surface, canvas-cropped to a
one-time user-drawn region.** This inherently follows the active tab and hides the
tab strip / toolbar / other windows.

- **D3 (SPIKE gate): RESOLVED** — mechanism chosen; DESIGN may proceed.
- **D5 (Firefox): simplified** — Firefox already uses `getDisplayMedia` primarily.
- **Accepted caveat:** the active tab's *content* is still recorded on switch; no
  sensitive-tab exclusion in v1 (user: "R1-cropped is enough").
- **Obsoleted:** US-2 AC2.2 (seam threshold) and the tabCapture-follow framing of
  US-2/US-3; re-aimed to R1-cropped (see updated slice briefs). Continuity is now
  trivial (one uninterrupted window stream), so the "seam" risk disappears.
- **New testability constraint:** Chrome 148 blocks CLI/CDP unpacked-extension
  loading → automated acceptance needs a Puppeteer/Playwright persistent context
  or a human gate (budget in DISTILL/DELIVER).

---

## Wave: DISCUSS / [REF] Wave Decisions Summary

- **[D1]** Feature = "follow active tab," one continuous file (not multi-file, not screen capture).
- **[D2]** Scope = originating window only in v1.
- **[D3]** Capture-follow mechanism unverified → SPIKE gates DESIGN (Chromium user-gesture constraint on `tabCapture.getMediaStreamId`).
- **[D4]** Visible "following" indicator is mandatory; no silent capture.
- **Feature type:** cross-cutting (popup UI + SW messaging/state + host capture + mux).
- **Walking skeleton:** Strategy C — extend existing skeleton; no new skeleton.

### Constraints established
- Chromium streamId acquisition needs a user gesture (popup); SW cannot self-serve new streamIds.
- Default single-tab path must remain unchanged (regression-protected).
- Privacy: every captured tab must carry a visible recording signal.

### Upstream changes
- None — no prior DISCOVER artifacts existed; this DISCUSS also bootstrapped `docs/product/` SSOT (vision, jobs, persona, journey).
