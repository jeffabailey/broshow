# Requirements: Marketplace Publishing

Feature ID: `marketplace-publishing`
Feature type: Infrastructure (CI/CD/DevOps)
Wave: DISCUSS
Date: 2026-04-30

## 1. Problem statement

Today the BroShow release workflow (`.github/workflows/release.yml`) builds a Chrome zip and a self-distributable AMO-signed xpi, attaches both to a GitHub release, and stops. The maintainer (single-person project, Jeff) then has to manually:

1. Open the Chrome Web Store dashboard, drag the zip in, fill the listing form, and click submit.
2. (Optionally) open the AMO developer dashboard, upload the xpi to the **listed** channel, and click submit.

Both steps are toil that scale poorly with release cadence (most recent: v0.2.17 on 2026-04-30, after a long version-churn lesson captured in `feedback_no_auto_release.md`). They also create a window where the GitHub release is published but the marketplaces are not yet updated, confusing users who install via the stores.

The intent of this feature is to extend the existing release workflow so that a tagged release can also publish to the Chrome Web Store and (optionally) the Firefox AMO listed channel from CI, with maintainer control over **when** that publish step actually fires.

## 2. Stakeholders

| Stakeholder | Need | Constraint |
|---|---|---|
| Maintainer (Jeff) | Single command/click to ship to all stores after a tag | Must NOT auto-publish on every change (memory rule) |
| End users (Chrome) | Updated extension available via Chrome Web Store | CWS review may take hours-days |
| End users (Firefox) | Updated extension available via addons.mozilla.org listing | AMO listed review may take hours-days |
| End users (sideload Firefox) | Self-distributable signed xpi continues to work | Existing unlisted-channel flow must stay intact |
| Repo collaborators | Ability to read CI logs and understand failures | Secrets must not leak into logs |

## 3. Domain language (ubiquitous)

| Term | Definition |
|---|---|
| **Listed channel** (AMO) | Submission published on `addons.mozilla.org`; goes through Mozilla reviewer queue; discoverable via search. |
| **Unlisted channel** (AMO) | Submission signed by Mozilla but only available via direct URL/self-distribution; current behavior. |
| **Item** (CWS) | A Chrome Web Store extension entry, identified by `CWS_EXTENSION_ID` (32-char hex). |
| **publishTarget** (CWS) | Either `default` (publish to all users on approval) or `trustedTesters` (publish to opted-in testers only). |
| **AMO version slot** | A version string permanently reserved on first submission; identical strings cannot be re-uploaded. |
| **Marketplace publish** | The act of pushing an artifact to CWS or AMO listed; distinct from "GitHub release" which is artifact attachment only. |
| **Source-of-truth tag** | The git tag (e.g., `v0.2.18`) whose `version` field in `manifest.json` defines the canonical release version. |

## 4. Functional requirements

### FR-1: Trigger model
The workflow MUST support publishing to marketplaces under explicit maintainer control, not on every tag.
- The workflow MUST NOT auto-publish on tag push by default.
- The maintainer MUST be able to publish without re-tagging or re-building.

### FR-2: Chrome Web Store publish
Given a built and validated Chrome zip, the system MUST be able to upload that zip to a configured Chrome Web Store item and (optionally) submit it for review.
- The CWS item MUST be pre-created in the dashboard (one-time manual setup).
- Authentication MUST use OAuth refresh-token flow with secrets stored in GitHub Actions.
- The system MUST handle CWS API errors (version conflict, oversized payload, missing privacy disclosure) with actionable log output.

### FR-3: AMO listed publish (optional)
Given a built Firefox xpi, the system MAY also submit that xpi to the AMO **listed** channel (in addition to or instead of the existing unlisted-channel signing).
- Listed-channel submission MUST use the same `AMO_JWT_ISSUER` / `AMO_JWT_SECRET` already configured.
- Listed-channel submission MUST use the source-of-truth tag version, not the auto-bumped patch version (see FR-5).
- The existing unlisted-channel signing MUST continue to work (sideload xpi for stock Firefox testing remains a supported path).

### FR-4: Idempotency and re-runs
Re-running the publish step against a version already accepted by a marketplace MUST surface a clear "already published" outcome, not a silent failure or duplicate submission.

### FR-5: Version handling
- For CWS: the uploaded zip's `manifest.json` `version` MUST equal the source-of-truth tag version.
- For AMO **listed**: the submitted xpi's `manifest.json` `version` MUST equal the source-of-truth tag version. Auto-bump is forbidden on the listed channel because it would diverge listed and source-of-truth versions.
- For AMO **unlisted**: existing auto-bump via `find-next-amo-version.mjs` MUST remain available (sideload distribution case).

### FR-6: Failure isolation
A failure publishing to one marketplace MUST NOT abort an in-flight publish to the other.
- If CWS fails after AMO succeeds (or vice versa), the workflow MUST continue, report both outcomes, and exit non-zero only at the end.
- Log output MUST clearly identify which marketplace(s) succeeded and which failed.

### FR-7: Observability
- Each publish attempt MUST log: marketplace, version, outcome (success/failure/skipped), and a link to the relevant dashboard (CWS item URL or AMO listing URL) on success.
- Secrets MUST NOT appear in logs.

