# ADR-009: Pure vs. Effect File-Naming Convention as Architecture-Rule Enforcement

## Status

Accepted (2026-04-30)

## Context

The project's locked paradigm (`CLAUDE.md`) is functional programming with pure transformation functions and effects isolated at module boundaries. The marketplace-publishing feature introduces multiple new modules. Without an enforced rule, "pure" modules can drift impure over time as someone adds a `readFileSync` "for convenience".

In typed languages, dependency rules are enforced by tools like ArchUnit (Java), import-linter (Python), pytest-archon (Python), or dependency-cruiser (JS/TS). The principle stated in the agent's core: "Architecture rules without enforcement erode."

This project is `.mjs` (no TypeScript build), small (single maintainer), and uses simple Node tooling. We need an enforcement mechanism that:
- Is detectable in CI without adding heavy dependencies.
- Is visible at file-listing time (a maintainer reading `ls scripts/` should see the boundary).
- Catches the most common impurity introductions (filesystem, child_process, http, fetch).

## Decision

Adopt the file-naming convention:
- `*.pure.mjs` — modules that MUST NOT import I/O modules and MUST NOT call `fetch`. Inputs determine outputs.
- `*.effect.mjs` — modules that may perform I/O. All adapters and the orchestrator have this suffix.

Enforce via a CI grep step (added in DEVOPS wave):

```sh
#!/usr/bin/env bash
set -euo pipefail
violations=$(git ls-files 'scripts/*.pure.mjs' 2>/dev/null \
  | xargs -I{} grep -lE \
    "from ['\"]node:(fs|fs/promises|child_process|http|https|net|dgram|dns)['\"]|from ['\"](fs|child_process|http|https)['\"]|fetch\(" \
    {} 2>/dev/null || true)
if [ -n "$violations" ]; then
  echo "::error::pure modules cannot import I/O modules or call fetch:"
  echo "$violations"
  exit 1
fi
```

This step runs in the existing CI test job (no new infrastructure). It is the FP-equivalent of the dependency-rule enforcers used in OO/typed projects.

Existing pure modules (`scripts/patch-firefox-manifest.mjs`, `scripts/strip-chrome-only-permissions.mjs`) are not renamed in this feature (out of scope churn). The convention applies to NEW modules added by this feature. A follow-up DELIVER cycle could rename existing pure modules for consistency.

## Alternatives Considered

### Alternative 1: TypeScript with branded types or a custom ESLint rule
- Pros: type-system-enforced purity (e.g., `readonly` everywhere; `Effect<T>` wrapper types).
- Cons: project is `.mjs`, not TS; introducing TS for this feature alone is heavy; ESLint custom rules are non-trivial to author and maintain for a 1-person project.
- **Rejected.**

### Alternative 2: `dependency-cruiser` (npm package)
- License: MIT.
- Pros: declarative dependency rules, popular tool.
- Cons: adds a new dependency (~5 MB) and YAML/JS config file for a check that 10 lines of bash perform; tool is more powerful than we need.
- **Rejected.** Could be adopted later if rules grow.

### Alternative 3: import-linter / pytest-archon analog
N/A — those are Python tools.

### Alternative 4: PR-review-only (no automated check)
- Pros: zero tooling cost.
- Cons: per the principle in the agent core: "Architecture rules without enforcement erode." A 1-maintainer project is most vulnerable to "I'll just add this real quick" drift.
- **Rejected.**

### Alternative 5: Selected — file-naming convention + grep CI step
- Pros: zero new dependencies; convention is visible in `ls`; detection catches the 5-6 import patterns that would actually introduce impurity; one small bash file to maintain.
- Cons: convention requires maintainer discipline on naming; grep is a blunt instrument (false positives possible if someone names a pure helper `something.pure.mjs` but writes a CLI entry inside it). Mitigated by separate CLI entry point convention.
- **Selected.**

## Consequences

### Positive
- Pure / effect boundary is visible at file-listing time.
- New contributors see the convention without reading a CONTRIBUTING.md.
- CI catches drift automatically on every PR.
- Aligns with FP paradigm rule from `CLAUDE.md`.

### Negative
- Bash grep enforcement is less precise than a typed approach. False positives possible on edge cases (e.g., a comment containing `fetch(`). Mitigated by careful regex.
- Existing pure modules use the un-suffixed name; mixed convention across the codebase until a follow-up rename. Acceptable; this is a known transitional cost.

### Quality attribute impact
- **Maintainability/Modularity**: positive.
- **Maintainability/Analyzability**: positive (boundary visible in tree).

## References

- nw-architecture-patterns: ports-and-adapters dependency-inversion principle.
- Agent core principle 10: "Architecture rules without enforcement erode."
- Project paradigm: `CLAUDE.md`.
