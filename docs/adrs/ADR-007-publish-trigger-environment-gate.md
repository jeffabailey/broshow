# ADR-007: Publish Trigger — Environment-Gated Job in `release.yml` (with Documented Fallback)

## Status

Accepted (2026-04-30)

## Context

The maintainer's memory rule (`feedback_no_auto_release.md`) prohibits auto-bumping, auto-tagging, or auto-pushing on every change. Q3 of DISCUSS resolved this for the publish trigger:

> Publish requires a human action SEPARATE from `git push origin v*`.

Locked decision: Q3 Option C — **environment-gated publish job within `release.yml`**, with required reviewer = repo owner.

We must design the trigger model and document a fallback path because GitHub Environments availability depends on repo plan: free-tier private repos can lack the feature, in which case Q3 Option B (separate `publish-stores.yml` triggered by `workflow_dispatch`) applies.

## Decision

### Primary path

Extend `release.yml` to have **two jobs**:
1. `build` — runs on `push: tags: v*` AND on `workflow_dispatch`. Existing build, manifest-version-check, package, stage-firefox, lint, AMO unlisted sign, GitHub release creation. Outputs the built artifacts via `actions/upload-artifact@v4`.
2. `publish` — `needs: build`, conditional on `github.event_name == 'workflow_dispatch'`, gated by `environment: marketplace-prod`. Downloads artifacts from `build` (no rebuild). Invokes `node scripts/publish-orchestrator.effect.mjs` with workflow inputs as env vars. Required reviewer on the environment is the repo owner.

Workflow inputs added to `release.yml`:
- `tag` (required) — string, the tag whose artifacts to publish.
- `targets` (default `both`) — choice: `both | cws | amo-listed`.
- `cws_publish` (default `default`) — choice: `default | trustedTesters | upload-only`.
- `dry_run` (default `false`) — boolean. When `true`, the publish job runs WITHOUT the environment gate (it's read-only verification; AC-5-5).

Tag-push behavior is **unchanged**: pushing `v0.3.0` runs `build` only, produces a GitHub release with both artifacts, does NOT run `publish`. (AC-3-1, AC-3-9, AC-X-5.)

### Fallback path

If GitHub Environments are not available on this repo's plan (DEVOPS verifies during platform setup):
- Keep `release.yml` with build-only behavior (existing).
- Add a separate `.github/workflows/publish-stores.yml` triggered only by `workflow_dispatch` (no environment gate; the dispatch action itself is the explicit human go-ahead).
- All scripts (orchestrator, adapters, decisions) are identical.

The decision between primary and fallback is a DEVOPS implementation detail; both paths satisfy the memory rule.

## Alternatives Considered

### Alternative A: Auto-publish on tag push (Q3 Option A)
Tag push triggers full build + publish.
- Pros: simplest YAML.
- Cons: silently re-purposes `git tag v*` as "ship to stores", which is exactly the pattern the memory rule pushes back on. Diagnostic tags (cf. v0.2.0 -> v0.2.9 churn) would burn AMO/CWS version slots.
- **Rejected (memory rule violation).**

### Alternative B: Separate `publish-stores.yml` with `workflow_dispatch` only (Q3 Option B)
Two completely separate workflows.
- Pros: cleanest separation; dispatch action IS the go-ahead; no environment dependency.
- Cons: build artifacts in one workflow run, publish in another — provenance harder to audit ("what exact build got published?"). Solvable with `actions/download-artifact` cross-workflow but adds complexity. Also, two YAML files to maintain.
- **Used as fallback only.**

### Alternative C: Single `release.yml` with environment-gated publish job (selected)
- Pros: build + publish in one workflow run = clean provenance; environment approval is a built-in GitHub UI; required-reviewer makes "explicit go-ahead" structural; dry-run mode skips the gate (safe).
- Cons: depends on GitHub Environments feature; slight YAML complexity.
- **Selected (with fallback B documented).**

### Alternative D: Hybrid (`release.yml` for build + push, `publish-stores.yml` for publish via `workflow_dispatch`)
- Pros: cleanest mental model.
- Cons: same provenance issue as B. No advantage over C when Environments are available.
- **Rejected when C is available; conceptually equivalent to fallback B.**

## Consequences

### Positive
- **Memory rule preserved structurally**: pushing a tag CANNOT trigger a marketplace submission. The required-reviewer click on the environment is the explicit go-ahead.
- One workflow run per release: build + publish in same trace; "what got published" is one click in Actions UI.
- Dry-run skips the gate, allowing safe iteration without burning approval clicks.
- Required-reviewer = repo owner means no other collaborator can publish without owner approval (NFR-4 security boundary).

### Negative
- Dependent on GitHub Environments. If unavailable, fallback path B is used; no architectural change required.
- Required-reviewer must be set up manually in repo Settings -> Environments (one-time DEVOPS task).

### Quality attribute impact
- **Compliance with maintainer rule (NFR-7)**: positive (CRITICAL).
- **Security/Auditability (NFR-4)**: positive (every publish has a recorded approval).
- **Operability**: slight cost (maintainer must click approve), but this is the desired behavior.

## References

- Memory rule: `~/.claude/projects/-Users-jeffbailey-Projects-foss-leading-broshow/memory/feedback_no_auto_release.md`
- GitHub Environments: `https://docs.github.com/en/actions/deployment/targeting-different-environments/managing-environments-for-deployment`
- DISCUSS Q3 resolution: `docs/feature/marketplace-publishing/discuss/wave-decisions.md` (Q3 Option C locked).
