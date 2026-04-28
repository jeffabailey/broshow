# Branching Strategy: BroShow

## Model: trunk-based (solo, lightweight)

One long-lived branch: `main`. Short-lived feature branches < 1 day. Releases via tags. Lightweight branch protection appropriate for a solo developer.

## Rules

| Rule | Setting | Rationale |
|------|---------|-----------|
| Default branch | `main` | Single source of truth |
| Branch lifetime | < 1 day | Trunk-based discipline; encourages small batches (CD principle) |
| Feature branch naming | `<topic>` (free-form) or `feature/<topic>` | Solo dev — naming convention is for the developer's benefit only |
| Direct push to `main` | **Allowed** for trivial commits (typo fixes, doc tweaks) when CI is green | Solo dev; PR overhead for a one-line fix is wasteful |
| PR required for `main` | **Recommended** for any source code change | Forces CI green before merge; gives a review trail even when self-reviewed |
| Force push to `main` | **Disallowed** | Lose history; breaks bisect |
| Linear history on `main` | Preferred (squash or rebase merge) | Easier bisect when something breaks in production |
| Required CI checks on PR | All `build-test (chrome)`, `build-test (edge)`, `build-test (firefox)` jobs | Three-leg matrix is the minimum signal |
| Mutation testing | On-demand (label `mutation` or `workflow_dispatch`) | Per-feature cadence per project decision; not blocking on every PR |
| Deleting merged branches | Auto-delete on merge | Hygiene |

### Why "lightweight"

- 2+ approvers: irrelevant (one developer).
- Signed commits: nice-to-have, not required (low supply-chain risk for a tiny extension repo).
- Code owner review: irrelevant (one owner).
- 24-hour stale-branch enforcement: discipline goal, not enforced by tooling — kept as a self-rule rather than a GitHub setting to keep friction low.

## Versioning convention

**Semver: `vMAJOR.MINOR.PATCH`** (e.g., `v0.1.0`, `v0.2.0`, `v1.0.0`).

| Bump | When |
|------|------|
| MAJOR | Breaking change to user-visible behavior or to the manifest permission set (the privacy contract is part of the product) |
| MINOR | New feature, new browser supported, new opt-in capability |
| PATCH | Bug fix, refactor, dependency bump with no behavior change |

`package.json` version, `src/manifest.json` version, and the git tag MUST agree. (CI can assert this in the future as an additional gate; not blocking for v0.1.x.)

Pre-`v1.0.0`: minor version freely changes; this signals to users and to CWS that the product is in active early development.

## Release lifecycle

```
1.  Open feature branch        ──▶  hack
2.  Push feature branch        ──▶  CI runs commit + acceptance
3.  Open PR to main            ──▶  CI runs full matrix
4.  CI green + self-review     ──▶  squash-merge to main
5.  Decide release-worthy?
        ├── No  → next feature
        └── Yes → bump version in package.json + manifest.json
                 → commit "chore: bump v0.X.Y"
                 → git tag vX.Y.Z
                 → git push origin main vX.Y.Z
                 → (today) build .zip locally or download CI artifact, upload to CWS
                 → (future, when release job added) GitHub Release auto-created with .zip attached
```

## How releases relate to commits

- Every commit on `main` is shippable (CI gate enforces this).
- A **release** is a commit that the developer has chosen to publish to CWS by tagging it.
- Not every `main` commit is tagged. Tagging is a deliberate act, not an automation trigger today.
- Future state (one job added, no refactor): tagging triggers a GitHub Release; CWS upload remains manual.

## Branch protection (recommended GitHub UI settings)

Apply to `main`:

- [x] Require a pull request before merging — set to **off for the solo developer's own commits** (or leave on if you want forced PRs; both are reasonable)
- [x] Require status checks to pass before merging
  - Required checks: `build-test (chrome)`, `build-test (edge)`, `build-test (firefox)`
- [x] Require branches to be up to date before merging
- [x] Block force pushes
- [ ] Require signed commits (skip — low value for solo dev)
- [ ] Require approvals (skip — solo)
- [ ] Restrict who can push to matching branches (skip — solo)

## When to revisit this strategy

- Second contributor joins → switch to GitHub Flow (PR required, review required).
- Multiple supported MAJOR versions in production → consider `release/X.x` branches.
- Move to true CD (auto-publish to CWS on tag) → keep trunk-based, add CWS API publish job.

## Anti-patterns to avoid

| Anti-pattern | Why it's bad here |
|--------------|-------------------|
| Long-lived feature branches | Defeats trunk-based; merge conflicts compound for a tiny codebase |
| GitFlow | Massive overkill; designed for scheduled releases with multiple supported versions |
| Skipping CI with `[skip ci]` | The CI gates ARE the KPI gates; skipping = shipping unverified privacy contract |
| Tagging without bumping `package.json` / `manifest.json` | Version drift; CWS upload will not match the declared version |
| Hotfix branches | Trunk-based: hotfix is just a small commit on main. Don't invent process for the case that hasn't happened. |
