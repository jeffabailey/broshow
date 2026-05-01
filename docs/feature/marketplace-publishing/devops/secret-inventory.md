# Secret Inventory: Marketplace Publishing (DEVOPS)

Feature ID: `marketplace-publishing`
Wave: DEVOPS
Date: 2026-04-30

This document is the authoritative inventory of every CI secret the marketplace-publishing feature reads. Each entry includes scope (where stored), source (where minted), rotation policy, and consumer modules.

Security invariant (NFR-4): no secret value EVER reaches stdout, `$GITHUB_STEP_SUMMARY`, GitHub release notes, or any persisted artifact. Adapters that derive short-lived credentials (e.g., access tokens) MUST emit `::add-mask::` for each derived value before any subsequent step references it.

## 1. Inventory table

| Secret | Scope | Source | Rotation | Used by |
|---|---|---|---|---|
| `AMO_JWT_ISSUER` | Repo secret (existing) | AMO Developer Hub: https://addons.mozilla.org/en-US/developers/addon/api/key/ | Manual; rotate if leaked. AMO does not auto-expire. | `scripts/find-next-amo-version.mjs` (existing, unlisted), `scripts/amo-listed-adapter.effect.mjs` (new, listed) |
| `AMO_JWT_SECRET` | Repo secret (existing) | Same as AMO_JWT_ISSUER (paired) | Same as AMO_JWT_ISSUER | Same consumers |
| `CWS_CLIENT_ID` | Environment secret on `marketplace-prod` (NEW) | Google Cloud Console -> APIs & Services -> Credentials -> OAuth 2.0 Client ID (type: Desktop app) | Permanent; rotate only if compromised. | `scripts/cws-adapter.effect.mjs` |
| `CWS_CLIENT_SECRET` | Environment secret on `marketplace-prod` (NEW) | Same as CWS_CLIENT_ID (paired in OAuth client config) | Same as CWS_CLIENT_ID | `scripts/cws-adapter.effect.mjs` |
| `CWS_REFRESH_TOKEN` | Environment secret on `marketplace-prod` (NEW) | Output of one-time local run of `node scripts/cws-bootstrap.mjs` | Auto-expires after 6 months of unused (Google policy); maintainer re-mints via bootstrap script. Also rotates if user revokes the OAuth grant in Google Account settings. | `scripts/cws-adapter.effect.mjs` (exchanged for short-lived access token at workflow run start) |
| `CWS_EXTENSION_ID` | Environment secret on `marketplace-prod` (NEW) | Chrome Web Store Developer Dashboard, after one-time draft listing creation. Format: 32-char lowercase hex (e.g., `abcdefghijklmnopqrstuvwxyzabcdef`). | Permanent. Tied to the CWS item; only changes if maintainer creates a brand-new listing (not rotation). | `scripts/cws-adapter.effect.mjs` |

Total: 6 secrets (2 existing, 4 new).

## 2. Scope decisions

### Why AMO_* stay as repo secrets

`AMO_JWT_ISSUER` and `AMO_JWT_SECRET` already exist as repo secrets. They serve BOTH the existing tag-push build job (unlisted-channel signing) AND the new publish job (listed-channel submission). Repo-level scope is correct: the build job runs on every tag push (no environment), so the secret must be available at repo level.

Risk acceptance: any maintainer with `actions:write` on the repo can read these via a malicious workflow change, but this is a single-maintainer FOSS repo. Threat model = the maintainer's own account compromise, mitigated by GitHub account 2FA.

### Why CWS_* are environment secrets on `marketplace-prod`

The four CWS secrets are needed ONLY by the publish job. Scoping them to the `marketplace-prod` environment provides defense in depth:
- Workflow runs that don't pass the environment gate cannot read these secrets.
- Branch restrictions on the environment (Step 3 of `environment-setup-instructions.md`) further restrict which refs can request them.
- Required-reviewer gate means an unattended workflow run cannot exfiltrate them to a malicious target.

Specifically `CWS_EXTENSION_ID` is technically not "secret" (it appears in the public CWS listing URL once published). It is stored as a secret only for hygiene — keeps all CWS config in one place and avoids hardcoding the ID in the workflow YAML. Treating it as a secret has no downside.

## 3. CWS bootstrap flow (one-time, local)

The `CWS_REFRESH_TOKEN` cannot be minted in CI because the OAuth flow requires browser interaction. It is minted exactly once on the maintainer's laptop, then pasted into the GitHub environment secret store.

### Bootstrap inputs

The maintainer needs:
1. `CWS_CLIENT_ID` and `CWS_CLIENT_SECRET` from Google Cloud Console (steps to obtain in `environment-setup-instructions.md` section 4).
2. Default browser available on the laptop.
3. `node` 20.x available (already a project requirement).

### Bootstrap procedure

