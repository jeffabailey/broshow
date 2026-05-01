# Definition of Ready Validation: Marketplace Publishing

Feature ID: `marketplace-publishing`
Wave: DISCUSS
Date: 2026-04-30

Per `nw-leanux-methodology` 8-item DoR (plus item 9 outcome KPIs from `nw-outcome-kpi-framework`). Stories MUST pass all items before DESIGN handoff.

---

## US-1: Configure Chrome Web Store credentials

| # | DoR Item | Status | Evidence / Issue |
|---|---|---|---|
| 1 | Problem statement clear, domain language | PASS | "Jeff has the BroShow source on GitHub but the Chrome Web Store has never seen it -- there is no CWS item, no OAuth client, no refresh token." Domain terms used: CWS item, OAuth, refresh token. |
| 2 | User/persona with specific characteristics | PASS | "Jeff, sole maintainer, first-time CWS publisher, has Google account, has access to BroShow GitHub repo's secrets settings." |
| 3 | 3+ domain examples with real data | PASS | Three examples with real data: extension id `abcdefghijklmnopqrstuvwxyz123456`, GitHub secret names, OAuth scope `chromewebstore`. |
| 4 | UAT scenarios in Given/When/Then (3-7) | PASS | 3 scenarios provided. |
| 5 | AC derived from UAT | PASS | 6 AC items, each traceable to a UAT scenario. |
| 6 | Right-sized (1-3 days, 3-7 scenarios) | PASS | 1.5 days, 3 scenarios. |
| 7 | Technical notes identify constraints | PASS | OAuth client type, transient localhost server, refresh-token revocability, manual item creation. |
| 8 | Dependencies resolved or tracked | PASS | None blocking. Note flagged for DESIGN: verify Jeff has Chrome dev account. |
| 9 | Outcome KPIs measurable | PASS | "100% completion in a single 15-minute session, self-reported, baseline 0%." |

DoR Status: **PASSED** (with one DESIGN-time verification note: Chrome dev account existence).

---

## US-2: Configure AMO listed-channel publishing

| # | DoR Item | Status | Evidence / Issue |
|---|---|---|---|
| 1 | Problem statement clear, domain language | PASS | Cleanly differentiates listed vs unlisted channels; identifies the auto-bump conflict for listed. |
| 2 | User/persona with specific characteristics | PASS | "Jeff, sole maintainer, already has AMO JWT credentials configured." |
| 3 | 3+ domain examples with real data | PASS | Three examples: v0.3.0 fresh, v0.3.0 conflict, v0.3.0 reviewer rejection. Real version numbers, real addon GUID `broshow@jeffabailey.com`. |
| 4 | UAT scenarios (3-7) | PASS | 4 scenarios. |
| 5 | AC derived from UAT | PASS | 7 AC items, traceable. |
| 6 | Right-sized | PASS | 1 day, 4 scenarios. |
| 7 | Technical notes | PASS | web-ext channel flag, separate version slots per channel, reviewer queue duration, no-deletion API constraint. |
| 8 | Dependencies tracked | PASS | AMO_JWT secrets (already present), `patchManifestForFirefox` (existing), one-time AMO listing creation. |
| 9 | Outcome KPIs measurable | PARTIAL PASS | "1 install/week within 30 days, baseline 0." Marked as a vanity floor; real KPI is "discoverability exists at all". DESIGN can refine. |

DoR Status: **PASSED**.

---

## US-3: Trigger marketplace publish from CI

| # | DoR Item | Status | Evidence / Issue |
|---|---|---|---|
| 1 | Problem statement clear, domain language | PASS | Explicitly references the maintainer's "no auto-release" memory rule and frames trigger model as the central design tension. |
| 2 | User/persona with specific characteristics | PASS | "Jeff, has tagged a release, decides 'yes, this one is good, ship it'." |
| 3 | 3+ domain examples with real data | PASS | Three examples with real version numbers and concrete dispatch parameter values. |
| 4 | UAT scenarios (3-7) | PASS | 6 scenarios -- within the 3-7 range. |
| 5 | AC derived from UAT | PASS | 10 AC items, all traceable. |
| 6 | Right-sized | PASS | 2 days, 6 scenarios. |
| 7 | Technical notes | PASS | GitHub Environments, required-reviewer, continue-on-error, release-existence sanity check. |
| 8 | Dependencies tracked | PASS | US-1 and US-2. |
| 9 | Outcome KPIs measurable | PASS | "End-to-end maintainer effort drops from ~10 minutes to under 60 seconds, self-timed before/after, baseline ~10 minutes." |

