<!-- markdownlint-disable MD024 -->

# User Stories: Marketplace Publishing

Feature ID: `marketplace-publishing`
Wave: DISCUSS
Persona: **Jeff** (sole maintainer of BroShow, working from a MacBook, releases tagged via local terminal, monitors CI in browser).

Stories are sized 1-3 days each, 3-7 UAT scenarios, demoable in a single session. Total: 5 stories. Story map backbone: configure -> publish -> recover -> observe -> validate.

Story dependency graph:

```
US-1 (CWS setup) ─┐
                  ├─> US-3 (publish workflow)  ─> US-4 (recovery)  ─> US-5 (dry-run)
US-2 (AMO listed) ┘
```

---

## US-1: Configure Chrome Web Store credentials

### Problem

Jeff has the BroShow source on GitHub but the Chrome Web Store has never seen it -- there is no CWS item, no OAuth client, no refresh token. Without these, no CI step can publish to CWS. Jeff needs a one-time setup procedure that produces the four secrets (`CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`, `CWS_EXTENSION_ID`) and gets them into GitHub repository secrets, after which the rest of the feature can use them.

### Who

- Jeff, sole maintainer | First-time CWS publisher for this project | Has a Google account, has access to the BroShow GitHub repo's secrets settings.

### Solution

A documented one-time setup procedure (`docs/feature/marketplace-publishing/discuss/setup-cws.md` produced in DESIGN, scaffolded here) that walks through:

1. Create CWS item in the developer dashboard (paste a placeholder zip; capture the `extensionId`).
2. Create a Google Cloud OAuth client (type: Desktop) authorized for `https://www.googleapis.com/auth/chromewebstore`.
3. Run a one-time `scripts/cws-bootstrap.mjs` locally that opens a browser, captures the auth code, exchanges it for a refresh token, and prints all four secret values.
4. Paste the four values into GitHub repo Settings -> Secrets -> Actions.

### Domain examples

#### 1: Happy path -- Jeff sets up CWS for the first time

Jeff opens `chrome.google.com/webstore/devconsole`, clicks "New item", uploads a placeholder zip of the current `dist/`, captures the 32-char `extensionId` (e.g., `abcdefghijklmnopqrstuvwxyz123456`). He then runs `node scripts/cws-bootstrap.mjs`, which opens a browser to a Google OAuth consent page; he approves; the script prints `CWS_CLIENT_ID=...`, `CWS_CLIENT_SECRET=...`, `CWS_REFRESH_TOKEN=1//09...`, `CWS_EXTENSION_ID=abcdefgh...`. He pastes all four into GitHub secrets. Total elapsed time: under 15 minutes.

#### 2: Edge case -- Jeff has 2-Step Verification on his Google account

The OAuth flow handles 2SV via the standard Google sign-in; bootstrap script does not need special handling. Refresh token is identical regardless of 2SV state.

#### 3: Error case -- Jeff's OAuth client has the wrong scope

The bootstrap script attempts the exchange and Google returns a `scope_mismatch` error. The script catches this and prints: `OAuth client must include scope https://www.googleapis.com/auth/chromewebstore. Edit your OAuth client at console.cloud.google.com and re-run.` Exit 1.

### UAT scenarios

```gherkin
Scenario: Jeff completes one-time CWS bootstrap successfully
  Given Jeff has created a CWS item with extension id "abcdefgh..."
    And Jeff has a Google Cloud OAuth desktop client with the chromewebstore scope
  When Jeff runs "node scripts/cws-bootstrap.mjs"
    And Jeff approves the OAuth consent page in his browser
  Then the script prints CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN, CWS_EXTENSION_ID values
    And the script does not write any secret to disk

Scenario: Jeff runs bootstrap with a mis-scoped OAuth client
  Given Jeff's OAuth client lacks the chromewebstore scope
  When Jeff runs "node scripts/cws-bootstrap.mjs"
  Then the script exits with a non-zero code
    And the output explains the missing scope and how to fix it

Scenario: Jeff's GitHub secrets are validated by a workflow
  Given Jeff has pasted CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN, CWS_EXTENSION_ID into repo secrets
  When the maintainer runs the publish workflow in dry-run mode
  Then the workflow exchanges the refresh token for an access token
    And the workflow logs "CWS credentials valid (extension id: abcdefgh...)"
    And the workflow does not submit any artifact
```

