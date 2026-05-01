# Acceptance Criteria: Marketplace Publishing

Feature ID: `marketplace-publishing`
Wave: DISCUSS

Acceptance criteria are derived from UAT scenarios in `user-stories.md`. Every AC is observable, testable, and outcome-focused (no technology prescriptions; those belong in DESIGN). Format: `AC-{story}-{n}`.

---

## US-1: Configure Chrome Web Store credentials

| AC ID | Acceptance Criterion |
|---|---|
| AC-1-1 | Bootstrap script accepts no command-line secret arguments; reads OAuth client credentials interactively or from environment variables. |
| AC-1-2 | Bootstrap script never writes secret values to disk -- output is stdout-only. |
| AC-1-3 | Documentation lists exactly the four required GitHub secret names: `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`, `CWS_EXTENSION_ID`. |
| AC-1-4 | Dry-run mode of the publish workflow reports credential validity within 30 seconds, without submitting an artifact. |
| AC-1-5 | Misconfigured OAuth client (wrong scope) produces an error message naming the missing scope and a remediation URL. |
| AC-1-6 | Bootstrap success completes in a single ~15-minute session for a maintainer following the documentation. |

## US-2: Configure AMO listed-channel publishing

| AC ID | Acceptance Criterion |
|---|---|
| AC-2-1 | Listed-channel publish uses the source `dist/manifest.json` version verbatim (no auto-bump). |
| AC-2-2 | Listed-channel publish reuses the existing `AMO_JWT_ISSUER` / `AMO_JWT_SECRET` GitHub secrets. |
| AC-2-3 | Existing `npm run sign` (unlisted-channel local sideload) continues to work end-to-end after this story merges. |
| AC-2-4 | Listed-channel publish exits non-zero with a "version already on listed" message when the source version conflicts. |
| AC-2-5 | Listed-channel publish never modifies source `manifest.json` or `package.json`. |
| AC-2-6 | When AMO credentials are absent, the script exits non-zero with a documentation pointer. |
| AC-2-7 | Listed and unlisted submissions for the same version coexist (separate AMO version slots). |

## US-3: Trigger marketplace publish from CI

| AC ID | Acceptance Criterion |
|---|---|
| AC-3-1 | Publish job is triggered by `workflow_dispatch` only -- never by a tag push event. |
| AC-3-2 | Publish job is gated by GitHub Environment `marketplace-prod` with required reviewer. |
| AC-3-3 | CWS and AMO listed steps run in parallel within the publish job. |
| AC-3-4 | Failure of one publish step does NOT abort the other; both attempt completion. |
| AC-3-5 | Workflow summary identifies per-marketplace outcome with one of the classifications: `success`, `failure`, `skipped`, `already-published`. |
| AC-3-6 | `targets` input accepts exactly the values `both`, `cws`, `amo-listed`. |
| AC-3-7 | `cws_publish` input accepts exactly the values `default`, `trustedTesters`, `upload-only`. |
| AC-3-8 | Re-dispatching publish on an already-published version returns classification `already-published` for both stores without re-submitting. |
| AC-3-9 | Tagging `v*` continues to produce build artifacts attached to a GitHub release; this behavior is unchanged from the pre-feature baseline. |
| AC-3-10 | Publish workflow run includes a link to each marketplace's dashboard for the submitted item on success. |

## US-4: Recover from partial-failure publish

| AC ID | Acceptance Criterion |
|---|---|
| AC-4-1 | Per-store retry succeeds via `targets: cws` or `targets: amo-listed` without touching the other store. |
| AC-4-2 | Each publish step probes marketplace state before submitting; classifies state as `not-uploaded`, `partial-upload`, or `already-published`. |
| AC-4-3 | When marketplace state is `already-published`, the step exits with that classification rather than a generic failure. |
| AC-4-4 | Workflow run summary on a failed step contains an exact copy-paste recovery dispatch parameter set. |
| AC-4-5 | Workflow run summary references the project's release troubleshooting doc. |

## US-5: Dry-run validation

| AC ID | Acceptance Criterion |
|---|---|
| AC-5-1 | `dry_run` workflow input defaults to false; opt-in only. |
| AC-5-2 | When `dry_run=true`, no upload or publish API call is invoked against any marketplace. |
| AC-5-3 | Dry-run validates: credential exchange, artifact existence, manifest version match, marketplace state probe. |
| AC-5-4 | Every dry-run-conditional log line is prefixed with `[DRY RUN]`. |
| AC-5-5 | Dry-run runs without the `marketplace-prod` environment-gate approval (read-only verification). |
| AC-5-6 | Dry-run detects an expired refresh token and surfaces a remediation pointer; exits non-zero. |
| AC-5-7 | Dry-run detects a version conflict and surfaces "would-fail" classification; exits non-zero. |

---

## Cross-cutting acceptance criteria (apply to all stories)

| AC ID | Acceptance Criterion |
|---|---|
| AC-X-1 | No GitHub Actions log line contains a verbatim secret value (verified by grep against known secret prefixes in CI logs). |
| AC-X-2 | All publish flows are functional-style: pure functions for argument parsing and state classification, effectful boundaries (HTTP, fs) isolated in dedicated modules (carry-forward of project paradigm). |
| AC-X-3 | Per-feature mutation testing kill rate >= 80% on modified files (project mutation testing rule). |
| AC-X-4 | Total publish time (happy path, both stores in parallel) under 5 minutes wall-clock excluding marketplace review queue time. |
| AC-X-5 | The maintainer's "no auto-release" memory rule is observably preserved: pushing a tag does NOT submit to any marketplace; submission requires a separate explicit human action. |
