# Acceptance Review: firefox-recording-support

> Wave: DISTILL (peer-review pass before handoff to DELIVER)
> Reviewer: acceptance-designer (self-review mode); 30 scenarios > 3, full
> review pass per skill instructions.
> Inputs: all spec files in `tests/acceptance/firefox-recording-support/`
> and the three new unit-level files in `tests/unit/`.

## Review output

```yaml
review_id: "accept_rev_20260429_firefox_recording_support"
reviewer: "acceptance-designer (review mode)"

strengths:
  - "Walking skeleton strategy is explicit and dual-track (Strategy C real Chromium + manual matrix for Firefox); both tracks are pinned to documented artifacts."
  - "Every AC-FF-01..10 has at least one scenario; multiple ACs are pinned redundantly at unit and acceptance levels for defense-in-depth."
  - "Error / negative-path scenarios are 14 of 30 = 47%, well above the 40% threshold (Mandate / Dim 1)."
  - "RED scaffolds use the TS template per the skill: __SCAFFOLD__ marker, throw with 'Not yet implemented -- RED scaffold' phrasing. Existing files (popup-logic, background-logic) are flagged for extension, not scaffolded."
  - "Driving ports invoked exclusively (initializePopup, createMessageHandler, selectHost, stripChromeOnlyPermissions). No internal-component imports in any spec."
  - "Discoverable @firefox @manual-fallback tag pattern keeps the Firefox lane visible in CI test output rather than silently absent."
  - "Network-zero KPI is asserted via the existing fixtures/no-network.ts helper (reused, not duplicated)."

issues_identified:
  happy_path_bias: []  # 47% error/edge ratio; no blocker
  gwt_format: []       # All scenarios follow Given/When/Then in comment blocks per repo convention; describe/it titles are business-focused
  business_language:
    # Notes -- not violations -- on residual technical terms in scenario titles:
    # 'manifest', 'permissions', 'mp4-mux', 'WebM', 'SW', 'getDisplayMedia',
    # 'tabCapture', 'offscreen' all appear in scenario titles or comments.
    # These are domain terms in this product (a browser extension that
    # records tabs as mp4) -- they are part of the ubiquitous language the
    # team uses with the user (Maria/Sam/Lin) AND with the product. A
    # browser-extension feature with zero browser-API names in its tests
    # would be Testing Theater. Per Dim 3 ("Domain terms from ubiquitous
    # language" are explicitly allowed), no violation.
    - issue: "Several scenarios reference 'mp4-mux' as a domain term in titles."
      severity: "info"
      recommendation: "Acceptable -- mp4-mux is the named technology in ADR-002 and in Maria's expected output (mp4 file). Keep."
  coverage_gaps: []    # All 10 ACs and all 7 user stories have at least one scenario
  walking_skeleton_centricity:
    - issue: "Chromium WS scenario titles name 'Sam' and end with observable user outcomes."
      severity: "info"
      recommendation: "Confirmed user-centric -- a non-technical stakeholder can confirm 'Sam never sees the hint' and 'a file appears in Downloads'."
  observable_behavior:
    - issue: "Two scenarios assert filesystem existence (downloaded file appears in DOWNLOAD_DIR or ~/Downloads)."
      severity: "info"
      recommendation: "Acceptable per Dim 7 -- the user-observable outcome of this product IS a file in the OS download folder. The user opens that folder and looks for the file. Filesystem-existence assertion equals observable-user-outcome assertion in this product domain."
  traceability_coverage:
    # Check A (Story-to-Scenario)
    # US-FF-01 -> scenarios 11, 20, 22, 23, 24
    # US-FF-02 -> scenarios 6, 7, 14
    # US-FF-03 -> scenario 8
    # US-FF-04 -> scenarios 22, 1, 21
    # US-FF-05 -> scenarios 6, 10, 16, 17
    # US-FF-06 -> scenario 9
    # US-FF-07 -> scenarios 14, 15 (via hadAudioTrack field on HostStartResult);
    #             popup-visible "Audio was not captured" copy is Release 2,
    #             post-walking-skeleton -- noted, not blocked.
    - issue: "US-FF-07 (audio-absent note) lacks a scenario asserting the popup-visible copy 'Audio was not captured'."
      severity: "info"
      recommendation: "Release 2 polish per story-map.md; the underlying hadAudioTrack field is pinned at HostStartResult shape (scenarios 14, 15). Adding the popup-copy scenario in DELIVER once the Release-2 polish lands is acceptable."
    # Check B (Environment-to-Scenario)
    # No environments.yaml in DEVOPS. Defaults: clean, with-pre-commit, with-stale-config.
    # The Chromium WS uses a clean profile (deletes user data dir each run -- launchChromiumExtension).
    # 'with-pre-commit' and 'with-stale-config' do not apply to a browser-extension feature
    # (no shell-installed tooling, no project-local config that survives between runs).
    - issue: "DEVOPS environments.yaml is missing; defaults applied."
      severity: "info"
      recommendation: "Logged. The browser-extension domain has only one meaningful environment: a clean browser profile, which is what every WS scenario uses (fs.rmSync of the profile dir before launch). Other defaults (with-pre-commit, with-stale-config) do not map to this feature. Forward to platform-architect to decide whether a feature-specific environments.yaml should declare the single 'clean-profile' env."
  walking_skeleton_boundary:
    - issue: "WS strategy declared and matched."
      severity: "info"
      recommendation: "PASS. Strategy C declared in distill/walking-skeleton.md; WS implementation uses real Chromium + real chrome.offscreen + real chrome.downloads + real local filesystem; no @in-memory on any @walking_skeleton scenario."

approval_status: "approved"
```

