# Environment Setup Instructions: Marketplace Publishing (DEVOPS)

Feature ID: `marketplace-publishing`
Wave: DEVOPS
Date: 2026-04-30
Audience: BroShow maintainer (Jeff)

This document is the step-by-step setup guide for the maintainer to perform the one-time configuration required before the publish workflow can run end-to-end. **Apex (DEVOPS) does not execute these steps**; they require credentials only the maintainer holds (Google Cloud Console access, Chrome Web Store Developer Dashboard access, GitHub repo admin access).

Estimated time to complete all steps: **20-30 minutes** (one-time).

Before starting, verify:
- You are the owner or admin of `jeffabailey/broshow`.
- You have the Chrome Web Store developer account (already confirmed active per DISCUSS handoff).
- You have a Google Cloud Console account associated with the same Google identity as the CWS developer account.
- You have `node` 20.x available locally.

---

## Step 1: Create the `marketplace-prod` GitHub Environment

### What and why

GitHub Environments provide a per-environment secret store and an optional "required reviewers" gate. We use them for two reasons:
1. **Required reviewer = explicit go-ahead** (per memory rule `feedback_no_auto_release.md`). The reviewer click is the structural enforcement that no marketplace submission happens without you approving it.
2. **Environment-scoped secrets** keep CWS credentials away from any workflow that doesn't pass the environment gate (defense in depth).

GitHub Environments with required reviewers are AVAILABLE on free-tier public repos (verified: `jeffabailey/broshow` is public).

### Procedure

1. Open your browser to: https://github.com/jeffabailey/broshow/settings/environments
2. Click **New environment**.
3. Name: `marketplace-prod` (exact spelling matters; the workflow YAML references this name).
4. Click **Configure environment**.
5. Under **Deployment protection rules**:
   - Check the box: **Required reviewers**
   - In the search box, type `jeffabailey` and add yourself as the required reviewer.
   - Wait timer: leave at 0 minutes (no enforced delay; the click is the gate).
6. Click **Save protection rules**.

### What this looks like in practice

When the publish workflow reaches a job with `environment: marketplace-prod`, the GitHub Actions UI shows a yellow "Waiting for review" banner. You receive a notification (configurable via your GitHub notification preferences). You click **Approve and deploy** -> the publish job proceeds.

### Reference

- GitHub Environments documentation: https://docs.github.com/en/actions/deployment/targeting-different-environments/managing-environments-for-deployment
- Required reviewers behavior: https://docs.github.com/en/actions/deployment/targeting-different-environments/managing-environments-for-deployment#required-reviewers

---

## Step 2: Add placeholder environment secrets

You will populate the real values in Step 4 (after the bootstrap script). For now, create the slots so the workflow can reference them.

### Procedure

1. Still on https://github.com/jeffabailey/broshow/settings/environments, click into `marketplace-prod`.
2. Scroll to **Environment secrets**.
3. Click **Add secret** for each of the following names. Use any non-empty placeholder value (e.g., `placeholder`):
   - `CWS_CLIENT_ID`
   - `CWS_CLIENT_SECRET`
   - `CWS_REFRESH_TOKEN`
   - `CWS_EXTENSION_ID`

The placeholders prevent GitHub Actions from failing with "secret not found"; the actual values arrive in Step 4.

**SECURITY**: do not commit any real or placeholder secret value to git. Don't paste into PR descriptions, issue comments, or chat. The secret store is the single source.

### Verification

After adding all four, the **Environment secrets** section should list:
```
CWS_CLIENT_ID         Updated <date>
CWS_CLIENT_SECRET     Updated <date>
CWS_REFRESH_TOKEN     Updated <date>
CWS_EXTENSION_ID      Updated <date>
```

You will NOT see the values (GitHub never displays them after creation, even to admins).

---

## Step 3 (optional but recommended): Restrict environment to `main` and tags

### What and why

By default, any branch can request access to the `marketplace-prod` environment. Restricting to `main` + tag-push deployments ensures only commits in your default branch (or annotated tag refs derived from it) can ever request approval. Defense in depth — a compromised feature branch with a malicious workflow change cannot exfiltrate the CWS secrets.

### Procedure

1. In the `marketplace-prod` environment configuration, scroll to **Deployment branches and tags**.
2. Select **Selected branches and tags**.
3. Click **Add deployment branch or tag rule**.
4. Add:
   - Branch rule: `main`
   - Tag rule: `v*` (matches all release tags)
5. Click **Save**.

Now, attempts to deploy this environment from any other branch (e.g., `feature/...`) will be blocked at the "request approval" step before you even see a notification.

### Reference

- https://docs.github.com/en/actions/deployment/targeting-different-environments/managing-environments-for-deployment#deployment-branches-and-tags

---

