# Acceptance Review: record-all-tabs (R1-cropped)

> Wave: DISTILL (self-review pass before handoff to DELIVER)
> Reviewer: acceptance-designer (Quinn, review mode). 28 scenarios > 3 → full
>   review pass per skill instructions.
> Inputs: all spec/test files under `tests/acceptance/record-all-tabs/` and the
>   two new pure-unit files under `tests/unit/`.

## Review output

```yaml
review_id: "accept_rev_20260606_record_all_tabs"
reviewer: "acceptance-designer (review mode)"

strengths:
  - "Walking-skeleton strategy declared (Strategy C — extend the existing skeleton) and dual-track (headless-safe mode-control proof + @human-gate full crop flow), mirroring the parent firefox feature's honest manual-lane pattern."
  - "Real-browser-vs-pure-seam split is explicit: the only non-trivial new logic (crop math) is a PURE function carrying the >=80% mutation gate, headless and deterministic; effect seams (getDisplayMedia(window), canvas compositor, follow) are @human-gate, never faked at the acceptance level."
  - "Brittle-assertion avoidance honored: zero screenshot pixel diffs. Crop fidelity is proven by (a) pure crop-math unit tests and (b) recorded-dimension + download-count proxies + a human dogfood confirmation on production data."
  - "Driving ports only: acceptance specs drive the real popup + record page via the loaded extension and never import src/ internals; pure tests call the pure function signatures directly (which ARE their driving ports)."
  - "Error/boundary/negative ratio is 13/28 = 46%, above the 40% threshold."
  - "RED-not-BROKEN verified by execution: the two ENABLED unit tests fail on the scaffold throw (crop-geometry) and on a wrong-variant assertion (mode-mapping); all 403 pre-existing unit tests stay green (additive types caused zero regression)."
  - "SPIKE pivot (D1→D1′) honored: AC2.2 (seam threshold) correctly obsoleted (one stream, no seam); re-aim artifacts (AC1.4, AC2.2) flagged in upstream-issues.md rather than silently dropped."
  - "One-at-a-time staging: exactly the first scenario of each enabled lane is RED; the rest are it.skip / test.skip / test.fixme @human-gate, ready for DELIVER to enable one by one."

issues_identified:
  happy_path_bias: []        # 46% error/boundary/negative ratio; no blocker
  gwt_format: []             # every scenario has a single Given context, single When, observable Then in comment blocks; describe/it titles are business-focused
  business_language:
    - issue: "Scenario titles use domain terms: 'crop', 'window', 'getDisplayMedia', 'record page', 'mp4/webm'."
      severity: "info"
      recommendation: "Acceptable — these are the ubiquitous language of this product (a browser extension that records a surface and crops it to a region). Per Dim 3, domain terms from the product's ubiquitous language are allowed. Actor (Dana) + observable outcomes (a file, a visible indicator, a mode she picks) keep titles user-facing."
  coverage_gaps:
    - issue: "AC1.4 (hide/disable mode on unsupported target) has no dedicated scenario."
      severity: "info"
      recommendation: "Satisfied-by-inheritance via the existing getDisplayMedia capability probe (detectRecordingCapability + capability-check.test.ts). Flagged in upstream-issues.md ISS-2 for PO confirmation. Not a blocker — the unsupported path already disables recording with a reason."
    - issue: "AC2.2 (seam threshold) has no scenario."
      severity: "info"
      recommendation: "OBSOLETED by the SPIKE — continuity is structural (one window stream, no seam). Documented in test-scenarios.md + upstream-issues.md ISS-1. Correct to omit."
  walking_skeleton_centricity:
    - issue: "WS scenarios name Dana and end in observable outcomes (a mode she picks, a cropped file in Downloads)."
      severity: "info"
      recommendation: "Confirmed user-centric — a non-technical stakeholder can confirm 'Dana drew a box and got one cropped video.'"
  observable_behavior:
    - issue: "Acceptance scenarios assert file existence on disk and recorded video dimensions."
      severity: "info"
      recommendation: "Acceptable per Dim 7 — the user-observable outcome of this product IS a file in the OS download folder; recorded dimensions are the observable proxy for 'the crop was applied' (a robust, non-pixel-diff outcome). Indicator presence asserts visible DOM text — observable."
  traceability_coverage:
    # Check A (Story-to-Scenario): US-1 -> 1,3,4,22,23,24 ; US-2 -> 2,9,6 ; US-3 -> 8,10,11,12. Every in-scope US covered.
    - issue: "DEVOPS environments.yaml missing; defaults applied (clean browser profile)."
      severity: "info"
      recommendation: "Logged in upstream-issues.md. Browser-extension feature has one meaningful environment (clean profile); each WS run rmSync's the profile dir. Forwarded to platform-architect."
  walking_skeleton_boundary:
    - issue: "WS strategy declared and matched; no @in-memory on any @walking_skeleton scenario."
      severity: "info"
      recommendation: "PASS. Strategy C declared in distill/walking-skeleton.md; real Playwright + real extension + real chrome.downloads + real filesystem. The non-deterministic getDisplayMedia picker is faked via Chrome flags (correct per Architecture of Reference: external/non-deterministic port -> fake)."

approval_status: "approved"
```