```bash
# In the maintainer's local terminal (NOT in CI):
cd /path/to/broshow

# Either inline (single-shell) or via env:
export CWS_CLIENT_ID="your-client-id-from-google-cloud-console.apps.googleusercontent.com"
export CWS_CLIENT_SECRET="your-client-secret"

node scripts/cws-bootstrap.mjs
```

What `cws-bootstrap.mjs` does:
1. Validates `CWS_CLIENT_ID` and `CWS_CLIENT_SECRET` are present (prompts if missing; never echoes).
2. Generates a random `state` parameter (CSRF guard).
3. Spins `http.createServer` on `http://localhost:3000`.
4. Constructs the Google OAuth consent URL with:
   - `response_type=code`
   - `client_id=$CWS_CLIENT_ID`
   - `redirect_uri=http://localhost:3000`
   - `scope=https://www.googleapis.com/auth/chromewebstore`
   - `access_type=offline` (this is what mints a refresh token)
   - `prompt=consent` (forces a fresh refresh token even if the user has consented before)
   - `state=<random>`
5. Prints "Open this URL in your browser: <URL>" to stdout.
6. Waits for the browser redirect to localhost:3000 with `?code=...&state=...`.
7. Validates `state` matches; rejects if not.
8. POSTs to `https://oauth2.googleapis.com/token` with:
   - `grant_type=authorization_code`
   - `code=<received>`
   - `client_id=$CWS_CLIENT_ID`
   - `client_secret=$CWS_CLIENT_SECRET`
   - `redirect_uri=http://localhost:3000`
9. Receives `{ refresh_token, access_token, expires_in, ... }`.
10. Prints to stdout (NEVER to disk):
    ```
    ====================================================================
    Bootstrap complete. Paste these into:
    Settings -> Environments -> marketplace-prod -> Add secret

    CWS_CLIENT_ID=<echoed back for convenience>
    CWS_CLIENT_SECRET=<echoed back for convenience>
    CWS_REFRESH_TOKEN=<minted>
    CWS_EXTENSION_ID=<paste from CWS dashboard URL>
    ====================================================================
    ```
11. Exits 0. Server shuts down.

### Bootstrap security guarantees (AC-1-2)

- Never writes any secret to disk. No log file, no temp file, no `.env`. Print to stdout only.
- Never sends secrets to any host other than `oauth2.googleapis.com`.
- Loopback HTTP server listens on `127.0.0.1:3000` only (not `0.0.0.0`); cannot be reached from other machines.
- After successful exchange, server shuts down within 1 second.
- Maintainer is instructed to clear terminal scrollback after pasting (operational hygiene; not enforced by code).

### Bootstrap failure modes

| Symptom | Likely cause | Resolution |
|---|---|---|
| `EADDRINUSE :::3000` | Another process on 3000 | Kill it or pass `--port 3001` (script accepts override) |
| Browser shows "redirect_uri_mismatch" | OAuth client not configured for `http://localhost:3000` | Add it in Google Cloud Console -> Credentials -> Authorized redirect URIs |
| Browser shows "access_blocked: This app's request is invalid" | OAuth client not configured with the chromewebstore scope, OR consent screen not configured | Configure OAuth consent screen in Google Cloud Console |
| Token endpoint returns `invalid_grant` | Code already used, or 10-minute window elapsed | Re-run bootstrap; auth codes are single-use and short-lived |
| No `refresh_token` in response | `prompt=consent` was not honored, OR `access_type=offline` was missing | Re-run bootstrap; the script enforces both params |

## 4. Secret usage in workflow YAML

The workflow (per `ci-cd-pipeline.md` section 4.2) reads secrets via `${{ secrets.NAME }}` only inside the `env:` block of the orchestrator step. They are never echoed in `run:` blocks except as standard env-var references.

### Existing usage (build job, unchanged)

```yaml
- name: Resolve next available AMO version
  env:
    AMO_JWT_ISSUER: ${{ secrets.AMO_JWT_ISSUER }}
    AMO_JWT_SECRET: ${{ secrets.AMO_JWT_SECRET }}
    TAG_VERSION: ${{ steps.version.outputs.version }}
  run: |
    # ... script consumes via process.env, never echoes
```

### New usage (publish job)

```yaml
- name: Run publish orchestrator
  env:
    # CWS (only relevant when matrix.target == 'cws')
    CWS_CLIENT_ID: ${{ secrets.CWS_CLIENT_ID }}
    CWS_CLIENT_SECRET: ${{ secrets.CWS_CLIENT_SECRET }}
    CWS_REFRESH_TOKEN: ${{ secrets.CWS_REFRESH_TOKEN }}
    CWS_EXTENSION_ID: ${{ secrets.CWS_EXTENSION_ID }}
    # AMO (only relevant when matrix.target == 'amo-listed')
    AMO_JWT_ISSUER: ${{ secrets.AMO_JWT_ISSUER }}
    AMO_JWT_SECRET: ${{ secrets.AMO_JWT_SECRET }}
  run: node scripts/publish-orchestrator.effect.mjs
```