### Acceptance criteria

- [ ] Bootstrap script accepts no command-line secrets; reads OAuth client credentials interactively or from environment.
- [ ] Bootstrap script never writes secret values to disk (stdout only).
- [ ] Documentation lists all four required secrets with copy-paste-ready GitHub secret names.
- [ ] Dry-run mode of the publish workflow reports credential validity without submitting an artifact.

### Outcome KPIs

- **Who**: Jeff (maintainer)
- **Does what**: completes CWS one-time setup end-to-end without external help
- **By how much**: 100% completion in a single 15-minute session
- **Measured by**: self-reported single-session completion of the documented procedure
- **Baseline**: 0% -- no setup procedure exists today

### Technical notes

- Depends on `googleapis` Node package OR direct `fetch` calls to Google OAuth + CWS API v2.
- Bootstrap script runs locally (not in CI). It needs a transient HTTP server on `localhost:3000` for the OAuth callback.
- The CWS item ID is created via the dashboard manually -- the API does NOT support creating new items.
- Refresh tokens for desktop OAuth clients are long-lived but can be revoked from `myaccount.google.com/permissions`. Document this.

### Dependencies

- None blocking. CWS account exists (Jeff has Chrome dev account from prior projects per assumption -- VERIFY in DESIGN).

### Estimated effort

1.5 days (script + docs + GitHub-side smoke test).

---

## US-2: Configure AMO listed-channel publishing

### Problem

The AMO unlisted-channel signing already works (used by `npm run sign` and `release.yml`). For listed-channel publishing, the same `AMO_JWT_ISSUER` / `AMO_JWT_SECRET` credentials apply, but the workflow must (a) submit to channel `listed` instead of `unlisted`, (b) refuse to auto-bump version, and (c) handle the listed-channel reviewer-queue states (submitted, awaiting review, approved, rejected). Jeff needs the listed-channel submission to use the source-of-truth tag version verbatim and fail loudly on conflict.

### Who

- Jeff, sole maintainer | Already has AMO JWT credentials configured (current unlisted flow uses them) | Wants the BroShow listing to appear on `addons.mozilla.org` and update on each release.

### Solution

A new script `scripts/publish-amo-listed.mjs` (mirroring `sign-firefox-xpi.mjs` shape) that:

1. Reads source manifest version (no auto-bump probe call).
2. Stages firefox-dist with the existing `patchManifestForFirefox` pipeline.
3. Calls `web-ext sign --channel listed`.
4. Returns: `{outcome: 'submitted', listing_url: 'https://addons.mozilla.org/...'}` on success, or `{outcome: 'version_conflict', existing_version: 'x.y.z'}` on conflict, or `{outcome: 'failure', error: ...}` otherwise.

### Domain examples

#### 1: Happy path -- Jeff publishes v0.3.0 to AMO listed

