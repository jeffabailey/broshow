# Maintainer One-Time Setup: Marketplace Publishing

You are about to enable automated publishing of the BroShow extension to the **Chrome Web Store** and **Firefox AMO** (listed channel) via the `release.yml` workflow.

This is a one-time setup. After it's done, every release becomes a **two-click flow**:

1. `git tag vX.Y.Z && git push origin vX.Y.Z` (existing behavior — builds + GitHub release).
2. **Click 1 — Dispatch the workflow.** Open https://github.com/jeffabailey/broshow/actions/workflows/release.yml -> **Run workflow** form (the one you see now: `tag`, `targets`, `mode` inputs) -> **Run workflow** button. The `release` (build) job starts immediately.
3. **Click 2 — Approve the environment.** Once `release` finishes and the `publish` job tries to start, the workflow run page shows a yellow **Waiting for review** banner with a **Review deployments** button. Click it -> select `marketplace-prod` -> **Approve and deploy**. The `publish` job starts.
4. ~30 seconds of total human effort across the two clicks.

**Memory rule preserved**: tag push alone never publishes. Run-workflow alone (Click 1) only kicks off the build + queues the publish job; the `publish` job is paused on the environment gate. Only Click 2 (the explicit reviewer approval) actually submits to the marketplaces.

> **CRITICAL — do Steps 1 and 2 BEFORE you ever click Run-workflow with `mode=publish`.** If you dispatch with `mode=publish` before the `marketplace-prod` environment exists with required reviewers, GitHub will auto-create the environment with no protection rules and the publish job will run ungated. You can dispatch with `mode=dry-run` at any time — that path has no environment gate by design (read-only probes; nothing mutates).

**Total time: ~25 minutes.** All steps below run on **macOS**, in **your terminal** (or a browser).

---

## Prerequisites

- [ ] You're admin of `jeffabailey/broshow` (you are; confirmed)
- [ ] You're signed in to your Google account that owns the existing CWS developer account
- [ ] `node` 20.x available locally: `node --version`
- [ ] You're on `main` and have pulled the latest: `git checkout main && git pull origin main`

---

## Step 1 — Create the `marketplace-prod` GitHub environment (3 min)

Open: https://github.com/jeffabailey/broshow/settings/environments

1. Click **New environment**
2. Name: `marketplace-prod` (exact spelling — the workflow YAML references this)
3. Click **Configure environment**
4. Under **Deployment protection rules**:
   - [x] Check **Required reviewers**
   - Add yourself: `jeffabailey`
   - Wait timer: leave at `0`
5. Click **Save protection rules**

When the publish workflow reaches a job with `environment: marketplace-prod`, GitHub will pause the run with a yellow "Waiting for review" banner and notify you. Click **Approve and deploy** to release.

---

## Step 2 — (Recommended) Restrict environment to `main` + tags (2 min)

Defense in depth — prevents a compromised feature branch from requesting access to the CWS secrets.

In the same `marketplace-prod` environment configuration:

1. Scroll to **Deployment branches and tags**
2. Select **Selected branches and tags**
3. Click **Add deployment branch or tag rule**
4. Add:
   - Branch rule: `main`
   - Tag rule: `v*`
5. Click **Save**

---

## Step 3 — Get the Chrome Web Store extension ID (1 min)

If you haven't already created a CWS listing for BroShow:

