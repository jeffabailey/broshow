# Wave Decisions: firefox-recording-support

> Forks the next wave (DESIGN / solution-architect) must resolve before
> implementation can proceed. DISCUSS captures the user-visible contract;
> DESIGN owns the technical decisions that satisfy it.

## DISCUSS Wave Decisions (already taken, recorded for traceability)

| # | Decision | Rationale | Source |
|---|----------|-----------|--------|
| D1 | Feature is cross-cutting (popup, background, manifest patcher, tests) | Touches multiple files but one bounded context | Caller-supplied |
| D2 | No walking-skeleton from scratch | v0.1.2 already ships; this feature unblocks one platform | Caller-supplied |
| D3 | Lightweight research depth | Same persona, same job as parent feature | Caller-supplied |
| D4 | No JTBD analysis | Same job as parent feature (one-click tab recording) | Caller-supplied |
| D5 | Honor Firefox's surface picker as part of the user-visible journey | We cannot suppress it; pretending otherwise produces silent capture errors | Phase 2 (journey divergence) |
| D6 | The Firefox journey gains a Step 2.5 ("Pick Surface") absent on Chrome | Honest material disclosure (clig.dev: respect the medium) | Phase 2 |
| D7 | Add a per-browser hint in the popup; do NOT alter the Chrome popup | Sets expectation, avoids surprise; Chrome path remains unchanged | Phase 2 |
| D8 | The recording-host implementation is a DESIGN decision, not DISCUSS | DISCUSS specifies the user-visible contract (host MUST survive 5 minutes); the chosen mechanism is architecture | Phase 2.5 + Risk register |
| D9 | Reuse existing mp4-mux + WebM fallback pipeline (ADR-002 unchanged) | Same output contract on Firefox as Chrome | Phase 4 |
| D10 | No new permissions added to the manifest | NFR parity; guardrail in outcome-kpis.md | Phase 4 |
| D11 | Walking skeleton = US-FF-01, US-FF-02, US-FF-03, US-FF-05 (4 stories) | Thinnest end-to-end Firefox slice that produces a downloadable file | Phase 2.5 |
| D12 | US-10 in the parent feature's user-stories.md is superseded by this feature | Original story was a placeholder ("If Firefox doesn't support tabCapture, document the limitation") | Phase 4 |

## Open Questions for DESIGN (DQs)

These are the explicit forks the next wave must resolve.

### DQ-1: Where does the recording host live on Firefox?

**The single biggest decision for this feature.** The user-visible contract
(US-FF-03) is that a 5-minute recording survives without popup interaction.
On Chrome this is satisfied by an offscreen document. Firefox has no offscreen
documents. Three candidates:

| Option | Pros | Cons | Open risk |
|---|---|---|---|
| **A. Popup** | Simplest. Same context that already calls `getStreamId` on Chrome. | Popup closes on blur. Recording dies. | Likely violates US-FF-03 unless user is told "keep popup open" — bad UX. |
| **B. Dedicated record-tab** | Survives blur. DOM available for MediaRecorder + mp4-mux. | Adds tab management UX (open, focus, close on stop). User sees an extra tab. | Visible UI artifact; cluttered tab bar; need to handle user closing the record-tab. |
| **C. Firefox MV3 `background.scripts` page** | Closest analogue to Chrome's offscreen document. Has DOM-ish access in Firefox MV3. Already configured by `patch-firefox-manifest.mjs`. | Can be unloaded by Firefox if "idle" — but MediaRecorder activity should keep it alive. Firefox MV3 background-page lifetimes are not as well-documented as Chrome's. | Risk of unload mid-recording; needs spike to validate 5-minute survival. |

**Recommendation for DESIGN to validate**: Option C first (cleanest mapping to
existing Chrome architecture). Spike: 5-minute recording, no popup
interaction, `background.scripts` page hosts MediaRecorder. If the page is
unloaded, fall back to Option B.

**Acceptance gate**: whichever option DESIGN picks, AC-FF-03 (5-minute
no-popup-interaction recording) MUST pass. If DESIGN cannot satisfy AC-FF-03
with any option, kick back to DISCUSS — the user-visible contract is the
floor.

### DQ-2: How does the popup choose which path to use?

The popup needs to decide between the Chromium offscreen-document path and the
Firefox `getDisplayMedia` path. Three candidates:

| Option | Pros | Cons |
|---|---|---|
| **A. Feature-detect (recommended)** | Already partially implemented in `popup.ts` `checkRecordingCapability`. Honest and forward-compatible. | Probe must be extended to differentiate path, not just supported/unsupported. |
| **B. User-agent sniff** | Simple. | Fragile, breaks on agent spoofing; anti-pattern. |
| **C. Build-time flag injected by `patch-firefox-manifest.mjs`** | Definitive at install time. | Couples runtime behavior to build pipeline; harder to test the matrix. |

**Recommendation for DESIGN**: Option A. Extend `CapabilityCheckResult` to
report which path was matched (e.g., `path: 'chromium-offscreen' | 'firefox-display-media' | 'unsupported'`).
The popup uses this to decide bootstrap and hint visibility.

### DQ-3: Does ADR-001 need a Firefox companion ADR or an amendment?

ADR-001 selected the offscreen document for MediaRecorder hosting. It already
acknowledges "Firefox compatibility requires a different approach." DESIGN
must record the chosen Firefox approach in one of:

- A new ADR (e.g., ADR-003: "Firefox recording host strategy")
- An amendment / "Consequences" addendum to ADR-001

**Recommendation**: New ADR (ADR-003), so the Firefox decision is independently
revisable.

### DQ-4: Does mp4-mux work in the chosen Firefox host context?

ADR-002 was validated inside an offscreen document (Chrome). Some host
contexts may have different memory or DOM constraints. DESIGN should confirm
mp4-mux runs in the Firefox host as part of the DQ-1 spike. If it cannot, the
decision is:

- **Option A**: WebM-only on Firefox (US-06 fallback path) and amend ADR-002
  to acknowledge Firefox constraint.
- **Option B**: Move mp4-mux to a different context (e.g., a dedicated
  worker) and accept the additional architectural complexity.

This question is contingent on DQ-1's outcome.

## Decision Forwarding

When DESIGN resolves these:

1. Update this document's "Open Questions" section with the chosen option per DQ.
2. Create / amend the relevant ADR(s).
3. If any chosen option violates an existing user-story acceptance criterion, kick the affected story back to DISCUSS for re-scoping rather than silently relaxing the criterion.

## Risk Summary (for DESIGN handoff)

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Recording host dies mid-recording on Firefox | Medium | High (loses recording) | Spike DQ-1 Option C first; have Option B ready as fallback. |
| Capability probe drift (Firefox path goes uncaught) | Low | Medium (silent break) | Extend probe to report path, single source of truth. |
| New permission required on Firefox | Low | Medium (guardrail breach) | Investigate before code; document as ADR amendment if unavoidable. |
| mp4-mux fails in chosen host context | Low | Medium (webm fallback covers it) | Spike during DQ-1; US-06 already absorbs this. |
| Chrome path regression from refactor | Low | High (parent feature broken) | Existing Chrome smoke matrix gates every PR; AC-FF-06 explicit. |
| Surface-picker UX confuses users | Medium | Low (no recording lost; just slower first use) | US-FF-04 hint copy; smoke-test interview during DELIVER. |
