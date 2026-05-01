# ADR-005: CWS Adapter — Direct `fetch` vs. Library

## Status

Accepted (2026-04-30)

## Context

The CWS adapter (`scripts/cws-adapter.effect.mjs`) needs to:
1. Exchange `CWS_REFRESH_TOKEN` for an OAuth access token via `https://oauth2.googleapis.com/token`.
2. GET the current item's draft state.
3. PUT a zip file as a new upload.
4. POST to the publish endpoint.

Three implementation options exist: third-party CWS-specific library, official Google API library, or direct `fetch`.

## Decision

Use **direct `fetch`** with native Node.js 20 globals. Implement OAuth token exchange and the four CWS endpoints inline within `cws-adapter.effect.mjs`. No new npm dependencies.

## Alternatives Considered

### Alternative 1: `chrome-webstore-upload` npm package
- License: MIT.
- Health: ~150k weekly downloads, last commit recent (good).
- Pros: ergonomic API surface (`uploadAndPublish(zipPath)`); handles OAuth refresh transparently.
- Cons:
  - Adds a transitive dependency tree for ~50 lines of fetch code we can write in-line.
  - Library opacity around error response classification: we need to distinguish `version_conflict` from `auth_expired` from `payload_too_large` to drive `OutcomeStatus`. Library hides response bodies behind generic `Error` messages.
  - Inconsistent with existing project pattern: `find-next-amo-version.mjs` and `sign-firefox-xpi.mjs` use raw `fetch` and `crypto`; introducing a wrapper library only for CWS would be irregular.
- **Rejected.**

### Alternative 2: `googleapis` npm package (official Google client)
- License: Apache 2.0.
- Pros: official; auto-generated from Google's discovery docs.
- Cons:
  - 200+ MB unpacked; massive for what we need.
  - CWS Publish API is NOT in the auto-generated client (it's a "non-discovery" API); we'd still hand-roll the four endpoints.
  - Net effect: 200 MB of dependency for OAuth-token-exchange convenience only.
- **Rejected.**

### Alternative 3: `google-auth-library` (just for OAuth)
- License: Apache 2.0.
- Pros: clean OAuth helpers; smaller than `googleapis`.
- Cons: still doesn't handle the desktop-OAuth localhost-callback flow that `cws-bootstrap.mjs` needs (we have to spin our own server); for the CI runtime adapter, OAuth is just a single POST -- the library is overkill.
- **Rejected.**

### Alternative 4: Direct `fetch` (selected)
- Pros:
  - Zero new dependencies. Smaller `npm ci` time in CI.
  - Full control over error classification (read response body, match on `code`/`error_description`/`status`).
  - Consistent with existing project scripts that use raw `fetch` (`find-next-amo-version.mjs`).
  - Aligns with FP paradigm preference for small composable modules over framework ceremony.
  - ~50 lines of code we own and can mutation-test.
- Cons:
  - We own the OAuth retry/refresh edge cases (mitigated: refresh token is long-lived; access tokens are minted per workflow run; no refresh loop needed within a single run).
  - Multipart upload handling for the PUT requires a small amount of stream code (mitigated: Node 20's native `fetch` accepts a `ReadStream` body; ~5 lines).
- **Selected.**

## Consequences

### Positive
- No new dependency to track for security/CVE.
- Adapter file is fully readable; reviewer can match every line to a CWS API doc URL.
- Error classification is explicit and unit-testable.
- Pact-JS contract testing is straightforward: the request shape we construct in our own code is the shape we contract-test.

### Negative
- We commit to maintaining the small fetch glue if the Google OAuth API changes. Risk: low (RFC 6749 stability).
- A future maintainer must read CWS API docs to understand each endpoint, instead of reading a single library README.

## References

- CWS Publish API: `https://developer.chrome.com/docs/webstore/api`
- Google OAuth refresh-token flow: `https://developers.google.com/identity/protocols/oauth2/native-app#offline`
- Project precedent: `scripts/find-next-amo-version.mjs` (uses raw fetch with HS256 JWT).
