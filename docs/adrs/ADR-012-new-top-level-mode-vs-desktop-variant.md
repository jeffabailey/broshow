# ADR-012: New Top-Level Mode vs. Desktop-Capture Variant

## Status

Accepted

## Context

ADR-010's cropped-window capture is mechanically close to
`desktop-screen-recording` (both use `getDisplayMedia`). DESIGN must decide
whether "Record all tabs (window, cropped)" is:

- a **variant/option** folded into the existing desktop-screen-recording mode, or
- a **distinct top-level mode** with its own discriminant.

Constraints:
- AC1.1: the default single-tab behavior must be byte-for-byte unchanged.
- Project invariant: `selectHost` is the SINGLE platform branch; the design must
  not add a second platform branch.
- The cropped-window mode has a **unique pre-record step** (crop selection) and a
  **unique pipeline** (canvas compositor) that desktop-screen-recording lacks.

## Options Considered

### Option A: Fold into desktop-screen-recording (REJECTED)

Add a "crop the window" checkbox/sub-option to the existing screen-recording
mode.

- **Pros**: fewer top-level controls.
- **Cons**:
  - Conflates two different jobs: "record my whole screen" vs. "record my
    tab-following window content." The persona (Demo Dana) explicitly contrasts
    them — desktop recording "captures the whole OS chrome and other windows,"
    which is the frustration this feature removes.
  - Couples the desktop mode's code path to the crop compositor + preview,
    risking regression in a shipped mode (violates AC1.1's spirit of keeping
    existing modes safe).
  - Muddles the wire model: desktop-screen-recording and window-cropped would
    share a `RecordingPath` and need a sub-flag, complicating exhaustiveness.
- **Rejection**: violates separation of jobs and risks regressing a shipped mode.

### Option B: Distinct top-level mode + new `RecordingPath` (SELECTED, = Decision C)

Add "Record all tabs (window, cropped)" alongside single-tab and desktop-screen,
threaded via a new `RecordingMode` ('window-cropped') and a new `RecordingPath`
('window-cropped'). Keep existing modes regression-safe; default behavior
unchanged.

- **Pros**:
  - Clean separation of jobs; the selector reads as three distinct intents.
  - **Additive** types (`data-models.md §2, §3, §5`); TypeScript exhaustiveness
    flags every site that must acknowledge the new mode.
  - The new pipeline (crop preview + compositor) is isolated to the new mode;
    shipped modes are untouched (AC1.1 honored).
  - **Mode is orthogonal to target** — `'window-cropped'` resolves to the
    record-page recorder on both Chromium and Firefox, so it adds **no** new
    `target ===` site. `selectHost` (the single platform branch) is untouched.
- **Cons**:
  - One more top-level control in the popup.
  - Widens two unions (intended; flagged at compile time).

## Decision

**Option B: a distinct top-level `'window-cropped'` mode with its own
`RecordingPath`.** Do NOT fold it into desktop-screen-recording.

## Consequences

### Positive

- Existing single-tab and desktop-screen modes are regression-safe (AC1.1).
- The platform-branch invariant holds: mode lives at the popup/record-page +
  message layer, not in `selectHost`/`targetForPath`.
- Exhaustive `switch` statements list every integration point for free.

### Negative

- The popup gains a third option; UI must keep it clear and hide/disable on
  unsupported targets (AC1.4).
- `RecordingPath` now mixes target-bearing and mode-bearing members; documented
  in `data-models.md §2` so `targetForPath` keeps mapping only target-bearing
  paths (no platform branch added).

## Relationships

- Realizes Decision C from the task brief.
- Depends on ADR-010 (mechanism) and ADR-011 (crop UX).
- Constrains ADR-013: the compositor lives behind the new mode, not in a shared
  desktop path.
