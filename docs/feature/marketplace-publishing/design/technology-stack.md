# Technology Stack: Marketplace Publishing

Feature ID: `marketplace-publishing`
Wave: DESIGN

All choices: OSS, MIT/MPL/Apache license. No proprietary dependencies introduced.

## 1. Runtime and language

| Choice | Version | License | Rationale |
|---|---|---|---|
| Node.js | 20.x (LTS) | MIT | Already pinned in `release.yml` `setup-node@v4 with: node-version: '20'`. No new tooling. |
| ES Modules (`.mjs`) | -- | -- | Project convention (`package.json` `"type": "module"`). Native `fetch` available. |

## 2. CWS publishing: direct `fetch` vs library

**Decision: direct `fetch`.** See ADR-005.

Considered:
1. **`chrome-webstore-upload`** (npm, MIT, ~150k downloads/month). Pros: ergonomic API. Cons: extra dependency for ~3 endpoints; library opacity around error responses; project's existing AMO probe (`find-next-amo-version.mjs`) already uses raw `fetch` -- consistency; smaller `npm install` for CI.
2. **`googleapis`** (official, Apache 2.0). Pros: unified Google API surface. Cons: enormous (200+ MB unpacked); CWS API not in the auto-generated client; would still need raw `fetch` for CWS endpoints anyway.
3. **Direct `fetch`**. Pros: zero new deps, full control over error classification, consistent with existing `find-next-amo-version.mjs` style. Cons: ~50 lines of OAuth + endpoint glue we own. Aligns with FP paradigm preference (small, composable, no framework ceremony).

**Selected: direct `fetch`.** Adapter exposes typed (jsdoc) functions matching driven port signatures.

### CWS API endpoints used

| Endpoint | Method | Purpose | Used by |
|---|---|---|---|
| `https://oauth2.googleapis.com/token` | POST | Exchange `CWS_REFRESH_TOKEN` -> short-lived access token | `exchangeCwsRefreshToken` |
| `https://www.googleapis.com/chromewebstore/v1.1/items/{id}?projection=DRAFT` | GET | Probe current uploaded version (state = `IN_PROGRESS`/`OK`) | `probeCwsItemState` |
| `https://www.googleapis.com/upload/chromewebstore/v1.1/items/{id}` | PUT | Upload new zip | `uploadCwsItem` |
| `https://www.googleapis.com/chromewebstore/v1.1/items/{id}/publish?publishTarget={default\|trustedTesters}` | POST | Publish uploaded item (or skip for `upload-only` mode) | `publishCwsItem` |

OAuth scope: `https://www.googleapis.com/auth/chromewebstore`.

References:
- Google API docs: `https://developer.chrome.com/docs/webstore/using-api`
- API v1.1 reference: `https://developer.chrome.com/docs/webstore/api`

## 3. AMO listed publishing: `web-ext sign --channel listed` vs direct API

**Decision: reuse `web-ext sign --channel listed`.** See ADR-006.

Considered:
1. **`web-ext sign --channel listed`** (Mozilla, MPL 2.0). Pros: already a project dependency (`devDependencies` `"web-ext": "^10.0.0"`); identical auth path as existing unlisted flow (just channel flag differs); battle-tested by Mozilla; handles upload + version-record-creation as a unit. Cons: shells out to a subprocess; output parsing required.
2. **Direct `fetch` to `/api/v5/addons/upload/` + `/api/v5/addons/addon/{id}/versions/`** (AMO v5 API). Pros: no subprocess; structured responses. Cons: re-implements what `web-ext` already does correctly; risk of subtle drift from Mozilla's reference behavior (signing artifact polling, validation result handling); dependency footprint not actually smaller (AMO upload requires multipart form with `addon` + `version` + `channel=listed` + JWT).
3. **`amo-upload`** or similar third-party libraries: lower maintenance signal; not necessary given (1).

**Selected: `web-ext sign --channel listed`** invoked from `amo-listed-adapter.effect.mjs`. Adapter constructs a staged firefox-dist directory using existing `patchManifestForFirefox`, invokes `web-ext`, parses stdout for the listing URL and submission ID, and classifies any "Version X already exists" message as `already-published`.

### AMO API endpoints touched (directly or via web-ext)

| Endpoint | Method | Purpose | Used by |
|---|---|---|---|
| `https://addons.mozilla.org/api/v5/addons/addon/{guid}/versions/?filter=all_with_unlisted&page_size=100` | GET | Probe versions (filter to channel=listed in pure code) | `probeAmoListedVersions` (direct fetch, mirrors existing `find-next-amo-version.mjs`) |
| `https://addons.mozilla.org/api/v5/addons/upload/` | POST | Upload xpi (called by `web-ext` internally) | `submitAmoListed` (via web-ext) |
| `https://addons.mozilla.org/api/v5/addons/addon/{id}/versions/` | POST | Create version record with `channel=listed` (called by `web-ext` internally) | `submitAmoListed` (via web-ext) |