## Dimension-by-dimension verdict

| Dim | Pattern | Verdict | Notes |
|---|---|---|---|
| 1 | Happy path bias | PASS | 46% error/boundary/negative (target 40%+). |
| 2 | GWT format compliance | PASS | Single Given / single When / observable Then per scenario, in comment blocks (repo convention). |
| 3 | Business language purity | PASS (allowed domain terms) | Dana actor; crop/window/mp4 are product ubiquitous language. |
| 4 | Coverage completeness | PASS | All in-scope US + testable ACs covered; AC2.2 obsoleted, AC1.4 inherited (both flagged). |
| 5 | WS user-centricity | PASS | Dana goals + observable outcomes (a mode, a cropped file). |
| 6 | Priority validation | PASS | The pure crop math (largest fidelity risk, DESIGN QA-2) gets the mutation gate; the largest regression risk (QA-1) gets a headless-safe single-tab guard; the capture seams that can't run headless are honestly human-gated. |
| 7 | Observable behavior assertions | PASS | File on disk, recorded dimensions, download count, visible indicator text — all user-observable in this product domain. |
| 8 | Traceability coverage | PASS (with notes) | Check A: every US has a scenario. Check B: defaults applied (clean profile). |
| 9 | WS boundary proof | PASS | Strategy declared, real adapters, fake only on the non-deterministic picker, no in-memory drift. |

## Reviewer scope boundaries (skill compliance)

Deliberately OUT of scope for this self-review (other reviewers own them):
- **KPI measurability** — PO-reviewer, DELIVER post-merge gate (no KPI contract exists; no `@kpi` scenarios).
- **Infrastructure readiness** — PA-reviewer, DEVOPS→DISTILL handoff (headed-E2E CI budget / human gate; dependency-cruiser extension to crop-geometry.ts).
- **Code quality** — software-crafter-reviewer, DELIVER.

## Approval gate — mandate compliance

- **CM-A (Hexagonal boundary):** acceptance specs import only Playwright + the
  `no-network` fixture; they drive the popup/record page via the loaded extension
  and never import `src/` internals. Pure unit tests import the pure function
  signatures (`toCropRect`, `outputDimensions`, `messageForAction`, `targetForPath`)
  — those signatures ARE their driving ports. Zero internal-component imports.
- **CM-B (Business language):** Dana actor; observable outcomes; domain terms only
  as ubiquitous language.
- **CM-C (User-journey completeness):** each scenario has a user trigger, a single
  action, and an observable outcome with business value (a cropped video, an
  honest indicator, an unchanged default).
- **CM-D (Pure function extraction):** the crop geometry (the only non-trivial new
  logic) is extracted into the PURE `crop-geometry.ts` and tested headlessly;
  the mode/path discriminant is pure in `popup-logic.ts`/`recorder-host.ts`.
  Impure code (getDisplayMedia, canvas compositor, chrome.downloads) is exercised
  through the real record page / loaded extension, with fixture parametrization
  limited to the clean-profile adapter layer.
- **CM-E (Mandate 8 state-delta):** N/A by exemption — the new tests are pure
  functions with single return values (nw-tdd exemption) and layer-4+ acceptance
  E2E (traditional assertions permitted). The state-delta TS port is bootstrapped
  at `tests/common/state_delta.ts` for future state-mutating features; documented
  in wave-decisions.md.
- **CM-F (Mandate 9 PBT mode):** `@property` tags appear only on layer-1 pure-unit
  scenarios (crop clamping, positive-WxH, even-output, modeToPath totality);
  acceptance E2E (layer 4+) is example-only. No PBT machinery on any acceptance
  spec.
- **CM-G (Mandate 10 Tier B):** N/A. This is a config/flow-shaped feature — the
  cropped-window journey is 1-2 acceptance scenarios per slice and the rich input
  space (the crop rectangle) lives entirely in the PURE crop-geometry function,
  which IS the place PBT explores it. No ≥3-chained-scenario in-memory journey to
  model → Tier B correctly skipped.
- **CM-H (Mandate 11 sad paths):** layer-3+ sad paths (AC2.4 picker cancel, AC3.2
  out-of-window) are named example-based `@error` scenarios, no PBT machinery.

**Approval status: APPROVED.** No iteration needed. Handoff to DELIVER may proceed.