## Step 4: Create the OAuth 2.0 Client and obtain credentials

This step produces `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, and (via Step 5) `CWS_REFRESH_TOKEN`.

### Prerequisite: Enable the Chrome Web Store API in your Google Cloud project

1. Open: https://console.cloud.google.com/apis/library/chromewebstore.googleapis.com
2. Make sure the project selected (top bar) is the one associated with your CWS developer account. If you don't have one, create a new project (any name; e.g., `broshow-publishing`).
3. Click **Enable** if not already enabled.

### Configure the OAuth consent screen (required before creating credentials)

1. Open: https://console.cloud.google.com/apis/credentials/consent
2. User type: **External** (only required if your Google account is not part of a Google Workspace org; for most cases, External is correct).
3. Fill in the minimal required fields:
   - App name: `BroShow CI Publish` (or any descriptive name; this only appears in the consent dialog you'll click through in Step 5).
   - User support email: your email.
   - Developer contact email: your email.
4. **Scopes**: click **Add or remove scopes**, search for `chromewebstore`, add `https://www.googleapis.com/auth/chromewebstore`. (If it doesn't appear, ensure the Chrome Web Store API is enabled per the prerequisite above.)
5. **Test users**: add your Google account email. (Without this, OAuth will fail with "access blocked" until the app is "published" via Google verification, which is excessive for personal CI.)
6. Save.

### Create the OAuth 2.0 Client ID

