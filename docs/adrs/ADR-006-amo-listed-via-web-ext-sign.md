# ADR-006: AMO Listed Submission via `web-ext sign --channel listed`

## Status

Accepted (2026-04-30)

## Context

US-2 requires submitting the Firefox xpi to the AMO **listed** channel using existing `AMO_JWT_ISSUER`/`AMO_JWT_SECRET` credentials. The project already uses `web-ext sign --channel unlisted` in `release.yml` and `scripts/sign-firefox-xpi.mjs`. We must decide whether to:
- Reuse `web-ext sign` with `--channel listed`, or
- Call AMO v5 API endpoints (`/api/v5/addons/upload/`, `/api/v5/addons/addon/{id}/versions/`) directly via `fetch`.

## Decision

Reuse **`web-ext sign --channel listed`** invoked from `scripts/amo-listed-adapter.effect.mjs`. The adapter:
1. Stages a firefox-dist directory using existing `patchManifestForFirefox`.
2. Verifies (via direct `fetch` to `/api/v5/addons/addon/{guid}/versions/`) that the requested version is not already on the listed channel — fails fast if it is.
3. Spawns `web-ext sign --channel listed --api-key $AMO_JWT_ISSUER --api-secret $AMO_JWT_SECRET --source-dir <staged>`.
4. Parses stdout/stderr to classify the outcome (`success`, `version_conflict`, `validation_failed`, `unknown_http`).

The version probe is direct fetch (consistent with existing `find-next-amo-version.mjs` JWT pattern). The submission itself is `web-ext`.

## Alternatives Considered

### Alternative 1: Direct AMO v5 API (no web-ext)
Implement upload + version-record POST + signing-result polling ourselves.
- Pros: no subprocess; structured JSON responses; smaller invocation surface.
- Cons:
  - Mozilla maintains `web-ext` as the reference implementation. Subtle bugs (multipart form boundary handling, signing-result polling timing, MV3 validation hooks) re-emerge if we re-implement.
  - Risk of drift: AMO v5 has evolved with channel-specific quirks; web-ext absorbs those.
  - Test surface grows: we'd need contract tests for upload-multipart + version-create + polling, where currently we contract-test only the GET probe.
  - Project already depends on `web-ext` for unlisted; using it for listed is consistent.
- **Rejected.**

### Alternative 2: `amo-upload` or third-party libraries
Various community packages wrap AMO v5.
- Pros: claims to simplify.
- Cons: maintenance signal weak (low download counts, sporadic releases); reinventing what Mozilla already ships.
- **Rejected.**

### Alternative 3: Reuse `web-ext sign --channel listed` (selected)
- Pros:
  - Already a project dependency (`devDependencies` `"web-ext": "^10.0.0"`, MPL 2.0).
  - Identical auth path (JWT HS256 issuer/secret) to existing unlisted flow — only the `--channel` flag differs.
  - Mozilla-maintained; tracks AMO v5 API changes.
  - Same web-ext binary handles the validation + signing-result wait loop.
- Cons:
  - Subprocess output parsing required to classify `version_conflict`. Web-ext's stderr emits `Version X already exists` (verified by inspection of web-ext source); our adapter regex-matches this text. Risk: web-ext changes message text in a future minor version. Mitigation: regex tolerant; contract test pins behavior; locked to current major (^10.0.0).
- **Selected.**

## Consequences

### Positive
- Zero new code for upload/poll/sign mechanics (Mozilla's responsibility).
- Existing unlisted flow remains the reference implementation; new listed flow is "same call, different channel".
- AMO listed adapter file is small (probe + spawn + parse-output ~ 80 lines).

### Negative
- Subprocess dependency means `web-ext` installation is a runtime requirement of the publish job, not just a dev dep. Mitigation: already installed via `npm ci` in current `release.yml`.
- Output parsing is fragile across web-ext versions. Mitigation: pin web-ext major in `package.json`; integration test asserts the regex against actual web-ext output on every PR.
- We do NOT learn or maintain knowledge of the AMO v5 upload-and-version endpoints in our codebase. If web-ext ever becomes unviable, we'd have to write the direct API code at that point. Acceptable trade-off.

### Quality attribute impact
- **Maintainability**: positive (less code to own).
- **Reliability**: positive (Mozilla's wait/poll logic is more correct than ours would be initially).
- **Testability**: slight negative (subprocess is harder to mock than fetch); mitigated by mocking `child_process.spawn` in unit tests.

## References

- web-ext sign docs: `https://github.com/mozilla/web-ext`
- AMO v5 API reference: `https://addons-server.readthedocs.io/en/latest/topics/api/index.html`
- Existing unlisted flow: `scripts/sign-firefox-xpi.mjs`