### FR-8: Dry-run / validation mode
The workflow MUST support a dry-run mode that validates credentials and artifact shape without actually submitting to the stores. This protects against burning AMO/CWS submission slots during workflow development.

## 5. Non-functional requirements

### NFR-1: Idempotency
Re-running publish against an already-published version produces an "already published" outcome, not a duplicate submission, not a silent overwrite. Verifiable: trigger publish twice on the same tag, second run exits 0 (or non-zero with a clear "already published" classification, never hangs or duplicates).

### NFR-2: Observability
Every publish attempt produces a structured log line: `marketplace={cws|amo-listed|amo-unlisted} version={x.y.z} outcome={success|failure|skipped|already-published} duration_seconds={n}`. CI summary surfaces this without scrolling raw logs.

### NFR-3: Fail-safe (one store down does not block the other)
Marketplace publishes run as **independent** GitHub Actions jobs (or steps with `continue-on-error: true` and end-of-run aggregation). Verifiable: simulate CWS auth failure, AMO listed publish still completes successfully.

### NFR-4: Security
- All secrets stored in GitHub repository secrets, never in code.
- Refresh tokens MUST be revocable from CWS/AMO dashboard without code change.
- Workflow MUST NOT echo secret values; MUST use `::add-mask::` if any secret-derived value (e.g., access token) is constructed.

### NFR-5: Performance
- Total publish time (both stores, happy path) under 5 minutes excluding marketplace review queue time (which is outside our control).
- AMO listed and CWS submissions run in parallel where the API allows (no sequential coupling).

### NFR-6: Recoverability
If CWS upload fails but AMO succeeds (or inverse), the maintainer MUST have a documented path to retry only the failed store without re-doing the successful one. Implementation: per-store workflow_dispatch input (e.g., `targets: cws,amo,both`) or separate per-store workflow files.

### NFR-7: Compliance with maintainer's release rule (memory constraint)
The publish flow MUST NOT bypass the maintainer's "wait for explicit go-ahead before bumping version, tagging, or pushing" rule (see `~/.claude/projects/.../memory/feedback_no_auto_release.md`). Specifically: publish MUST require an explicit human action separate from `git push origin v*`.

## 6. Critical product questions (require maintainer decision)

These five questions cannot be silently decided -- they shape the user-visible behavior of the workflow and at least one of them conflicts with an existing memory rule.

---

### Q1: AMO listed channel -- add it, replace unlisted, or skip?

**Context.** Today AMO signing uses the **unlisted** channel: produces a self-distributable xpi attached to the GitHub release, NOT discoverable on `addons.mozilla.org`. Listed channel WOULD be discoverable but requires Mozilla reviewer approval (typically hours, sometimes days).

**Options:**

| Option | Description | Trade-offs |
|---|---|---|
| A | Skip AMO listed; keep unlisted-only as today | No public AMO listing. Users must install via direct xpi link from GitHub release. Simplest. |
| B | Add AMO listed alongside unlisted | Both produced per release: listed for store users, unlisted for sideload testing. Doubles AMO version slot consumption (one per channel). |
| C | Switch to AMO listed only, drop unlisted | Loses the local-test sideload path that the user relies on per `feedback_no_auto_release.md`. **Not recommended.** |

**Recommended: Option B** (additive -- preserves the sideload xpi flow that the user actively depends on for local testing, while exposing a discoverable listing for end users). Note that AMO consumes a version slot per channel per submission, so this doubles slot consumption.

---

### Q2: Chrome Web Store -- auto-publish after upload, or upload-only?

**Context.** CWS API supports two states: upload (item updated in dashboard, NOT live) and publish (submitted for review, then live on approval). Once an upload exists, an item must be either published or replaced -- the upload state itself is not user-visible.

**Options:**

| Option | `publishTarget` | Trade-offs |
|---|---|---|
| A | Upload only, no publish | Maintainer reviews in CWS dashboard before clicking "Submit for review" manually. Safest. |
| B | `publishTarget=default` (publish to all users) | One-step. Goes straight into review queue. Users get update on approval. Riskiest -- no "look before you ship" gate. |
| C | `publishTarget=trustedTesters` | Publishes to opted-in testers only. Maintainer can verify before promoting. Requires trusted-tester group setup. |

**Recommended: Option B** for normal releases (this is a single-maintainer FOSS project; the maintainer already gates releases via tag + the memory-rule "explicit go-ahead" pattern; adding a second manual step in the CWS dashboard duplicates that gate). Provide Option A as a workflow_dispatch input (`cws_publish: upload-only|default|trustedTesters`) for the rare case the maintainer wants to inspect first.

---

### Q3: Trigger model -- how does the publish actually fire?

**Context.** This is THE question that conflicts with the maintainer's memory rule. The rule says "do not auto-bump / auto-tag / auto-push on every change; wait for explicit go-ahead." Auto-publishing on tag push would technically still require a manual tag, but it changes the semantic: today a tag means "snapshot artifacts on GitHub", not "publish to stores". Some tags are diagnostic (cf. v0.2.0 -> v0.2.9 churn).