## Dimension-by-dimension verdict

| Dim | Pattern | Verdict | Notes |
|---|---|---|---|
| 1 | Happy path bias | PASS | 47% error/edge ratio (target 40%+) |
| 2 | GWT format compliance | PASS | Each scenario has a single Given context, single When action, observable Then. Comment blocks make this explicit. |
| 3 | Business language purity | PASS (with allowed domain terms) | Domain terms permitted by ubiquitous-language exception |
| 4 | Coverage completeness | PASS | All ACs covered; US-FF-07 popup copy noted as Release 2 |
| 5 | Walking-skeleton user-centricity | PASS | Sam/Maria are named actors; observable outcomes |
| 6 | Priority validation | PASS | The Chromium WS targets the largest risk (regression of v0.1.2 from the refactor); the Firefox manual matrix targets the riskiest assumption (user-gesture chain on Firefox MV3 background page, see DESIGN S-1) |
| 7 | Observable behavior assertions | PASS | All Then steps assert: button label, status text, hint visibility, file presence in download folder, network panel emptiness, manifest contents -- all user-observable in this product domain |
| 8 | Traceability coverage | PASS (with notes) | Check A: every US has a scenario. Check B: defaults applied. |
| 9 | Walking-skeleton boundary proof | PASS | Strategy declared, real adapters, no in-memory drift |

## Reviewer scope boundaries (skill compliance)

The following findings are DELIBERATELY out of scope for this review:

- **KPI measurability** -- owned by PO-reviewer in DELIVER post-merge gate.
  KPI 1..5 measurability is documented in `outcome-kpis.md` and not re-
  evaluated here.
- **Infrastructure readiness** -- owned by PA-reviewer at the DEVOPS->
  DISTILL handoff. The dependency-cruiser rules from D14 are noted but not
  audited here.
- **Code quality** -- owned by software-crafter-reviewer in DELIVER Phase 4.

## Approval gate

All four mandates verified:

- **CM-A (Hexagonal boundary)**: every spec imports only driving ports
  (`initializePopup`, `createMessageHandler`, `selectHost`,
  `stripChromeOnlyPermissions`, `patchManifestForFirefox`). Zero internal-
  component imports. Evidence in `wave-decisions.md` §"Mandate compliance".
- **CM-B (Business language)**: scenario titles use Maria/Sam/Lin actors and
  observable user outcomes; technical terms admitted only as ubiquitous-
  language domain vocabulary.
- **CM-C (User-journey completeness)**: every scenario has a user trigger
  (Given), a single behavior (When), and an observable outcome (Then) with
  business value.
- **CM-D (Pure function extraction)**: business logic (`shouldShowFirefoxHint`,
  `formatRecordingFilename`, `stripChromeOnlyPermissions`) is exercised at
  the pure-function level via vitest unit tests; impure code (real Chromium,
  real getDisplayMedia, real chrome.downloads) is exercised through adapter
  interfaces. Fixture parametrization is limited to the WS adapter layer
  (clean profile only, no environment matrix).

**Approval status: APPROVED.** No iteration needed. Handoff to DELIVER may
proceed.
