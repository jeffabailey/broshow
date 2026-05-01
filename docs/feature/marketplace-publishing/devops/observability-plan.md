# Observability Plan: Marketplace Publishing (DEVOPS)

Feature ID: `marketplace-publishing`
Wave: DEVOPS
Date: 2026-04-30

This document defines what gets logged where and how the outcome KPIs from DISCUSS are instrumented in the workflow. Per `outcome-kpis.md` "Notes for DEVOPS handoff" section: this is a low-cardinality, low-frequency feature (releases, not user requests). GitHub Actions workflow logs and step summaries are the dashboards. No external observability stack (Grafana/Prometheus/Datadog) is required or recommended.

## 1. Logging surface inventory

The publish workflow has FOUR observability surfaces. Each has a defined purpose and content discipline.

| Surface | Audience | Content | Retention |
|---|---|---|---|
| Step logs (per-step `run:` stdout/stderr) | Maintainer debugging a failure | Structured key=value or one-line JSON per significant operation. NO secrets. | 90 days (GitHub default for public repos) |
| `$GITHUB_STEP_SUMMARY` (Markdown) | Maintainer viewing run outcome | Per-target Markdown table; recovery hint if any failure; KPI line | Forever (attached to workflow run) |
| Per-target outcome JSON artifact | aggregate-summary job; not for human consumption | Typed `PublishOutcome` round-trip data | 7 days (set in `upload-artifact`) |
| Workflow output (`steps.kpi.outputs.*`) | Downstream automation (e.g., future maintainer dashboard read via `gh run view`) | Just the time-to-publish metric in seconds | Forever (attached to workflow run) |

## 2. Adapter logging contract

Each adapter (`cws-adapter.effect.mjs`, `amo-listed-adapter.effect.mjs`) emits structured log lines via `console.log` or `console.error`. Format: **one-line key=value** for grep-ability, OR **one-line JSON** when nesting is needed. Never multi-line unless dumping a fixture for diagnostic purposes (and then prefixed with `::group::` so logs collapse in the GitHub UI).

### Required log lines per adapter operation

#### CWS adapter

| Phase | Log line (template) | Notes |
|---|---|---|
| OAuth start | `cws.oauth.start client_id=<masked-prefix>...` | Only first 4 chars of client_id; never the secret |
| OAuth success | `cws.oauth.ok expires_in=<seconds>` | Never log access_token; `::add-mask::` it |
| OAuth failure | `cws.oauth.err code=<google-err-code> msg="<message>"` | Google's error codes are public/non-secret |
| Probe start | `cws.probe.start extension_id=<value>` | Extension ID is not secret |
| Probe success | `cws.probe.ok upload_state=<state> draft_version=<version-or-none>` | |
| Probe failure | `cws.probe.err code=<http-status> msg="<sanitized>"` | |
| Upload start | `cws.upload.start extension_id=<value> zip_path=<path> zip_size_bytes=<n>` | |
| Upload progress | (none; upload is a single PUT) | |
| Upload success | `cws.upload.ok upload_state=SUCCESS` | |
| Upload failure | `cws.upload.err code=<http-status> classified=<rate_limited|payload_too_large|version_conflict|unknown>` | |
| Publish start | `cws.publish.start target=<default|trustedTesters|upload-only>` | upload-only short-circuits before any POST |
| Publish success | `cws.publish.ok status=<google-status-array>` | |
| Publish failure | `cws.publish.err code=<http-status> classified=<...>` | |
| Adapter exit | `cws.exit outcome=<success|already-published|failure|dry-run-ok>` | |

#### AMO listed adapter