GitHub automatically masks any value referenced via `${{ secrets.* }}` in subsequent log output. The orchestrator must additionally `::add-mask::` any DERIVED secret (e.g., the access token returned by the oauth2 exchange).

### Required adapter pattern for derived secrets

```js
// In cws-adapter.effect.mjs::exchangeCwsRefreshToken
const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { ... });
const { access_token } = await tokenResponse.json();

// MANDATORY: tell GitHub Actions to mask this in any future log output.
// This is a one-line write to stdout that GitHub Actions intercepts.
process.stdout.write(`::add-mask::${access_token}\n`);

return { ok: true, value: access_token };
```

Without `::add-mask::`, an accidental `console.log(token)` later in the run would leak the token to logs. With `::add-mask::`, GitHub replaces the value with `***` even if printed.

## 5. Forbidden behaviors (enforced by code review and grep CI step)

- NO secret value passed as a CLI argument (visible in process listings):
  - WRONG: `npx web-ext sign --api-secret "$AMO_JWT_SECRET" ...` (the existing build job does this, but it's a known acceptable trade-off because the runner is ephemeral and `ps` output is not persisted; new code MUST use env vars)
  - RIGHT: `web-ext` reads `WEB_EXT_API_SECRET` env var when CLI flag absent (per web-ext docs)

  NOTE: The existing `release.yml` does pass these as CLI flags. Changing that is out of scope for this feature (no regression introduced). The new adapter pattern uses env vars exclusively.

- NO secret echoed to step summary:
  - WRONG: `echo "Used token $CWS_REFRESH_TOKEN" >> $GITHUB_STEP_SUMMARY`
  - RIGHT: never include any `$CWS_*` or `$AMO_*` value in summary

- NO secret persisted to artifact:
  - WRONG: `echo "$CWS_REFRESH_TOKEN" > token.txt; upload-artifact token.txt`
  - RIGHT: secrets exist in process memory only

- NO secret logged in failure messages:
  - WRONG: `console.error('Auth failed with token', creds.refreshToken)`
  - RIGHT: `console.error('Auth failed with token of length', creds.refreshToken.length)` (or omit)

### Grep guard for CI (DELIVER adds)

```sh
# Run after publish job; fails the workflow if any known secret pattern
# leaked to logs. Patterns kept generic to catch obvious mistakes.
grep -E '(eyJ[A-Za-z0-9_-]{30,}|1//[0-9A-Za-z_-]{40,}|ya29\.[0-9A-Za-z_-]{40,})' \
  $RUNNER_LOG_FILE && exit 1 || exit 0
# eyJ...    : JWT pattern (AMO_JWT_SECRET would not match base64-encoded but JWT *issued* by AMO would)
# 1//...    : Google refresh token pattern (CWS_REFRESH_TOKEN)
# ya29.* : Google access token pattern (derived from refresh token)
```

This is defense in depth on top of `::add-mask::`. AC-X-1 traceability.

## 6. Rotation runbook

| Secret | Trigger to rotate | Procedure |
|---|---|---|
| `AMO_JWT_ISSUER` / `AMO_JWT_SECRET` | Compromise; planned rotation (none scheduled) | 1. AMO Developer Hub -> generate new key pair. 2. Update both repo secrets. 3. Old credentials immediately invalid. |
| `CWS_CLIENT_ID` / `CWS_CLIENT_SECRET` | Compromise; OAuth client deletion in Google Cloud | 1. Create new OAuth client in Google Cloud Console (type: Desktop app). 2. Update env secrets. 3. Re-mint refresh token via `cws-bootstrap.mjs` (rotation cascades). |
| `CWS_REFRESH_TOKEN` | Auto-expiry (6 months unused); user-revoked grant; compromise | 1. Run `node scripts/cws-bootstrap.mjs` locally. 2. Paste new refresh token into `marketplace-prod` environment secret. |
| `CWS_EXTENSION_ID` | Brand-new CWS listing (not rotation) | Update env secret with new ID from CWS dashboard URL. |

Rotation is a manual maintainer task. There is no automated rotation infrastructure (no AWS Secrets Manager, no Vault). For a single-maintainer FOSS repo, this is appropriate.

## 7. KPI #3 guardrail dependency

Outcome KPI #3 ("zero accidental real-store submissions during workflow development") depends critically on the secret discipline above:
- Dry-run mode is the developer's escape hatch — it requires no secrets to mutate state, only to probe.
- The environment gate is the structural enforcement — cannot publish without reviewer click.
- `::add-mask::` discipline is the post-incident enforcement — even if a workflow accidentally logs, the secret is not exfiltrated.

Together these make the "zero accidents" target structurally achievable rather than aspirational.
