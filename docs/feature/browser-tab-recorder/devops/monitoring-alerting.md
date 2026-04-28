# Monitoring and Alerting: BroShow

## Reality

A no-network browser extension distributed via the Chrome Web Store has **no production telemetry**. Standard SRE alerting (PagerDuty, on-call, page/urgent/warning tiers) does not apply. What does exist:

1. **Chrome Web Store review pipeline** — automated and human review at submission time. Rejections come via email.
2. **GitHub Actions failures** — pre-distribution. Notified via GitHub email/UI.
3. **User-reported issues** — store reviews, GitHub Issues, direct emails.
4. **In-extension health surface** — a privacy-respecting way the user can see "did the last recording work?" without anything leaving their browser.

This document defines those four lanes concretely.

## Lane 1: Chrome Web Store review pipeline

### What "monitoring" looks like
- CWS automated checks on every submission: malware scan, manifest validation, permission justification review.
- Human reviewer evaluates new permissions or significant behavior changes.
- Failure mode: submission **rejected** with reason emailed to the developer's CWS account.

### Setup checklist (one-time)
- [ ] CWS Developer account in good standing
- [ ] Privacy policy URL configured in CWS listing (must explain zero-network posture honestly)
- [ ] Permission justifications written for `tabCapture`, `offscreen`, and (currently) `storage` / `downloads` — see also `upstream-changes.md` for the permission reduction plan
- [ ] Email notifications enabled in CWS account settings
- [ ] Developer email subscribed to chrome-extensions announcement list (for breaking platform changes)

### Severity model
| Event | Severity | Response |
|-------|----------|----------|
| CWS rejection on submission | Page-equivalent | Same-day fix and resubmit |
| CWS warning (e.g. "permission justification weak") | Urgent | Fix before next release |
| Chrome platform deprecation announcement affecting tabCapture/offscreen | Urgent | Investigate within 1 week |

There is no runtime CWS health endpoint to poll. Submission is the only signal.

## Lane 2: GitHub Actions failures (pre-distribution)

### What "monitoring" looks like
- CI runs on every push to `main` and every PR.
- Failure → red X in GitHub UI + email to the committer (default GitHub behavior).

### Severity model
| Event | Severity | Response |
|-------|----------|----------|
| `main` build red | Page-equivalent (it blocks releases) | Revert or fix-forward same day |
| PR build red | Blocking (merge blocked) | Fix in the PR |
| Mutation testing job below 80% kill rate | Blocking when run | Add tests before merging |
| Permission-count or size-budget gate fails | Blocking | KPI violation; fix before merging |

### Notification channel
- GitHub email to committer (default).
- Optional: a `failure: true` job step that posts to the developer's preferred destination (e.g., Slack webhook to the developer's personal workspace). **Do NOT add a webhook that sends from the extension itself** — that would violate the zero-network KPI. CI-side webhooks are fine.

## Lane 3: User-reported issues

### Channels
- **Chrome Web Store reviews** — checked weekly by developer.
- **GitHub Issues** — repository-level. Issue template (future) prompts user to attach exported logs (see `observability-design.md`).
- **Email** — listed in CWS support contact.

### Triage rule of thumb
- Crash on common path → patch within 1 week.
- Cosmetic / single-user → backlog.
- Privacy concern → patch within 1 week regardless of severity.

## Lane 4: In-extension health surface (privacy-respecting)

### Design

A small, local, opt-out-able indicator visible in the popup:

```
┌─ BroShow ──────────────┐
│                        │
│  [ Start Recording ]   │
│                        │
│  Last recording: ✓     │  ← health surface
│  2 minutes ago, 4.2 MB │
└────────────────────────┘
```

States:
| State | Meaning |
|-------|---------|
| (not shown) | No prior recording in this browser profile |
| ✓ + timestamp + size | Last recording completed successfully |
| ⚠ + timestamp + reason | Last recording fell back to WebM (mp4 mux failed) |
| ✗ + timestamp + reason | Last recording failed |

### Source of truth

The service worker writes a single `lastRecording` record to `chrome.storage.local` on every recording completion (success or failure). The popup reads it on open. No network, no permission added, ~200 bytes of storage.

```typescript
// Conceptual shape
type LastRecording = {
  ts: number              // epoch ms
  outcome: 'ok' | 'fallback-webm' | 'error'
  reason?: string         // short, redacted; e.g. 'mp4-mux failed' (no PII)
  bytes?: number          // size of output, when applicable
}
```

### Why this counts as "monitoring"

It gives the user the same single piece of information a status page would give a service operator: *did the most recent operation succeed?* That is the highest-signal, lowest-cost form of monitoring this product can have without breaking the privacy contract.

### What it is NOT
- It is not a dashboard.
- It is not aggregated across users.
- It is not transmitted anywhere.
- It is not a replacement for CI gates — those still have to enforce the KPIs.

## Alerting matrix (consolidated)

| Trigger | Mechanism | Audience | Action |
|---------|-----------|----------|--------|
| `main` CI red | GitHub email | Developer | Revert or fix |
| PR CI red | GitHub PR UI | Developer | Fix in PR |
| Mutation kill rate < 80% (when run) | CI job exit | Developer | Add tests |
| KPI gate fail (permissions, size, network) | CI job exit | Developer | Reduce/refactor |
| CWS rejection | CWS email | Developer | Same-day fix |
| User-reported bug | GitHub Issue / email / CWS review | Developer | Triage per severity |
| User sees ⚠ or ✗ in popup | In-extension surface | End user | Optional log export → file issue |

## What we explicitly are NOT doing

| Standard practice | Why we skip it |
|-------------------|----------------|
| PagerDuty / Opsgenie | No on-call rotation; one developer |
| Synthetic monitoring (Pingdom, etc.) | Nothing to ping |
| Real-user monitoring (RUM) SaaS | Outbound network → KPI violation |
| Datadog / NewRelic / Honeycomb | Outbound network → KPI violation; also overkill |
| Slack from inside the extension | Outbound network → KPI violation |
| Status page (statuspage.io) | Nothing to surface; release-cadence communication via CWS listing notes is sufficient |

## Runbook stub (operational procedures)

For full runbook see future `docs/runbooks/`. Minimum entries:

- **CWS rejection received** → read rejection reason → identify minimal fix → apply → bump patch version → resubmit.
- **User reports recording fails** → request log export → reproduce locally → fix → release.
- **Chrome platform breaking change announced** → check if tabCapture/offscreen affected → if yes, update target chrome version in esbuild → re-test.
- **Permission count drift caught by CI** → review which permission was added → justify or remove → if justified, this is an `upstream-changes.md` event because it widens the privacy contract.