| Phase | Log line (template) | Notes |
|---|---|---|
| Probe start | `amo.probe.start addon_guid=<value>` | GUID is not secret (it's in the public listing URL) |
| Probe success | `amo.probe.ok listed_versions_count=<n>` | |
| Probe failure | `amo.probe.err code=<http-status> classified=<rate_limited|auth_expired|unknown>` | |
| Sign start | `amo.sign.start xpi_path=<path> version=<value> channel=listed` | |
| Sign progress | `amo.sign.progress phase=<upload|validate|sign|finalize>` | If web-ext stdout indicates phase transitions |
| Sign success | `amo.sign.ok submission_id=<value> listing_url=<value>` | Submission ID is non-secret; appears in AMO email |
| Sign failure | `amo.sign.err code=<webext-exit-code> classified=<...> stderr_excerpt="<truncated>"` | |
| Adapter exit | `amo.exit outcome=<success|already-published|failure|dry-run-ok>` | |

### Sanitization rules

Before logging, every adapter MUST run incoming error responses through a sanitizer:
1. Strip any header named `Authorization`, `X-API-Key`, `Cookie`, `Set-Cookie`.
2. Strip any JSON field named `access_token`, `refresh_token`, `client_secret`, `id_token`, `*_secret`, `*_token` (case-insensitive).
3. Truncate any stderr/stdout from `web-ext` to first 500 chars.
4. Apply `::add-mask::` to any value before printing if uncertain whether it might be sensitive.

The sanitizer is a pure function in `decisions.pure.mjs::sanitizeForLog` (DELIVER implements per design).

### Forbidden log content

- Secret values: `CWS_*`, `AMO_JWT_*`, derived access tokens, JWTs we generate.
- Stack traces from network errors that include cookies or headers.
- Raw HTTP response bodies that have not been sanitized.
- Any value passed via `process.env.CWS_*` or `process.env.AMO_*`.

A grep CI step verifies this discipline (per `secret-inventory.md` section 5).

## 3. Step summary contract

The `aggregate-summary` job is the only writer to `$GITHUB_STEP_SUMMARY`. Per-target jobs do NOT write to summary directly (they write outcome JSON to artifact, which aggregate consumes). This single-writer pattern keeps the summary deterministic.

### Markdown layout (rendered by `decisions.pure.mjs::renderSummary`)

```markdown
# BroShow Marketplace Publish — v0.3.0

**Mode**: publish
**Targets requested**: cws,amo-listed
**Run started**: 2026-04-30T18:42:11Z
**Run completed**: 2026-04-30T18:43:08Z
**Wall-clock**: 57s

## Per-target outcomes

| Target | Version | Status | Classification | Message | Dashboard |
|--------|---------|--------|----------------|---------|-----------|
| cws | 0.3.0 | success | published | Submitted for review | https://chrome.google.com/webstore/detail/abcdefghijklmnopqrstuvwxyzabcdef |
| amo-listed | 0.3.0 | success | published | Submission `1234567` accepted | https://addons.mozilla.org/en-US/firefox/addon/broshow/ |

## Maintainer KPI

- **Time to publish**: 57s (target: <60s, north star)
- **Manual dashboard interactions**: 0 (target: 0)
```

### Failure variant (any target failed)

```markdown
# BroShow Marketplace Publish — v0.3.0

**Mode**: publish
**Targets requested**: cws,amo-listed

## Per-target outcomes

| Target | Version | Status | Classification | Message | Dashboard |
|--------|---------|--------|----------------|---------|-----------|
| cws | 0.3.0 | success | published | Submitted for review | https://chrome.google.com/webstore/detail/abc... |
| amo-listed | 0.3.0 | failure | rate_limited | HTTP 429: rate limited (Retry-After: 3600s) | https://addons.mozilla.org/en-US/developers/addon/broshow |

## Recovery

The following targets need re-dispatch:
- amo-listed (rate_limited; retryable next run)

Re-dispatch this workflow (Actions -> Release -> Run workflow) with:
```
tag:     v0.3.0
targets: amo-listed-only
mode:    publish
```

After waiting at least 60 minutes for AMO rate limit to clear.

See: docs/release.md#recovery
```

### Auth-failure variant

```markdown
## Recovery

The following targets need credentials rotated:
- cws (auth_expired; refresh token revoked or expired)

1. On your local machine, run: `node scripts/cws-bootstrap.mjs`
2. Paste the new `CWS_REFRESH_TOKEN` into:
   Settings -> Environments -> marketplace-prod -> CWS_REFRESH_TOKEN
3. Re-dispatch with: targets: cws-only, mode: publish
```

### Dry-run variant

```markdown
# BroShow Marketplace Publish — v0.3.0 (DRY-RUN)

**Mode**: dry-run (no writes performed)

## Per-target outcomes (would-publish)

| Target | Version | Pre-flight | Notes |
|--------|---------|------------|-------|
| cws | 0.3.0 | clear | No prior version on store; would upload + publish |
| amo-listed | 0.3.0 | clear | No prior listed version; would submit via web-ext sign |

Workflow inputs to perform a real publish:
- targets: cws,amo-listed
- mode: publish
```

## 4. Failure-mode classification taxonomy

The orchestrator's `aggregateOutcomes` and `renderSummary` (both pure) consume the typed `PublishOutcome` returned by each adapter. The `classification` field is one of:

| Classification | Meaning | Retryable? | Recovery |
|---|---|---|---|
| `published` | Target accepted submission | -- | None |
| `already-published` | Version already exists on store; idempotent re-run | N/A | None (success-equivalent) |
| `rate_limited` | 429 / quota exceeded | Yes (after delay) | Re-dispatch tomorrow with same targets |
| `auth_expired` | OAuth invalid_grant or AMO 401 | Yes (after rotation) | Re-mint refresh token via `cws-bootstrap.mjs` (CWS) or new JWT key (AMO) |
| `version_conflict` | Listed version doesn't match tag (Q4 fail-hard) | No | Bump tag (`git tag v0.3.1; git push origin v0.3.1`) and re-dispatch |
| `payload_too_large` | Zip exceeds store limit | No | Reduce extension size or split assets |
| `upstream_api_down` | 5xx from store | Yes (after store recovers) | Re-dispatch when status page green |
| `unknown` | Anything not pattern-matched | No | Inspect run logs; file issue |

This taxonomy is the contract between `*-adapter.effect.mjs` (which classifies) and `decisions.pure.mjs::renderSummary` (which renders the recovery hint). It is also what `with-amo-throttle-active`, `with-cws-rate-limit-active`, and `with-stale-cws-token-near-expiry` test envs (in `environments.yaml`) exercise.

## 5. KPI instrumentation

Per `outcome-kpis.md`, six KPIs are defined. Their instrumentation:

### KPI #1 — Maintainer time-to-publish (north star)

**Target**: <60 seconds wall-clock from "click Run workflow" (or tag push for build-only) to publish completion.

**Measurement**: computed in the `aggregate-summary` job:
```js
const runStartedAt = new Date(process.env.RUN_STARTED_AT);  // GitHub provides this
const now = new Date();
const seconds = Math.round((now - runStartedAt) / 1000);
fs.writeFileSync('./kpi-time-to-publish.txt', String(seconds));
```

The value is:
1. Embedded in the step summary (Maintainer KPI section, line "Time to publish: 57s").
2. Exposed as workflow output `steps.kpi.outputs.kpi_time_to_publish_seconds` for any downstream automation.
3. Read by the maintainer's manual baseline collection (KPI #1 measurement plan: "Maintainer self-report; Stopwatch on first 3 post-feature releases").

**Note on baseline**: `outcome-kpis.md` baseline of ~10 minutes is a maintainer estimate. After the first 3 post-feature releases, the maintainer should record the actual wall-clock and refine. The measurement infrastructure (workflow output) makes precise measurement free for any future iteration.

### KPI #2 — Manual dashboard interactions per release

**Target**: 0.

**Measurement**: implicit. The publish workflow performs all submissions; no maintainer dashboard interaction is required for the publish step. Recorded once in the post-release retro (per measurement plan).

The step summary line "Manual dashboard interactions: 0" is a sanity check, not a derived metric. If non-zero (e.g., maintainer had to manually click a CWS dashboard button to recover from an unexpected state), the maintainer notes it in the issue tracker.

### KPI #3 — Zero accidental real-store submissions during workflow development

**Target**: 0.

**Guardrail enforcement** (structural, not measurement):
- Dry-run mode is the developer's escape hatch — no env gate, no writes.
- Environment gate prevents non-dry-run from running without explicit click.
- The `with-stale-cws-token-near-expiry` and `with-cws-rate-limit-active` envs in DISTILL exercise the boundary cases without ever hitting real APIs.

**Measurement**: maintainer-driven, post-hoc. After each iteration cycle, maintainer checks the CWS dashboard "disabled uploads" count and AMO version history. Expected: 0.

**Optional alert** (deferred to future): a small script in `aggregate-summary` could check `mode != dry-run && environment_approved == false` and emit a workflow annotation if it detects an unauthorized publish attempt. Defer because it's a structural impossibility under the current YAML (the environment gate prevents it).

### KPI #4 — Partial-failure recoverability

**Target**: 100% of partial failures recoverable via re-dispatch.

**Measurement**: post-incident only (after first observed partial failure). Recorded in a GitHub Issue using a future `failure-retro.md` template.

**Instrumentation contribution**: the `Recovery` section of the step summary makes this measurable (it provides the exact re-dispatch parameters; if the maintainer copy-pastes them and the recovery succeeds, that's a "yes" for the KPI).

### KPI #5 — End-user AMO discoverability

**Target**: >=1 install/week 30 days post-first-listed-publish.

**Measurement**: external — AMO developer dashboard install stats. NO workflow instrumentation needed (per `outcome-kpis.md` notes).

**Workflow contribution**: the publish workflow MUST emit the `listing_url` in the step summary so the maintainer can click straight to the AMO listing's stats page after publish.

### KPI #6 — End-user CWS auto-update coverage

**Target**: 100% of post-feature releases reach CWS auto-update.

**Measurement**: external — CWS dashboard "users" metric, version distribution. NO workflow instrumentation needed.

**Workflow contribution**: emit CWS dashboard URL in step summary.

## 6. Guardrail metrics (KPIs that must NOT degrade)

Per `outcome-kpis.md` Guardrail Metrics section:

| Guardrail | How verified |
|---|---|
| Local sideload xpi flow continues to work | Acceptance test in DISTILL exercises `npm run sign`; manual `web-ext run -t firefox-desktop` smoke test post-deploy by maintainer |
| AMO version slot consumption <= 2 per release | Post-release manual check on AMO dashboard; expected one unlisted slot + one listed slot per release |
| Tag-push-only release behavior preserved | DISTILL acceptance test: push sentinel tag, observe build job ran but no publish job ran (AC-X-5) |
| Memory-rule preservation (tag push triggers no submission) | Same as above + structural enforcement: publish job has `if: github.event_name == 'workflow_dispatch'` |

## 7. Alerting (intentionally minimal)

This is a low-frequency event-based feature (releases, not requests). Traditional alerting (PagerDuty, threshold-based) is over-engineered.

**Alerts in scope**:
- GitHub workflow failure email (built-in; you'll receive when the run is red).
- Step summary acts as a pseudo-alert: if you see a `Recovery` section, action is required.

**Alerts deferred**:
- Slack/Discord notification on KPI #3 trip — nice to have, not blocking. Could be added later as a workflow_run-triggered companion workflow that posts to a webhook.
- Daily/weekly digest of KPI #1 trends — not meaningful at single-maintainer release cadence.

## 8. Dashboard (intentionally minimal)

**Dashboard for this feature = the GitHub Actions workflow runs page.** No external dashboard is created or maintained.

The step summary's Markdown table IS the dashboard for any individual run. The list of recent runs at https://github.com/jeffabailey/broshow/actions/workflows/release.yml IS the historical dashboard.

If the maintainer ever wants a programmatic time-series of KPI #1, they can run:
```bash
gh run list --workflow=release.yml --json databaseId,createdAt,updatedAt | \
  jq '.[] | {id: .databaseId, started: .createdAt, ended: .updatedAt}'
```
to derive durations across runs. Not built; deferred until the maintainer asks.

## 9. Compliance summary (DEVOPS Phase 6 production readiness)

| Requirement | Status |
|---|---|
| Structured logging defined | YES (section 2 contract) |
| Failure-mode classification taxonomy | YES (section 4) |
| Step summary contract | YES (section 3) |
| KPI instrumentation per outcome-kpis.md | YES (section 5) |
| Secret hygiene (no log leaks) | YES (sanitizer in section 2; grep guard in `secret-inventory.md` section 5) |
| Guardrail metrics covered | YES (section 6) |
| Alerting strategy | INTENTIONALLY MINIMAL (section 7) |
| Dashboard strategy | INTENTIONALLY MINIMAL (section 8) |
