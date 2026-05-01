# ADR-008: Version Conflict Policy — Fail-Hard for Listed/CWS, Auto-Bump for AMO Unlisted Only

## Status

Accepted (2026-04-30)

## Context

Marketplace version slots are permanent: AMO reserves a version string per channel on first submission and rejects re-submission of the same string; CWS rejects upload of a version that matches the currently uploaded draft.

For AMO **unlisted** (sideload-distribution xpi), the existing flow auto-bumps via `find-next-amo-version.mjs` because:
- The xpi is consumed by drag-drop install on stock Firefox; users do not compare versions against any catalog.
- Drift between source-of-truth tag and signed unlisted xpi version is acceptable (and historically necessary; see v0.2.0 -> v0.2.9 churn).

For AMO **listed** and Chrome Web Store, auto-bump is **wrong** because:
- The listed/published version is publicly visible. Users running `chrome.runtime.getManifest().version` would see a different number than the GitHub release tag.
- Source-of-truth divergence breaks bug-report triage ("user says they're on 0.3.1 but no such GitHub release exists").
- CWS API does not even support auto-bump (no probe-then-pick API).

DISCUSS Q4 locked: **Option A — tag version verbatim, fail hard for listed/CWS; keep auto-bump for AMO unlisted only.**

## Decision

### CWS and AMO listed (new code paths)
- The orchestrator passes the source manifest version (which equals the tag version, enforced by the existing build-time check in `release.yml`) verbatim to each adapter.
- Each adapter probes the marketplace BEFORE submitting:
  - CWS: `GET /chromewebstore/v1.1/items/{id}?projection=DRAFT` — inspect `draftVersion` and `publishedVersion`.
  - AMO listed: `GET /api/v5/addons/addon/{guid}/versions/?filter=all_with_unlisted&page_size=100` — filter results to `channel=listed`.
- The pure `classifyVersionState(requestedVersion, existing)` returns one of:
  - `available` — proceed.
  - `partial-upload` (CWS only) — version is uploaded as DRAFT but not published; orchestrator's mode determines next action (`publish` calls only the publish endpoint; `upload-only` exits with classification "already in draft state"; `dry-run` reports "would publish only").
  - `already-published` — exit non-zero with classification `already-published`. No re-submit. No auto-bump.
- On `already-published`, `PublishOutcome.message` reads: `"Version X.Y.Z already on {marketplace}. Bump source manifest, re-tag, and re-run."` (verbatim, AC-2-4 alignment).

### AMO unlisted (existing code path)
- `scripts/sign-firefox-xpi.mjs` continues to call `scripts/find-next-amo-version.mjs` and auto-bump.
- This path is invoked by the existing tag-build job in `release.yml`, NOT by the new orchestrator.
- Architecture rule (ADR-009 + section 6 of `component-boundaries.md`): the new orchestrator MUST NOT call `find-next-amo-version.mjs`.

## Alternatives Considered

### Alternative 1: Auto-bump everywhere
Apply `find-next-amo-version.mjs` logic to listed and CWS too.
- Pros: never fails on conflict; release proceeds regardless.
- Cons: silently desyncs public listing version from source-of-truth tag; users see version numbers that don't exist on GitHub. Anti-pattern. Also impossible on CWS (no probe API).
- **Rejected.**

### Alternative 2: Force-version override input
A workflow input `force_version: 'X.Y.Z'` overrides the tag version, allowing manual recovery from conflicts.
- Pros: escape hatch for the rare case.
- Cons: encourages "just bump it" behavior that the memory rule explicitly resists; another input to test and document; the proper recovery (bump source manifest + re-tag) is straightforward and aligns with project hygiene.
- **Rejected for v1.** Could be added later if a real need emerges.

### Alternative 3: Asymmetric (auto-bump listed, fail-hard CWS) or vice versa
- Cons: confusing surface — two channels behave differently for the same conflict cause.
- **Rejected.**

### Alternative 4: Selected — Fail-hard for listed/CWS, auto-bump unlisted only (Q4 Option A)
Documented above.
- **Selected.**

## Consequences

### Positive
- Public listing version always equals the GitHub release tag. Bug reports have unambiguous triage.
- The memory rule's spirit ("don't silently bump versions") is preserved.
- AMO unlisted continues to work as today; existing `npm run sign` for sideload testing is untouched (AC-2-3).
- Recovery path on conflict is straightforward and documented in CI summary (US-4).

### Negative
- A failed publish (e.g., AMO succeeded, CWS half-uploaded but unpublished) cannot be recovered by auto-bump; the maintainer either re-runs with the same tag (probe-before-submit handles partial-upload correctly) or bumps tag for a fresh attempt.
- Two different version policies exist in the codebase (auto-bump for unlisted, fail-hard for listed/CWS). Mitigated by ADR-009 enforcing that listed/CWS code never calls the unlisted probe.

### Quality attribute impact
- **Functional Suitability/Correctness**: positive (canonical version preserved).
- **Reliability/Recoverability**: positive (probe-before-submit makes re-runs idempotent).
- **Maintainability**: slight negative (two version policies); mitigated by enforcement rule.

## References

- DISCUSS Q4 resolution: `docs/feature/marketplace-publishing/discuss/wave-decisions.md`.
- Existing auto-bump logic: `scripts/find-next-amo-version.mjs`.
- AC-2-1, AC-2-4, AC-3-8, AC-4-2, AC-4-3.