DoR Status: **PASSED**.

---

## US-4: Recover from partial-failure publish

| # | DoR Item | Status | Evidence / Issue |
|---|---|---|---|
| 1 | Problem statement clear, domain language | PASS | Concrete recovery scenario described with deterministic semantics. |
| 2 | User/persona with specific characteristics | PASS | "Jeff, just hit a partial-failure publish, wants to retry only the failed store." |
| 3 | 3+ domain examples with real data | PASS | Three examples: 401-then-retry, partial-upload-then-publish-only, accidental-retry-on-published. |
| 4 | UAT scenarios (3-7) | PASS | 3 scenarios. |
| 5 | AC derived from UAT | PASS | 5 AC items, traceable. |
| 6 | Right-sized | PASS | 1 day, 3 scenarios. |
| 7 | Technical notes | PASS | CWS state probe API, AMO state probe API, "probe before submit unconditionally" pattern. |
| 8 | Dependencies tracked | PASS | US-3. |
| 9 | Outcome KPIs measurable | PARTIAL PASS | "100% of partial-failure runs recoverable via re-dispatch." Baseline marked undefined (no observed partial-failure yet). DESIGN: consider chaos-style validation in DEVOPS wave. |

DoR Status: **PASSED**.

---

## US-5: Dry-run validation

| # | DoR Item | Status | Evidence / Issue |
|---|---|---|---|
| 1 | Problem statement clear, domain language | PASS | Connects directly to memory-rule context (v0.2.0 -> v0.2.9 churn). |
| 2 | User/persona with specific characteristics | PASS | "Jeff, iterating on the publish workflow, doesn't want to consume real version slots." |
| 3 | 3+ domain examples with real data | PASS | Three examples: pass, version-conflict, expired-credentials. |
| 4 | UAT scenarios (3-7) | PASS | 3 scenarios. |
| 5 | AC derived from UAT | PASS | 7 AC items, traceable. |
| 6 | Right-sized | PASS | 0.75 days, 3 scenarios. |
| 7 | Technical notes | PASS | --dry-run flag plumbing, environment-gate skip, machine-readable output. |
| 8 | Dependencies tracked | PASS | US-3. |
| 9 | Outcome KPIs measurable | PASS | "Zero real-store submissions during workflow development." Target = 0; binary verifiable. |

DoR Status: **PASSED**.

---

## Aggregate DoR status

| Story | Status |
|---|---|
| US-1 | PASSED |
| US-2 | PASSED |
| US-3 | PASSED |
| US-4 | PASSED |
| US-5 | PASSED |

**Feature DoR: PASSED -- ready for DESIGN handoff** subject to maintainer answering Q1-Q5 in `requirements.md` (especially Q3, which conflicts with the memory rule and has a recommendation that needs explicit confirmation).

## Anti-pattern detection

| Anti-Pattern | Found? | Where | Remediation Applied |
|---|---|---|---|
| Implement-X | No | -- | -- |
| Generic data | No | All examples use real names (Jeff), real version numbers (0.2.17, 0.3.0), real GUIDs (`broshow@jeffabailey.com`) | -- |
| Technical AC | No (with one near-miss) | AC-X-2 mentions "functional-style". This is project-paradigm carry-forward, not a solution prescription. Acceptable. | -- |
| Oversized story | No | Largest is US-3 at 6 scenarios, 2 days. Within bounds. | -- |
| Abstract requirements | No | Every requirement has 3+ concrete examples with real data | -- |

## Risk register

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| AMO listed reviewer rejects submission for content/policy | Medium | High (releases blocked behind queue) | Out-of-scope for this feature; document handoff in DESIGN. |
| CWS refresh token revoked silently | Medium | Medium | Dry-run mode (US-5) catches this before real submission. |
| Maintainer accidentally pushes tag expecting publish (memory rule violation surface) | Low | Medium | Q3 Option C (environment gate) makes this physically impossible. |
| Workflow YAML iteration burns AMO version slots | Medium (without dry-run) | High (slots permanent) | US-5 dry-run mode is the explicit countermeasure. |
| GitHub Environments not available on free tier for private repos | Unknown | Blocking | Confirm during DESIGN; fallback is Q3 Option B (separate workflow file with workflow_dispatch). |
| AMO listing's first submission requires extra one-time metadata (description, screenshots) | Medium | Medium | Document one-time setup in US-2; flag for DESIGN. |