**Options:**

| Option | Trigger | Conflict with memory rule? |
|---|---|---|
| A | Auto-publish on tag push | **YES** -- silently re-purposes `git tag v*` as "ship to stores", which the user has already burned themselves with. **Not recommended.** |
| B | Separate `publish-stores.yml` triggered by `workflow_dispatch` only (maintainer enters tag/version in GitHub UI) | NO -- explicit human action distinct from tagging. Recommended. |
| C | `release.yml` keeps tag-build behavior; adds a `publish-stores` job gated by a GitHub Environment with required reviewer (publish job pauses for explicit approval before running) | NO -- approval gate IS the "explicit go-ahead". Equivalent to B but keeps everything in one workflow. |
| D | Hybrid: tag push runs build+attach-to-release (today's behavior); a SEPARATE `workflow_dispatch` step (or environment-gated job) runs publish | NO -- Option B and C combined. Most flexible. |

**Recommended: Option C** (single workflow, environment-gated publish job). Reasons: (1) keeps the build artifacts in the same workflow run as the publish, so the "what got published" provenance is one workflow run; (2) GitHub Environments with required reviewers give a built-in approval UI; (3) preserves the memory rule: the publish only happens after an explicit human click. Option B is an acceptable alternative if the maintainer prefers the trigger to be fully separate.

---

### Q4: Version conflict handling

**Context.**
- AMO **unlisted** today auto-bumps via `find-next-amo-version.mjs` (rationale: sideload xpi can have a version drift from the source tag because users install by drag-drop, not by version-comparison-against-store).
- AMO **listed** with auto-bump would mean the public listing's version diverges from the git tag. Users running `chrome.runtime.getManifest().version` would see a different number than the GitHub release. This is confusing and undesirable.
- CWS does not support auto-bump (no probe API like AMO's; conflicts surface as a hard API error).

**Options:**

| Option | Listed AMO behavior | CWS behavior |
|---|---|---|
| A | Listed uses tag version verbatim; FAIL hard on conflict (require maintainer to bump tag and re-cut release) | FAIL hard on conflict (same) |
| B | Listed auto-bumps like unlisted | CWS still fails hard (asymmetric, confusing) |
| C | All channels FAIL hard; expose a `force_version` workflow_dispatch input for the rare override | Same |

**Recommended: Option A** (or its equivalent C). For listed/CWS, the canonical version is the git tag; auto-bumping is wrong because it silently desyncs the public listing from the source-of-truth. AMO **unlisted** keeps the existing auto-bump (this is the sideload-test flow where version-drift is acceptable). On listed/CWS conflict, the workflow MUST exit non-zero with a message: "Version X.Y.Z already exists on {marketplace}. Bump source manifest, re-tag, and re-run."

---

### Q5: Failure isolation and recovery path

**Context.** If CWS upload fails after AMO listed succeeds, the maintainer is in a half-published state. The GitHub release exists with both artifacts; AMO listing has v0.2.18; CWS still has v0.2.17. We need a documented recovery path.

**Options:**

| Option | Recovery semantic |
|---|---|
| A | Per-store retry: `workflow_dispatch` input `targets: cws,amo-listed,both` allows re-running publish for ONLY the failed store | Cleanest. Aligns with NFR-3 fail-safe. |
| B | All-or-nothing: failed store rolls back the successful store | Not actually possible -- AMO does not support deleting a submitted version, only disabling it. |
| C | No automatic recovery; document manual steps in `docs/release.md` | Lowest effort but error-prone. |

**Recommended: Option A**. The publish workflow accepts a `targets` input (default: `both`); on a half-failed run, the maintainer re-dispatches with `targets: cws` (or whichever failed). Combine with NFR-3 (jobs run in parallel with `continue-on-error: true` and end-of-run aggregation).

---

## 7. Out of scope

- Multi-locale store listing copy management (fixed-language descriptions are fine for v1).
- Automated screenshot generation for store assets.
- Edge / Opera / Safari extension stores (Chromium-only via CWS for now).
- Beta / staged-rollout channels (CWS supports `publishTarget=trustedTesters` -- exposed as an option but no automated promotion flow).
- Listing copy / metadata sync (description, icons, screenshots managed manually in dashboards).

## 8. Conflict surface with prior memory rule

The user's memory rule (`~/.claude/projects/-Users-jeffbailey-Projects-foss-leading-broshow/memory/feedback_no_auto_release.md`) says:
> Wait for the user to explicitly say "ship", "push", "tag", "release", or equivalent before running version bumps, tags, or git push.

This feature MUST NOT introduce a path that silently bypasses that rule. Specifically:
- Q3 Option A (auto-publish on tag push) **conflicts** -- it re-purposes `git tag v*` as a publish trigger, which is exactly the kind of "tagging causes a thing to happen" pattern the rule pushes back on.
- Q3 Options B, C, D all **comply** -- publish requires a separate, explicit human action (workflow_dispatch click or environment approval).

Recommendation locked in: **Q3 Option C** (environment-gated publish job in the existing `release.yml`).