JWT: HS256, same `AMO_JWT_ISSUER` / `AMO_JWT_SECRET` as existing unlisted flow. JWT generator code reused via copy from `find-next-amo-version.mjs` (or extracted into `amo-jwt.pure.mjs` if both adapters need it).

References:
- AMO v5 API docs: `https://addons-server.readthedocs.io/en/latest/topics/api/index.html`
- web-ext sign: `https://github.com/mozilla/web-ext`

## 4. CWS bootstrap (one-time local OAuth)

**Decision: minimal local CLI with native HTTP server, no OAuth library.** See ADR-005.

Considered:
1. **`googleapis`**: heavy (section 2). Rejected.
2. **`google-auth-library`** (Apache 2.0). Pros: official. Cons: still requires us to spin a localhost server for the desktop OAuth callback; library does not wrap that step.
3. **Native `http` server + native `fetch`**. Pros: zero new deps; matches the project's "small composable scripts" pattern.

**Selected: native**. ~80 lines: spin `http.createServer` on `localhost:3000`, open `https://accounts.google.com/o/oauth2/v2/auth?...` in the user's browser via `open` URL output, capture the auth code from the redirect, POST to `https://oauth2.googleapis.com/token`, print the four secret values to stdout. Never writes to disk.

## 5. JWT signing for AMO

Reuse existing pattern from `find-next-amo-version.mjs`: native `crypto.createHmac('sha256', secret)` + base64url encoding. No JWT library introduced. If both AMO adapters need it, extract a 20-line `amo-jwt.pure.mjs` module (pure: no I/O).

## 6. GitHub Actions glue

| Choice | Version | License | Rationale |
|---|---|---|---|
| `actions/checkout` | v4 | MIT | Already used. |
| `actions/setup-node` | v4 | MIT | Already used. |
| `actions/upload-artifact` / `actions/download-artifact` | v4 | MIT | New: pass built zip + xpi from build job to publish job without rebuilding. |
| `softprops/action-gh-release` | v2 | MIT | Already used; unchanged. |

GitHub **Environments** with required reviewers: built-in GitHub feature, no third-party action needed.

Step summary writes: native `echo "..." >> $GITHUB_STEP_SUMMARY` (no action needed).

## 7. Testing tooling (FP paradigm)

| Choice | Version | License | Use |
|---|---|---|---|
| `vitest` | ^2.1.0 | MIT | Already in project. Unit tests for `*.pure.mjs` decision modules. |
| `stryker-mutator` (`@stryker-mutator/core` + `@stryker-mutator/vitest-runner`) | latest | Apache 2.0 | Per-feature mutation testing >= 80% gate (`CLAUDE.md` rule). DEVOPS adds the runner config; DESIGN names it. |
| Pact-JS (`@pact-foundation/pact`) | latest | MIT | Consumer-driven contract testing for CWS and AMO probe endpoints. DEVOPS wires into CI acceptance stage. |
| `web-ext` | ^10.0.0 | MPL 2.0 | Already in project. Signing for listed and unlisted channels. |

## 8. Excluded technologies (and why)

| Tech | Why excluded |
|---|---|
| `chrome-webstore-upload` library | Adds a dep for trivial fetch logic; project preference for direct fetch (ADR-005). |
| `googleapis` | 200+ MB; CWS not in generated client anyway. |
| Argo Workflows / external orchestrator | Resume-driven for a 1-person, 3-target system. |
| Custom Docker images for the publish runner | Default `ubuntu-latest` is sufficient; no native binaries needed. |
| TypeScript for new scripts | Project's existing scripts are `.mjs` with jsdoc types; matches convention. (Tests in `tests/` may be `.ts` -- consistent with project existing pattern.) |

## 9. Secrets inventory

| Secret name | Scope | Rotation source | Used by |
|---|---|---|---|
| `CWS_CLIENT_ID` | Repo Actions | Google Cloud Console OAuth client | `cws-adapter.effect.mjs` |
| `CWS_CLIENT_SECRET` | Repo Actions | Google Cloud Console OAuth client | `cws-adapter.effect.mjs` |
| `CWS_REFRESH_TOKEN` | Repo Actions | `scripts/cws-bootstrap.mjs` (local one-time) | `cws-adapter.effect.mjs` |
| `CWS_EXTENSION_ID` | Repo Actions | CWS dashboard (32-char hex shown after item creation) | `cws-adapter.effect.mjs` |
| `AMO_JWT_ISSUER` | Repo Actions (existing) | `https://addons.mozilla.org/en-US/developers/addon/api/key/` | `amo-listed-adapter.effect.mjs` + existing `sign-firefox-xpi.mjs` |
| `AMO_JWT_SECRET` | Repo Actions (existing) | Same as above | Same as above |

NFR-4 compliance:
- No secret value reaches stdout from any script.
- The orchestrator's CWS adapter wraps the access token retrieval in `::add-mask::ACCESS_TOKEN` before any subsequent step references it.
- CI logs grep'd for known secret prefixes as part of acceptance test (AC-X-1).
