# slice-00 (SPIKE) — Capture-follow mechanism — ✅ RESOLVED (PIVOT)

**Status:** Done 2026-06-06. Outcome: **PIVOT**, not promote.

The SPIKE tested whether the service worker can mint a follow capture source on
`tabs.onActivated` without a fresh user gesture (UNKNOWN-1) and produce one
continuous file (UNKNOWN-2). Verdict: the specified tabCapture-follow mechanism
**doesn't work** — no Chromium primitive delivers tab-scoped + auto-follow +
single file. See `../spike/findings.md`, `../spike/wave-decisions.md`,
`../spike/upstream-issues.md`.

**Feature reframed to R1-cropped** (`getDisplayMedia` window surface + user-drawn
crop region). slice-01 and slice-02 below are re-aimed accordingly. No further
SPIKE needed unless DESIGN wants to validate crop-follow accuracy (~1h optional).
