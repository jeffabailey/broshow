# Outcome KPIs: Marketplace Publishing

Feature ID: `marketplace-publishing`
Wave: DISCUSS

Defined per `nw-outcome-kpi-framework`. Note: this is an **Infrastructure/CI/CD** feature whose primary user is a single maintainer, not a multi-user product. KPIs therefore emphasize maintainer toil reduction and reliability metrics over consumer behavior. End-user discoverability metrics (AMO/CWS install counts) are included as secondary lagging indicators.

## Feature: marketplace-publishing

### Objective

By the end of the next quarter, BroShow releases reach Chrome Web Store and Firefox AMO listings via a one-click CI flow that respects the maintainer's "no auto-release" rule, eliminating manual dashboard toil while preserving the local sideload-test workflow.

### Outcome KPIs

| # | Who | Does What | By How Much | Baseline | Measured By | Type |
|---|---|---|---|---|---|---|
| 1 | Jeff (maintainer) | reduces wall-clock effort to ship a release to all stores | from ~10 minutes to under 60 seconds | ~10 min (3 min AMO listed if it existed + 7 min CWS dashboard) | Maintainer self-timed releases | Leading (primary) |
| 2 | Jeff (maintainer) | eliminates manual dashboard interactions per release | from 2 dashboards (CWS + AMO listed) to 0 | 2 today (CWS not even setup, AMO not on listed) | Workflow run summary; release retro | Leading (primary) |
| 3 | Jeff (maintainer) | runs zero accidental real-store submissions during workflow development | 0 accidents | undefined; risk high in absence of dry-run | Count of submitted-then-disabled CWS uploads or AMO listed versions | Leading (secondary, guardrail) |
| 4 | Jeff (maintainer) | recovers from a partial publish failure without re-tagging | 100% of partial failures recoverable via re-dispatch | undefined (no failure modes documented today) | Incident retro after first observed partial failure | Leading (secondary) |
| 5 | End user (Firefox AMO browser) | discovers and installs BroShow from `addons.mozilla.org` | floor of >= 1 install/week 30 days post-first-listed-publish | 0 (no listing exists today) | AMO developer dashboard install stats | Lagging |
| 6 | End user (CWS browser) | receives extension updates via Chrome Web Store auto-update mechanism | 100% of post-feature releases reach CWS auto-update | 0% (not on CWS today) | CWS dashboard "users" metric, version distribution | Lagging |

### Metric Hierarchy

- **North Star**: KPI #1 -- maintainer time-to-publish under 60 seconds. This is the single metric that captures whether the feature is delivering its core value.
- **Leading Indicators**:
  - KPI #2 (manual steps eliminated) -- predicts KPI #1.
  - KPI #3 (zero accidental submissions during dev) -- predicts feature stability and the maintainer's willingness to use the flow at all.
  - KPI #4 (partial-failure recoverability) -- predicts KPI #1 over time as failure modes emerge.
- **Guardrail Metrics** (must NOT degrade):
  - **Local sideload xpi flow**: `npm run sign` continues to produce a working unlisted-channel xpi. Verifiable: a single sign-and-drag-drop test on stock Firefox after each related code change.
  - **AMO version slot consumption**: must not exceed 2 slots per release (one unlisted, one listed). If slots consumed > 2 per release, something is wrong (e.g., dry-run accidentally submitting).
  - **Tag-push-only release behavior**: pushing `v*` MUST continue to produce a GitHub release with both build artifacts attached. The publish job is additive, not substitutive.
  - **Memory-rule preservation**: tag push MUST NOT trigger any marketplace submission. Verifiable: end-to-end test that pushes a sentinel tag and observes zero CWS/AMO API calls.

### Measurement Plan

| KPI | Data Source | Collection Method | Frequency | Owner |
|---|---|---|---|---|
| 1 | Maintainer self-report | Stopwatch on first 3 post-feature releases | Per release | Jeff |
| 2 | Workflow run summary | GitHub Actions `summary` artifact | Per release | Jeff |
| 3 | CWS dashboard "disabled uploads" count + AMO version history | Manual dashboard inspection during workflow iteration | During dev only | Jeff |
| 4 | GitHub Issue retro after first observed partial failure | Issue template `failure-retro.md` | Per incident | Jeff |
| 5 | AMO developer dashboard | Weekly snapshot starting at release | Weekly for 30 days, then monthly | Jeff |
| 6 | CWS developer dashboard | Weekly snapshot starting at release | Weekly for 30 days, then monthly | Jeff |

### Hypothesis

We believe that **a one-click GitHub-Actions-driven, environment-gated publish flow** for **the BroShow maintainer** will achieve **a >90% reduction in per-release dashboard toil** without violating the **no-auto-release** memory rule. We will know this is true when **Jeff** **completes 3 consecutive releases to both stores** in **under 60 seconds of active effort each**, with **zero accidental submissions** during workflow iteration.

### Notes for DEVOPS handoff

The platform-architect (DEVOPS wave) will need:

1. **Data collection requirements**: GitHub Actions workflow run summaries are sufficient for KPIs #1, #2, #4. KPIs #5, #6 read from CWS / AMO dashboards (no instrumentation needed in the workflow itself).
2. **Dashboard / monitoring needs**: none required. This is a low-cardinality, low-frequency event (releases). Logs in GitHub Actions are the dashboard.
3. **Alerting thresholds**: optional -- alert on KPI #3 (accidental submission detected: any CWS upload outside of a `dry_run=false` workflow run, any AMO listed submission outside same).
4. **Baseline measurement**: KPI #1 baseline of ~10 minutes is an estimate. If precise baseline is desired, time the next pre-feature release manually and record.

### Smell tests applied

| Check | KPI 1 | KPI 2 | KPI 3 | KPI 4 | KPI 5 | KPI 6 |
|---|---|---|---|---|---|---|
| Measurable today? | Yes | Yes | Yes | Yes | Yes (post-listing) | Yes (post-listing) |
| Rate not total? | Time per release (ratio) | Steps per release (ratio) | Count (binary target=0) | % of failures recovered (rate) | Installs/week (rate) | Coverage % (rate) |
| Outcome not output? | Yes (behavior change) | Yes (behavior change) | Yes (behavior change) | Yes (behavior change) | Yes (user behavior) | Yes (user behavior) |
| Has baseline? | Yes (~10 min, refine in DEVOPS) | Yes (2) | Soft (undefined, target=0) | Soft (undefined) | Yes (0) | Yes (0%) |
| Team can influence? | Yes (workflow design) | Yes | Yes (dry-run) | Yes (probe-before-submit) | Indirect (listing exists) | Indirect (CWS uptime) |
| Has guardrails? | Yes (sideload xpi must keep working) | Same | Same | Same | Same | Same |

All KPIs pass smell tests. KPIs 3 and 4 have soft baselines (undefined) which is acceptable because they measure the absence of failure modes that don't exist pre-feature.