1. Open: https://chrome.google.com/webstore/devconsole
2. Click **+ New item**
3. Upload the most recent `broshow-chrome-X.Y.Z.zip` from a GitHub release (e.g., https://github.com/jeffabailey/broshow/releases/download/v0.2.17/broshow-chrome-0.2.17.zip)
4. Don't fill out the listing yet — but you'll need to **before** the first real publish. See `CWS-LISTING.md` for copy-paste-ready values for the Privacy Practices tab (justifications, single-purpose description, data-usage certification) and the Settings tab (contact email + verification). These cannot be set via the API; they're a one-time manual step.

To find the **CWS_EXTENSION_ID**:

1. Open: https://chrome.google.com/webstore/devconsole
2. Click into the BroShow listing
3. The URL is `https://chrome.google.com/webstore/devconsole/<account-id>/<EXTENSION_ID>/edit`
4. Copy the `<EXTENSION_ID>` portion (32-character lowercase hex like `aabbccdd...`)

Save this somewhere temporary; you'll paste it in Step 6.

---

## Step 4 — Create OAuth credentials in Google Cloud Console (10 min)

This produces `CWS_CLIENT_ID` and `CWS_CLIENT_SECRET`. Both feed into Step 5 to mint `CWS_REFRESH_TOKEN`.

### 4a. Enable the Chrome Web Store API

1. Open: https://console.cloud.google.com/apis/library/chromewebstore.googleapis.com
2. Top bar — make sure the project selected is associated with the same Google account as your CWS developer account
   - If you don't have a project: click the project dropdown -> **New Project** -> name it `broshow-publishing` -> Create -> select it
3. Click **Enable**

### 4b. Configure the OAuth consent screen

1. Open: https://console.cloud.google.com/apis/credentials/consent
2. User type: **External**
3. Fill in:
   - **App name**: `BroShow CI Publish`
   - **User support email**: your email
   - **Developer contact email**: your email
4. **Scopes** -> click **Add or remove scopes**:
   - Search `chromewebstore`
   - Add `https://www.googleapis.com/auth/chromewebstore`
   - **Update**
5. **Test users** -> **+ Add Users**:
   - Add your Google account email (the one with the CWS developer account)
   - Save
6. Done — you can leave the publishing status as "Testing"

### 4c. Create the OAuth Client ID

1. Open: https://console.cloud.google.com/apis/credentials
2. **+ Create credentials** -> **OAuth client ID**
3. Application type: **Desktop app**
4. Name: `BroShow CI Bootstrap`
5. **Create**
6. A dialog shows your **Client ID** and **Client Secret** — copy both to a temporary scratch buffer (not committed anywhere); you'll paste them in Step 5

---

## Step 5 — Run the bootstrap script locally to mint the refresh token (5 min)

```bash
cd /Users/jeffbailey/Projects/foss/leading/broshow

# Confirm you're on main with the latest:
git status

# Pass the OAuth client values via env (alternative: the script will prompt
# you interactively if these are unset):
export CWS_CLIENT_ID='<paste from Step 4c>'
export CWS_CLIENT_SECRET='<paste from Step 4c>'

# Run the bootstrap — opens your browser for the OAuth consent dance:
node scripts/cws-bootstrap.mjs
```

What happens:

1. Script prints the OAuth URL and opens your default browser to it
2. Sign in with the Google account associated with your CWS developer account (must match the test user added in Step 4b)
3. Click **Continue** through the unverified-app warning (your app is in Testing mode, which is fine)
4. Click **Allow** to grant the chromewebstore scope
5. Browser redirects to `http://127.0.0.1:8765/callback?code=...` — you'll see a "You may close this window" page
6. Back in your terminal, the script prints:

   ```
   == CWS bootstrap complete ==
   Paste the following four values into your repository secrets
   (Settings -> Secrets and variables -> Actions -> New repository secret):

   CWS_CLIENT_ID=...
   CWS_CLIENT_SECRET=...
   CWS_REFRESH_TOKEN=...

   Also configure CWS_EXTENSION_ID with the extension ID shown in the
   Chrome Web Store developer dashboard.
   ```

   Note: the script's prompt suggests "repository secret" — you want **environment** secrets on `marketplace-prod` (better security). Use the env scope, not repo scope.

7. **Clear your terminal scrollback so the secrets don't sit in history**:
   ```bash
   clear
   history -c    # zsh: also fc -P; for nuclear: rm ~/.zsh_history && exec zsh
   ```

   The script never wrote the secrets to disk — they exist only in:
   - GitHub environment secret store (encrypted, after Step 6)
   - Your terminal scrollback (cleared above)

---

## Step 6 — Paste the four secrets into the `marketplace-prod` environment (2 min)

Open: https://github.com/jeffabailey/broshow/settings/environments/marketplace-prod

Scroll to **Environment secrets** -> **Add secret** for each:

- [ ] `CWS_CLIENT_ID` — value from Step 4c
- [ ] `CWS_CLIENT_SECRET` — value from Step 4c
- [ ] `CWS_REFRESH_TOKEN` — value from Step 5 stdout
- [ ] `CWS_EXTENSION_ID` — value from Step 3

After adding all four, the **Environment secrets** section should list:

```
CWS_CLIENT_ID         Updated <date>
CWS_CLIENT_SECRET     Updated <date>
CWS_REFRESH_TOKEN     Updated <date>
CWS_EXTENSION_ID      Updated <date>
```

GitHub never displays the values back to you, even as admin.

The existing repo-level secrets `AMO_JWT_ISSUER` and `AMO_JWT_SECRET` (used by the existing release pipeline) are reused for AMO listed publishing. You don't need to touch them.

---

## Where the two clicks happen — visual cue

You won't see anything labelled "marketplace-prod" on the Run-workflow form (that's just the inputs panel). The environment gate appears **on the workflow run page** after Click 1, like this:

```
[Yellow banner]   Waiting for review
                  Approve or reject deployments

                  marketplace-prod  awaiting approval

                  [Review deployments]
```

That's where Click 2 happens. Until then, the run sits paused — it does NOT submit anything to either marketplace.

---

## Step 7 — Verify with a dry-run (3 min)

