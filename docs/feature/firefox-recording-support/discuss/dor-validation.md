# Definition of Ready Validation: firefox-recording-support

Validated against the 9-item DoR checklist for each user story in
`user-stories.md`. Evidence cites the section in `user-stories.md` or the
companion artifacts.

## US-FF-01: Capability probe accepts the Firefox recording path

| DoR Item | Status | Evidence |
|---|---|---|
| 1. Problem statement clear, domain language | PASS | "Maria... installed BroShow v0.1.2 on Firefox and saw 'Recording is not supported in this browser'." |
| 2. User/persona with specific characteristics | PASS | "Returning Firefox user who tried v0.1.2"; "New Firefox user installing the add-on on Firefox 121+." |
| 3. >= 3 domain examples with real data | PASS | Maria/Firefox 124, Sam/Chrome 130, Lin/Safari 17. Three concrete cases with real names and versions. |
| 4. UAT in Given/When/Then (3-7 scenarios) | PASS | 3 scenarios (probe passes Firefox, no Chrome regression, still blocks unsupported). |
| 5. AC derived from UAT | PASS | 4 AC bullets directly map to scenarios. |
| 6. Right-sized (1-3 days, 3-7 scenarios) | PASS | ~0.5 day, 3 scenarios. |
| 7. Technical notes: constraints/dependencies | PASS | Feature-based detection constraint, exposes which path matched, files identified. |
| 8. Dependencies resolved or tracked | PASS | None — this is the entry point story. |
| 9. Outcome KPIs defined | PASS | 100% of Firefox-with-getDisplayMedia installs reach Start; baseline 0%. |

### DoR Status: PASSED

---

## US-FF-02: Firefox surface picker bootstraps a recordable MediaStream

| DoR Item | Status | Evidence |
|---|---|---|
| 1. Problem statement clear | PASS | "Maria expects the Start Recording button to actually start something." |
| 2. User/persona | PASS | "Maria (Firefox user) who clicked Start Recording for the first time"; "Returning Firefox user." |
| 3. >= 3 domain examples | PASS | Picks tab, picks window, cancels picker. Three scenarios with concrete details (Tutorial.html, displaySurface values). |
| 4. UAT (3-7 scenarios) | PASS | 3 scenarios (success, cancel, error). |
| 5. AC derived from UAT | PASS | 4 AC bullets map directly to scenarios. |
| 6. Right-sized | PASS | ~1 day, 3 scenarios. |
| 7. Technical notes | PASS | User-gesture constraint, host-context constraint, dependency on US-FF-01. |
| 8. Dependencies tracked | PASS | Depends on US-FF-01 (probe must report Firefox path); DQ-1 in wave-decisions.md flagged. |
| 9. Outcome KPIs | PASS | >= 95% Start->Recording transition rate; baseline 0%. |

### DoR Status: PASSED

---

## US-FF-03: Recording host survives a 5-minute recording without popup interaction

| DoR Item | Status | Evidence |
|---|---|---|
| 1. Problem statement clear | PASS | "If the recording host dies before Maria clicks Stop, her recording is lost." |
| 2. User/persona | PASS | "Maria recording a 5-minute tutorial without touching the popup"; "Maria recording a short clip (15 seconds)." |
| 3. >= 3 domain examples | PASS | 5-minute uninterrupted, 15s with popup-close, 30s across DevTools toggle. |
| 4. UAT (3-7 scenarios) | PASS | 3 scenarios (5-min, popup-close, devtools). |
| 5. AC derived from UAT | PASS | 4 AC bullets. |
| 6. Right-sized | PASS | ~2 days (assumes spike completed before this story enters Ready). |
| 7. Technical notes | PASS | "DESIGN should validate via spike before committing"; permission guardrail noted. |
| 8. Dependencies tracked | PASS | Depends on US-FF-02; DQ-1 must be resolved before this story enters Ready. **Note**: this story has a documented prerequisite (DQ-1) that DESIGN owns. The story is "Ready" in the DISCUSS sense (clear, sized, examples), but cannot enter DELIVER until DQ-1 is resolved. |
| 9. Outcome KPIs | PASS | >= 95% completion rate; 100% for canonical 5-min case. |

### DoR Status: PASSED (with explicit DESIGN-prerequisite flagged)

---

## US-FF-04: Firefox popup shows surface-picker hint

| DoR Item | Status | Evidence |
|---|---|---|
| 1. Problem statement clear | PASS | "She may pick the wrong surface or hesitate." |
| 2. User/persona | PASS | "Returning Chrome-user-now-on-Firefox who expects auto-targeting"; "New Firefox user." |
| 3. >= 3 domain examples | PASS | Maria/Firefox sees hint, Sam/Chrome doesn't, Maria-after-many-uses unobtrusive. |
| 4. UAT (3-7 scenarios) | PASS | 3 scenarios (Firefox shows, Chrome hides, hint hides during recording). |
| 5. AC derived from UAT | PASS | 4 AC bullets. |
| 6. Right-sized | PASS | ~0.5 day, 3 scenarios. |
| 7. Technical notes | PASS | Visibility derived from probe; dependency on US-FF-01. |
| 8. Dependencies tracked | PASS | Depends on US-FF-01. |
| 9. Outcome KPIs | PASS | Qualitative >= 4/5 testers can describe what will happen. |