1. Open: https://console.cloud.google.com/apis/credentials
2. Click **Create credentials** -> **OAuth client ID**.
3. Application type: **Desktop app**
4. Name: `BroShow CI Bootstrap`
5. Click **Create**.
6. A dialog shows your **Client ID** and **Client Secret**. Click **Download JSON** OR copy both values to a temporary place (you'll paste them in Step 5 then immediately delete the temp note).

### Find the CWS Extension ID

1. Open: https://chrome.google.com/webstore/devconsole
2. Click into your BroShow listing (or create a draft if you haven't already; CWS lets you upload a draft without publishing it).
3. The URL contains your extension ID: `https://chrome.google.com/webstore/devconsole/<account-id>/<EXTENSION_ID>/edit`
4. Copy the EXTENSION_ID value (32-character lowercase hex).

You now have:
- `CWS_CLIENT_ID` (from OAuth client creation)
- `CWS_CLIENT_SECRET` (from OAuth client creation)
- `CWS_EXTENSION_ID` (from CWS dashboard URL)

You still need `CWS_REFRESH_TOKEN`, which Step 5 mints.

---

## Step 5: Run the bootstrap script locally to mint the refresh token

### Prerequisite

In your local clone of `jeffabailey/broshow`:
```bash
cd /path/to/broshow
git pull origin main           # ensure cws-bootstrap.mjs has been delivered
ls scripts/cws-bootstrap.mjs   # confirm it exists
```

If the script doesn't exist yet, the DELIVER wave hasn't completed. Stop and wait for the implementation to land. (DEVOPS's job is to specify; DELIVER's job is to implement.)

### Procedure

```bash
# In your local terminal (NOT in CI):
cd /path/to/broshow

# Provide the OAuth client credentials from Step 4:
export CWS_CLIENT_ID="<value from Step 4>"
export CWS_CLIENT_SECRET="<value from Step 4>"

# Run bootstrap:
node scripts/cws-bootstrap.mjs
```

What happens:
1. Script prints a long Google OAuth URL to your terminal.
2. Open that URL in your browser (the script may also auto-open it).
3. Sign in with the Google account associated with your CWS developer account (must match the test-user you added in Step 4).
4. Click **Allow** to grant the chromewebstore scope.
5. Browser redirects to `http://localhost:3000/?code=...` and shows "You may close this window."
6. Back in your terminal, the script prints the four secret values formatted for paste-in:
   ```
   ====================================================================
   Bootstrap complete. Paste these into:
   Settings -> Environments -> marketplace-prod -> Add secret

   CWS_CLIENT_ID=...
   CWS_CLIENT_SECRET=...
   CWS_REFRESH_TOKEN=...
   CWS_EXTENSION_ID=<paste from CWS dashboard URL>
   ====================================================================
   ```
7. Update each of the four environment secrets in `marketplace-prod` (Step 2's slots) with the corresponding values. (For `CWS_EXTENSION_ID`, use the value you obtained in Step 4.)

### Security hygiene after Step 5

```bash
# Clear terminal scrollback so the secrets don't sit in your shell history:
clear           # clears visible terminal
history -c      # clears bash/zsh history
# Or close and reopen the terminal.
```

The script never wrote the secrets to disk (verified by `cws-bootstrap.mjs` design: AC-1-2). They live only in:
- GitHub environment secret store (encrypted at rest)
- Your terminal scrollback (cleared above)

---

## Step 6: Verify with a dry-run

Before performing a real publish, verify the wiring with a dry-run. This exercises the entire pipeline (workflow inputs, secret access, environment gate) without writing to any store.

### Procedure

1. Open: https://github.com/jeffabailey/broshow/actions/workflows/release.yml
2. Click **Run workflow** (top right).
3. Inputs:
   - `tag`: an existing tag (e.g., `v0.2.0`) — does not need to be a new release; dry-run probes only.
   - `targets`: `cws,amo-listed`
   - `mode`: `dry-run`
4. Click **Run workflow**.
5. Open the resulting workflow run.
6. Wait for completion. Expected:
   - `build` job: green (existing behavior).
   - `publish-dry-run` matrix: both legs green; orchestrator probes both stores, classifies version state, emits `would-publish` outcomes.
   - **No environment approval prompt** (dry-run skips the gate by design; AC-5-5).
   - `aggregate-summary` job: green; step summary contains a Markdown table showing both targets in `dry-run-ok` state.

### Troubleshooting

| Symptom | Likely cause | Resolution |
|---|---|---|
| `publish-dry-run` fails with "OAuth refresh failed: invalid_grant" | Refresh token wasn't pasted correctly into env secret | Re-paste in `marketplace-prod` env settings; ensure no whitespace |
| `publish-dry-run` fails with "404 not found on extension" | `CWS_EXTENSION_ID` is wrong | Verify the 32-char hex from the CWS dashboard URL |
| `publish-dry-run` AMO leg fails with "401 invalid JWT" | `AMO_JWT_ISSUER`/`AMO_JWT_SECRET` are missing or wrong (these are repo-level secrets, not env-level) | Verify in repo settings -> secrets -> Actions |

---

## Step 7: First real publish (when ready)

Only after Step 6 passes:

1. Tag a release: `git tag v0.3.0; git push origin v0.3.0`. This runs the build job (existing behavior) and creates the GitHub release with both artifacts. **No publish job runs**. Memory rule preserved.
2. Open https://github.com/jeffabailey/broshow/actions/workflows/release.yml
3. Click **Run workflow**:
   - `tag`: `v0.3.0`
   - `targets`: `cws,amo-listed`
   - `mode`: `publish`
4. Click **Run workflow**.
5. Wait for the `publish` job to enter the "Waiting for review" state (yellow banner). You'll get a notification.
6. Click **Review deployments** -> select `marketplace-prod` -> **Approve and deploy**.
7. Both publish matrix legs run in parallel. Watch the step summary for outcomes.
8. After completion:
   - CWS: review submission appears in CWS dashboard (Google's review process is async, typically 1-3 business days).
   - AMO listed: submission appears at https://addons.mozilla.org/en-US/developers/addon/broshow/versions

---

## References

- GitHub Environments docs: https://docs.github.com/en/actions/deployment/targeting-different-environments/managing-environments-for-deployment
- GitHub Environment secrets: https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions#creating-secrets-for-an-environment
- Chrome Web Store API: https://developer.chrome.com/docs/webstore/using-api
- CWS API client setup (the OAuth dance): https://developer.chrome.com/docs/webstore/using-api#beforeyoubegin
- CWS Developer Dashboard: https://chrome.google.com/webstore/devconsole
- AMO Developer Hub (for AMO_JWT_*): https://addons.mozilla.org/en-US/developers/addon/api/key/
- ADR-007 (the trigger model rationale): `docs/adrs/ADR-007-publish-trigger-environment-gate.md`
- Memory rule: `~/.claude/projects/-Users-jeffbailey-Projects-foss-leading-broshow/memory/feedback_no_auto_release.md`

---

## Maintainer action item summary (in execution order)

| # | Action | Estimated time | Blocks |
|---|---|---|---|
| 1 | Create `marketplace-prod` environment with required reviewer | 3 min | All other steps |
| 2 | Add 4 placeholder env secrets | 2 min | Step 5 |
| 3 (optional) | Restrict environment to `main` + tags | 2 min | -- |
| 4 | Create OAuth client in Google Cloud Console + obtain CWS_EXTENSION_ID from CWS dashboard | 10 min | Step 5 |
| 5 | Run `cws-bootstrap.mjs` locally and paste 4 values into env secrets | 5 min | Step 6 |
| 6 | Run dry-run to verify | 3 min (script run) | Step 7 |
| 7 | Tag + dispatch first real publish | 2 min + reviewer click | -- |

**Total: ~25 minutes for setup (steps 1-5), ~5 minutes for verification (step 6), then per-release: ~30s of human effort (tag push + dispatch + approve click).**

The 30-second-per-release figure is the target north-star KPI #1 from `outcome-kpis.md`.