Before publishing for real, exercise the full pipeline with `mode=dry-run` (read-only probes; no environment approval needed because nothing mutates).

1. Open: https://github.com/jeffabailey/broshow/actions/workflows/release.yml
2. Click **Run workflow** (top right)
3. Inputs:
   - **tag**: any existing tag, e.g. `v0.2.17`
   - **targets**: `cws,amo-listed`
   - **mode**: `dry-run`
4. Click **Run workflow**
5. Wait ~2-3 minutes for completion

Expected:

- [x] `release` job: green (existing build behavior)
- [x] `publish-dry-run` matrix: both legs green; orchestrator authenticates, probes version state, classifies, emits "would-publish" outcomes
- [x] **No environment approval prompt** (dry-run skips the gate by design)
- [x] `aggregate-summary` job: green; step summary shows a per-target outcome table

If `publish-dry-run` fails, see the troubleshooting table at the bottom.

---

## Step 8 — First real publish (whenever you're ready)

After Step 7 passes:

1. Tag a release: `git tag v0.3.0 && git push origin v0.3.0`
   - This runs the build job (existing behavior) and creates the GitHub release with both artifacts
   - **No publish job runs** yet — memory rule preserved
2. Open: https://github.com/jeffabailey/broshow/actions/workflows/release.yml
3. **Run workflow**:
   - **tag**: `v0.3.0`
   - **targets**: `cws,amo-listed`
   - **mode**: `publish`
4. The `publish` job enters "Waiting for review" — yellow banner, you get a notification
5. Click **Review deployments** -> select `marketplace-prod` -> **Approve and deploy**
6. Both publish matrix legs run in parallel
7. Watch the step summary for outcomes

Aftermath:

- **CWS**: review submission appears in your CWS dashboard. Google's review takes 1-3 business days. Status moves from "Pending review" -> "Published".
- **AMO listed**: submission appears at https://addons.mozilla.org/en-US/developers/addon/broshow/versions. AMO's review is usually faster (hours).

---

## Recovery options

If only one store fails (per Q5 fail-isolation), re-run only that target:

- Run workflow with `targets: cws-only` or `targets: amo-listed-only`
- Same `mode: publish`, same `tag`
- Same approval flow

If you discover something wrong post-submission and need to abort:

- **CWS**: in the CWS dashboard, you can withdraw a pending submission before review completes
- **AMO listed**: AMO does not allow withdrawing a submitted version; you must publish a corrected version with a higher version number

---

## Troubleshooting (Step 7 dry-run failures)

| Symptom | Likely cause | Fix |
|---|---|---|
| `OAuth refresh failed: invalid_grant` (CWS leg) | Refresh token mis-pasted into env secret | Re-paste in `marketplace-prod` env settings; ensure no leading/trailing whitespace |
| `404 not found on extension` (CWS leg) | `CWS_EXTENSION_ID` is wrong | Re-verify the 32-char hex from the CWS dashboard URL |
| `401 invalid JWT` (AMO leg) | `AMO_JWT_ISSUER` or `AMO_JWT_SECRET` missing/wrong | Verify in **repo** Settings -> Secrets -> Actions (these are repo-level, not env-level) |
| Workflow doesn't appear in Actions tab | `release.yml` not on `main` | `git status; git log --oneline -3` — need commits up through `1a0941a` on main |
| `publish` job runs without approval prompt | Environment "Required reviewers" not set | Re-do Step 1; check the box and re-save |
| `publish` job runs from a feature branch | Branch restriction not in place | Re-do Step 2; restrict to `main` + `v*` |

---

## Action checklist

- [ ] Step 1: Create `marketplace-prod` environment with required reviewer (3 min)
- [ ] Step 2: Restrict environment to `main` + `v*` tags (2 min)
- [ ] Step 3: Get `CWS_EXTENSION_ID` from CWS dashboard (1 min)
- [ ] Step 4: Create OAuth client + enable CWS API + configure consent screen (10 min)
- [ ] Step 5: Run `node scripts/cws-bootstrap.mjs` -> capture refresh token (5 min)
- [ ] Step 6: Paste 4 secrets into `marketplace-prod` env (2 min)
- [ ] Step 7: Dry-run via Run-workflow (3 min)
- [ ] Step 8: First real publish (any time after Step 7)

---

## References

- Detailed wave doc: `docs/feature/marketplace-publishing/devops/environment-setup-instructions.md`
- ADR-007 (trigger model rationale): `docs/adrs/ADR-007-publish-trigger-environment-gate.md`
- GitHub Environments docs: https://docs.github.com/en/actions/deployment/targeting-different-environments/managing-environments-for-deployment
- Chrome Web Store API: https://developer.chrome.com/docs/webstore/using-api
- AMO Developer Hub: https://addons.mozilla.org/en-US/developers/