### DoR Status: PASSED

---

## US-FF-05: Firefox recording stops and downloads as mp4 (or webm fallback)

| DoR Item | Status | Evidence |
|---|---|---|
| 1. Problem statement clear | PASS | "She expects the same outcome she gets on Chrome." |
| 2. User/persona | PASS | "Maria who just finished her recording"; "Maria, mp4-mux fails." |
| 3. >= 3 domain examples | PASS | mp4 success, webm fallback, partial-recording (tab closed). |
| 4. UAT (3-7 scenarios) | PASS | 3 scenarios (mp4 success, webm fallback, filename parity). |
| 5. AC derived from UAT | PASS | 5 AC bullets including no-new-permissions check. |
| 6. Right-sized | PASS | ~1 day (mostly reuse of existing pipeline). |
| 7. Technical notes | PASS | ADR-002 dependency, DQ-4 flagged. |
| 8. Dependencies tracked | PASS | Depends on US-FF-03; reuses US-05/US-06 from parent feature. |
| 9. Outcome KPIs | PASS | 100% download success; mp4-rate >= 90% on Firefox. |

### DoR Status: PASSED

---

## US-FF-06: Stopping via Firefox native "Stop sharing"

| DoR Item | Status | Evidence |
|---|---|---|
| 1. Problem statement clear | PASS | "If she clicks it instead of our Stop button... Maria loses her work." |
| 2. User/persona | PASS | "Maria who reaches for the closer Firefox-native control"; "Maria switches windows." |
| 3. >= 3 domain examples | PASS | Native stop click, recorded tab closed, our Stop button regression. |
| 4. UAT (3-7 scenarios) | PASS | 3 scenarios. |
| 5. AC derived from UAT | PASS | 3 AC bullets. |
| 6. Right-sized | PASS | ~1 day. |
| 7. Technical notes | PASS | track.ended observation in chosen host. |
| 8. Dependencies tracked | PASS | Depends on US-FF-03. |
| 9. Outcome KPIs | PASS | 100% no-recording-lost via native stop. |

### DoR Status: PASSED

---

## US-FF-07: "Audio not captured" success note when user declines share-audio

| DoR Item | Status | Evidence |
|---|---|---|
| 1. Problem statement clear | PASS | "She may not realize this until she opens the file later." |
| 2. User/persona | PASS | "Maria recording a tutorial who needs sound"; "Maria recording a silent UI demo." |
| 3. >= 3 domain examples | PASS | Tutorial/needs-audio, silent-demo/fine, audio-present/no-note. |
| 4. UAT (3-7 scenarios) | PASS | 3 scenarios. |
| 5. AC derived from UAT | PASS | 4 AC bullets. |
| 6. Right-sized | PASS | ~0.5 day. |
| 7. Technical notes | PASS | Inspect MediaStream audio track; depends on US-FF-05. |
| 8. Dependencies tracked | PASS | Depends on US-FF-05. |
| 9. Outcome KPIs | PASS | 100% audio-less recordings show note. |

### DoR Status: PASSED

---

## Anti-Pattern Scan

| Anti-Pattern | Found? | Notes |
|---|---|---|
| Implement-X | No | All stories framed from user pain ("Maria saw the not-supported message", "her recording is lost"). |
| Generic data | No | Real names (Maria, Sam, Lin), real browser versions (Firefox 121, 124; Chrome 130), real filenames (Tutorial.html), real timestamps (2026-04-29 14:15:22). |
| Technical AC | No | All AC are observable user outcomes ("file is downloaded", "popup shows X"). The closest exception is US-FF-01 AC bullet about probe return shape — kept because the probe IS the public interface to popup-logic, but stated in observable terms. |
| Oversized story | No | Largest is US-FF-03 at ~2 days, 3 scenarios. All within 1-3 days, 3-7 scenarios. |
| Abstract requirements | No | Every story has 3+ concrete examples. |

## Feature-Level DoR Status: PASSED

All 7 stories pass DoR. The feature is ready for DESIGN handoff with the
explicit understanding that DQ-1 (recording host) must be resolved before
US-FF-03 enters DELIVER.

## Handoff Readiness Checklist

- [x] Journey artifacts (visual, yaml, feature) produced
- [x] Shared-artifacts registry produced
- [x] Story map and prioritization produced
- [x] Scope assessment: PASS (right-sized)
- [x] User stories with DoR-passing structure
- [x] Acceptance criteria (curated end-to-end)
- [x] Requirements (FRs, NFRs, constraints)
- [x] Outcome KPIs with measurement plan and guardrails
- [x] Wave decisions document with open questions for DESIGN
- [ ] Peer review (deferred — caller said "do not hand off")
- [ ] DESIGN handoff (deferred — caller said "leave that to me")