Jeff has just tagged `v0.3.0`. The manifest version is `0.3.0`. AMO has no listing for BroShow yet (or the listing's last accepted version is `0.2.x`). The script submits to channel `listed`; web-ext returns success; output: `outcome=submitted, listing_url=https://addons.mozilla.org/firefox/addon/broshow, version=0.3.0`. Reviewer queue takes ~1 day.

#### 2: Edge case -- Jeff's tag matches an already-listed version

Jeff tags `v0.3.0` but a previous release submitted `0.3.0` to listed already (perhaps a half-failed prior run). Listed-channel auto-bump is forbidden. Script exits non-zero: `outcome=version_conflict, existing_version=0.3.0. Bump source manifest, re-tag, re-run.`

#### 3: Error case -- AMO reviewer auto-rejects (e.g., minified-source rule)

Web-ext sign returns success (artifact accepted into the queue) but reviewer later rejects. This is OUT OF SCOPE for this story -- the publish workflow's responsibility ends at "submitted to queue". Reviewer-rejection handling is a separate concern (Jeff sees an email from Mozilla; he addresses it manually). Document this in the story's "Out of scope" notes.

### UAT scenarios

```gherkin
Scenario: Jeff publishes a new version to AMO listed
  Given the source manifest version is "0.3.0"
    And AMO has no listed version "0.3.0" for broshow@jeffabailey.com
    And AMO_JWT_ISSUER and AMO_JWT_SECRET are set
  When Jeff runs "node scripts/publish-amo-listed.mjs"
  Then the script invokes "web-ext sign --channel listed"
    And the script does NOT call find-next-amo-version.mjs
    And the script logs "Submitted to AMO listed: v0.3.0"

Scenario: Jeff re-runs publish on an already-listed version
  Given the source manifest version is "0.3.0"
    And AMO already has listed version "0.3.0" for broshow@jeffabailey.com
  When Jeff runs "node scripts/publish-amo-listed.mjs"
  Then the script exits with a non-zero code
    And the output reads "Version 0.3.0 already on AMO listed. Bump source manifest, re-tag, re-run."
    And the script does NOT auto-bump

Scenario: Jeff's AMO credentials are absent
  Given AMO_JWT_ISSUER and AMO_JWT_SECRET are NOT set
  When Jeff runs "node scripts/publish-amo-listed.mjs"
  Then the script exits with a non-zero code
    And the output explains how to obtain AMO API keys

Scenario: AMO listed publish leaves unlisted flow intact
  Given the AMO listed publish has just succeeded for v0.3.0
  When Jeff runs "npm run sign" locally
  Then the sign script produces an unlisted xpi
    And the unlisted submission is on the unlisted channel (separate version slot)
```

### Acceptance criteria

- [ ] Listed-channel publish uses source manifest version verbatim (no auto-bump).
- [ ] Listed-channel publish reuses existing `AMO_JWT_ISSUER` / `AMO_JWT_SECRET`.
- [ ] Existing `npm run sign` (unlisted) continues to work, unaffected.
- [ ] Listed-channel publish fails fast with actionable message on version conflict.
- [ ] Listed-channel publish never modifies source `manifest.json` or `package.json`.

### Outcome KPIs

- **Who**: end users discovering BroShow via addons.mozilla.org search
- **Does what**: install BroShow from the AMO listing
- **By how much**: at least 1 install/week within 30 days of first listed publish (vanity floor; real KPI is "discoverability exists at all", baseline is 0)
- **Measured by**: AMO developer dashboard install stats
- **Baseline**: 0 (no listing exists today)

### Technical notes

- `web-ext sign --channel listed` uses the same JWT auth as the unlisted flow.
- AMO listed channel reserves a separate version slot from unlisted (so v0.3.0 listed and v0.3.0 unlisted CAN coexist).
- Reviewer queue duration is unpredictable (typically hours, sometimes days). Workflow MUST NOT block waiting for review.
- AMO submission API does NOT support deleting versions -- a botched submission stays in the listing's history forever (can be disabled but not removed).

### Dependencies

- AMO_JWT_ISSUER / AMO_JWT_SECRET secrets (already configured in repo).
- `patchManifestForFirefox` (existing).
- One-time AMO listing creation (first listed submission auto-creates the listing; subsequent ones update it).

### Estimated effort

1 day (script + UAT).

---

## US-3: Trigger marketplace publish from CI under explicit maintainer control

### Problem

After US-1 and US-2 are complete, Jeff has the credentials and the per-store scripts. Now he needs a CI workflow that orchestrates them in response to a deliberate human action -- NOT on every tag push, because tag pushes today often produce diagnostic releases that should NOT publish to stores (per the maintainer's "no auto-release" memory rule). The workflow must be parallel (CWS and AMO independent), idempotent (re-running on a published version is a no-op or clear error), and partial-fail-safe (one store down does not block the other).

### Who

- Jeff, sole maintainer | Already has tagged a release (e.g., `v0.3.0`) and the existing `release.yml` has produced the GitHub release with both artifacts | Decides "yes, this one is good, ship it to the stores".

### Solution

Extend `release.yml` (or add `publish-stores.yml`) with a `publish` job:

- Triggered by `workflow_dispatch` with input `targets: [both, cws, amo-listed]` and `cws_publish: [default, trustedTesters, upload-only]`.
- Wraps in a GitHub **Environment** named `marketplace-prod` with required-reviewer = Jeff.
- Two parallel steps: `publish-cws`, `publish-amo-listed`. Each `continue-on-error: true`.
- End-of-job aggregation step: report per-store outcome, exit non-zero if any required target failed.

### Domain examples

#### 1: Happy path -- Jeff ships v0.3.0 to both stores

After tagging `v0.3.0` and verifying the GitHub release artifacts look right, Jeff goes to GitHub -> Actions -> Release -> Run workflow, picks tag `v0.3.0`, `targets: both`, `cws_publish: default`. The publish job pauses on the `marketplace-prod` environment for his approval; he clicks "Approve and run". CWS upload + publish runs in parallel with AMO listed sign. Both succeed within 3 minutes. Workflow summary: "Published v0.3.0 to CWS (extension abcdefgh, in review) and AMO listed (in review)."

#### 2: Edge case -- Jeff publishes only to CWS (AMO listed already done)

A previous run published to AMO listed but failed CWS (rate limit). Jeff dispatches with `targets: cws`. Only the CWS step runs; AMO step is skipped with log "skipped: not in targets".

#### 3: Error case -- CWS upload fails after AMO listed succeeds

Jeff dispatches with `targets: both`. AMO listed succeeds. CWS upload fails with HTTP 401 (refresh token revoked). The job continues, AMO listed step shows green, CWS step shows red, aggregation step exits 1 with summary: "FAILED: cws (HTTP 401, refresh token expired). SUCCEEDED: amo-listed v0.3.0. Recovery: regenerate CWS_REFRESH_TOKEN via scripts/cws-bootstrap.mjs, then re-dispatch with targets: cws."

### UAT scenarios

```gherkin
Scenario: Jeff publishes a release to both marketplaces successfully
  Given the GitHub release for tag "v0.3.0" exists with both artifacts attached
    And all CWS and AMO secrets are configured
  When Jeff runs the publish workflow with tag="v0.3.0" and targets="both"
    And Jeff approves the marketplace-prod environment gate
  Then the cws step uploads the zip and submits for review
    And the amo-listed step submits the xpi to channel listed
    And the workflow exits with success
    And the workflow summary lists both marketplaces as "submitted"

Scenario: Tag push alone does NOT trigger marketplace publish
  Given Jeff has just pushed tag "v0.3.0"
  When the release.yml workflow runs from the tag push event
  Then the build-and-attach steps run
    And the publish job does NOT run automatically
    And the GitHub release exists with both artifacts attached

Scenario: Jeff publishes only to CWS after a partial failure
  Given a prior publish run succeeded for amo-listed v0.3.0 but failed for cws
  When Jeff re-dispatches the publish workflow with tag="v0.3.0" and targets="cws"
  Then only the cws step runs
    And the amo-listed step is skipped with log "skipped: not in targets"
    And the cws step uploads and submits for review

Scenario: Jeff dispatches with cws_publish=upload-only
  Given Jeff wants to inspect the CWS submission before it goes to review
  When Jeff dispatches with tag="v0.3.0", targets="cws", cws_publish="upload-only"
  Then the workflow uploads the zip to CWS
    And the workflow does NOT call the publish endpoint
    And the workflow log includes a CWS dashboard link for manual submission

Scenario: One marketplace fails, the other still runs to completion
  Given the cws refresh token has been revoked
    And the amo credentials are valid
  When Jeff dispatches the publish workflow with targets="both"
    And Jeff approves the environment gate
  Then the amo-listed step submits successfully
    And the cws step fails with HTTP 401
    And the workflow exits non-zero
    And the summary clearly identifies which step failed and how to recover

Scenario: Re-dispatching publish on an already-published version is a clean no-op
  Given v0.3.0 has been successfully published to cws and amo-listed
  When Jeff re-dispatches with tag="v0.3.0" and targets="both"
  Then the cws step reports "version 0.3.0 already exists" and exits with classification "already-published"
    And the amo-listed step reports "version 0.3.0 already on listed" and exits with classification "already-published"
    And the workflow exits non-zero with a clear "nothing to do" summary
```

### Acceptance criteria

- [ ] Publish job triggered by `workflow_dispatch` only, not by tag push.
- [ ] Publish job is gated by GitHub Environment `marketplace-prod` with required reviewer.
- [ ] CWS and AMO listed steps run in parallel.
- [ ] Either step's failure does NOT abort the other step.
- [ ] Workflow summary clearly identifies per-store outcome with classification: success / failure / skipped / already-published.
- [ ] `targets` input accepts `both`, `cws`, `amo-listed`.
- [ ] `cws_publish` input accepts `default`, `trustedTesters`, `upload-only`.
- [ ] Re-dispatching on an already-published version surfaces "already-published" without duplicate submission.

### Outcome KPIs

- **Who**: Jeff (maintainer)
- **Does what**: completes a full cross-marketplace release
- **By how much**: end-to-end maintainer effort drops from ~10 minutes (manual upload to both stores) to under 60 seconds (one workflow dispatch + one approval click)
- **Measured by**: maintainer self-timed releases, before/after
- **Baseline**: ~10 minutes manual today (zero CWS today, ~3 minutes manual AMO listed if it existed)

### Technical notes

- GitHub Environments require GitHub-hosted runners or self-hosted runners with environment scoping.
- Required-reviewer must be explicitly listed; cannot be "any maintainer" wildcard.
- `continue-on-error: true` at the step level lets the job continue past a failed step; outcome is captured for aggregation.
- Workflow MUST verify the GitHub release exists for the dispatched tag before proceeding (sanity check).
- This story does NOT modify the existing tag-push build behavior in `release.yml` -- that flow continues unchanged; we only ADD a publish job.

### Dependencies

- US-1 (CWS credentials configured)
- US-2 (AMO listed script available)

### Estimated effort

2 days (workflow + environment setup + UAT against a real test tag).

---

## US-4: Recover from a partial-failure publish without re-doing what succeeded

### Problem

When CWS fails mid-publish but AMO listed succeeded (or inverse), Jeff is stuck unless there's a per-store retry path. Without it, his options are: (a) bump version, re-tag, re-run everything (wasteful, AMO listed would conflict on the already-submitted version) or (b) manual upload via dashboard (toil this feature is supposed to eliminate). He needs a deterministic recovery.

### Who

- Jeff, sole maintainer | Just hit a partial-failure publish | Wants to retry only the failed store without touching the successful one.

### Solution

The `targets` input from US-3 is the recovery mechanism: re-dispatch with `targets: cws` (or `amo-listed`). This story focuses on:

1. Documenting the recovery procedure clearly in CI output and in `docs/release.md`.
2. Ensuring per-store status is detectable -- before re-running, the workflow probes the marketplace and reports current state.

### Domain examples

#### 1: Happy path -- Jeff retries CWS only after a 401

Per US-3 example 3. Jeff regenerates the CWS refresh token, updates the GitHub secret, dispatches `targets: cws`. Workflow runs only CWS step. Succeeds.

#### 2: Edge case -- Jeff retries CWS but version was already accepted on the prior run

The prior CWS step's HTTP 401 happened AFTER the upload succeeded but BEFORE publish was called. So CWS already has v0.3.0 uploaded but not published. Re-dispatching `targets: cws cws_publish: default` should call publish, not re-upload. The workflow probes CWS state first: "v0.3.0 already uploaded, calling publish only". Succeeds.

#### 3: Error case -- Jeff retries AMO listed but the submission was already approved

Jeff's prior dispatch succeeded fully on AMO; he re-dispatches `targets: amo-listed` by accident. Workflow probes AMO, sees v0.3.0 in `listed` channel state `public`, reports "already-published" and exits non-zero with a clear message. No duplicate submission.

### UAT scenarios

```gherkin
Scenario: Jeff retries CWS only after CWS-only failure
  Given the prior publish run succeeded for amo-listed but failed for cws
    And the cws state for v0.3.0 is "no upload" or "upload-only, not published"
  When Jeff dispatches publish with targets="cws"
  Then the workflow runs only the cws step
    And the cws step completes the failed half (upload + publish)
    And the workflow exits success

Scenario: Jeff retries when the marketplace already has the version
  Given v0.3.0 was already accepted by the marketplace on a prior run
  When Jeff re-dispatches publish for that target
  Then the workflow probes marketplace state before submitting
    And the workflow reports "already-published" without re-submitting

Scenario: Recovery procedure is discoverable from a failed run's logs
  Given a publish run has just failed on cws
  When Jeff opens the workflow run summary
  Then the summary contains the exact command/dispatch parameters to retry only cws
    And the summary references the troubleshooting doc
```

### Acceptance criteria

- [ ] `targets: {cws, amo-listed}` input allows per-store retry.
- [ ] Each step probes marketplace state before submitting, classifies as `already-published` / `partial-upload` / `not-uploaded`.
- [ ] On `already-published`, step exits with classification "already-published" -- not a confusing generic failure.
- [ ] Workflow summary on failure includes a copy-paste recovery instruction.

### Outcome KPIs

- **Who**: Jeff (maintainer) on a partial-failure run
- **Does what**: completes recovery without re-tagging or manual dashboard work
- **By how much**: 100% of partial-failure runs recoverable via re-dispatch
- **Measured by**: incident retro after first observed partial-failure
- **Baseline**: undefined (no partial-failure has occurred in absence of the feature)

### Technical notes

- CWS state probe: `GET /chromewebstore/v1.1/items/{id}?projection=DRAFT` returns the current uploaded but unpublished item, including its version.
- AMO state probe: `GET /api/v5/addons/addon/{guid}/versions/?filter=all_with_unlisted` (already used by `find-next-amo-version.mjs`); filter to `channel=listed`.
- "Probe before submit" should be unconditional, not just on retry -- it provides idempotency guarantees in all cases.

### Dependencies

- US-3 complete (publish workflow exists with `targets` input).

### Estimated effort

1 day (probe logic + log/summary improvements + UAT).

---

## US-5: Validate publish flow without burning a real version slot (dry-run mode)

### Problem

CI workflow development is iterative: typos in YAML, missing secrets, wrong API paths. Each real submission to CWS or AMO listed is a one-way action -- you cannot delete a CWS upload or an AMO listed submission. Burning version slots during workflow debugging is the same trap that produced the v0.2.0 -> v0.2.9 churn captured in the memory rule. Jeff needs a dry-run mode that validates everything (credentials, artifact shape, manifest version, marketplace reachability) without actually submitting.

### Who

- Jeff, sole maintainer | Iterating on the publish workflow | Doesn't want to consume real AMO/CWS version slots while debugging YAML.

### Solution

A `dry_run: true` boolean input on the publish workflow. When true:

1. Resolve credentials (exchange refresh token, mint JWT).
2. Verify artifact shape (zip is valid Chrome extension, xpi is valid, manifest version matches tag).
3. Probe marketplace state (would the version conflict?).
4. Output a "would have done X" log line per step.
5. Skip the actual upload/publish API calls.
6. Exit 0 if all validations pass, non-zero otherwise.

### Domain examples

#### 1: Happy path -- dry-run passes

Jeff dispatches with `dry_run: true, targets: both`. Workflow exchanges credentials successfully, validates artifacts, probes marketplaces (both report "version available"), logs "[DRY RUN] would upload broshow-chrome-0.3.0.zip to CWS item abcdefgh..." and "[DRY RUN] would submit broshow-firefox-0.3.0.xpi to AMO listed". Exits 0.

#### 2: Edge case -- dry-run detects a version conflict

Jeff dispatches dry-run for `v0.2.17` (already on CWS). CWS probe returns "v0.2.17 already published". Dry-run step exits non-zero: "[DRY RUN] CWS would FAIL: version 0.2.17 already published. Bump tag and re-run."

#### 3: Error case -- dry-run detects a credentials problem

Jeff dispatches dry-run. CWS refresh-token exchange returns HTTP 400 invalid_grant. Dry-run step exits non-zero: "[DRY RUN] CWS credentials invalid: refresh token expired or revoked. Run scripts/cws-bootstrap.mjs to regenerate."

### UAT scenarios

```gherkin
Scenario: Dry-run validates without submitting
  Given Jeff has all credentials configured and artifacts attached to release v0.3.0
  When Jeff dispatches publish with dry_run=true and targets="both"
  Then the workflow exchanges CWS and AMO credentials successfully
    And the workflow probes marketplace state for v0.3.0
    And the workflow does NOT call any upload or publish API
    And each step logs "[DRY RUN] would <action> ..."
    And the workflow exits success

Scenario: Dry-run catches a version conflict before real submission
  Given v0.3.0 is already published to CWS
  When Jeff dispatches publish with dry_run=true and targets="cws"
  Then the cws step reports "[DRY RUN] would FAIL: already published"
    And the workflow exits non-zero
    And no real submission occurs

Scenario: Dry-run catches expired credentials
  Given the CWS refresh token has been revoked
  When Jeff dispatches publish with dry_run=true and targets="cws"
  Then the workflow exits non-zero
    And the log explains the credentials problem and the fix
    And no real submission occurs
```

### Acceptance criteria

- [ ] `dry_run` input default = false; opt-in only.
- [ ] When `dry_run=true`, no upload or publish API call fires.
- [ ] Dry-run validates: credentials exchange, artifact existence, manifest version match, marketplace state.
- [ ] Dry-run output is clearly labeled `[DRY RUN]` on every relevant log line.
- [ ] Dry-run can run without the environment-gate approval (it's safe by definition).

### Outcome KPIs

- **Who**: Jeff (maintainer) when iterating on the publish workflow
- **Does what**: validates a publish without consuming a real version slot
- **By how much**: zero real-store submissions during workflow development
- **Measured by**: count of accidental real submissions during workflow iteration (target: 0)
- **Baseline**: undefined; risk is high in absence of dry-run

### Technical notes

- Implementation: each step takes a `--dry-run` flag; on dry-run, perform all read-only operations (probe, validate) and skip writes.
- Dry-run can SKIP the environment gate (it's a read-only verification; the gate is for actual submissions).
- Dry-run output should be machine-readable enough that a future automated test could parse it.

### Dependencies

- US-3 complete.

### Estimated effort

0.75 days (boolean flag plumbing + UAT).

---

## Story summary table

| ID | Title | Effort | Scenarios | Dependencies |
|---|---|---|---|---|
| US-1 | Configure CWS credentials | 1.5d | 3 | none |
| US-2 | Configure AMO listed publishing | 1d | 4 | none |
| US-3 | Trigger publish from CI | 2d | 6 | US-1, US-2 |
| US-4 | Per-store recovery | 1d | 3 | US-3 |
| US-5 | Dry-run validation | 0.75d | 3 | US-3 |

Total effort: ~6 days.
Total scenarios: 19.
Total stories: 5.
Story sizing: each story is right-sized (1-3 days, 3-7 scenarios). PASS.
