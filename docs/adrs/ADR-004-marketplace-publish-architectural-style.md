# ADR-004: Marketplace Publish — Modular Ports-and-Adapters in Functional Style

## Status

Accepted (2026-04-30)

## Context

The marketplace-publishing feature extends `release.yml` to publish to Chrome Web Store and AMO listed channel under explicit maintainer control. The project's locked paradigm (`CLAUDE.md`) is functional programming, with pure functions for transformation and effect boundaries at I/O edges.

We must select an architectural style that:
- Is testable end-to-end (mutation testing >= 80% on modified files).
- Isolates CWS/AMO API specifics from decision logic.
- Composes well with existing pure transforms (`patchManifestForFirefox`, `stripChromeOnlyPermissions`).
- Does not over-engineer for a 1-maintainer, 3-target system.

## Decision

Adopt **modular ports-and-adapters in functional form**:
- **Pure core**: `decisions.pure.mjs` containing all decision logic (target parsing, mode parsing, version state classification, run planning, outcome aggregation, summary rendering). No I/O imports.
- **Effect adapters**: `cws-adapter.effect.mjs`, `amo-listed-adapter.effect.mjs`, `fs-adapter.effect.mjs`. Each module is a single-responsibility wrapper around one external system.
- **Composition root**: `publish-orchestrator.effect.mjs`. Reads env, calls pure parsers, invokes adapters in parallel via `Promise.all`, writes step summary. The only module that imports both pure and effect modules.
- **Driven ports**: function signatures, not interfaces. JS doesn't have nominal interface types; signatures are documented via JSDoc `@typedef` and pinned by tests.
- **Naming convention**: `*.pure.mjs` and `*.effect.mjs` make the boundary visible at file-listing time and grep-checkable in CI (ADR-009).

## Alternatives Considered

### Alternative 1: Single monolithic publish script (`publish.mjs`)
All logic in one file with no internal modules.
- Pros: simplest file layout; least cognitive overhead.
- Cons: no test seams (everything I/O-coupled); mutation testing >= 80% impractical without elaborate fetch monkey-patching; violates `CLAUDE.md` paradigm rule that mandates pure functions for transformation.
- **Rejected**.

### Alternative 2: OO ports-and-adapters with classes
TypeScript classes implementing interfaces (`ICwsClient`, `IAmoClient`).
- Pros: nominal interfaces; IDE autocomplete; standard Hexagonal pattern shape.
- Cons: project paradigm is FP, not OO; adds a TypeScript build dependency for `.mjs`-only project; ceremony for trivial 3-endpoint adapters; tests would still need module-level fetch stubs.
- **Rejected**.

### Alternative 3: Per-target standalone scripts (no orchestrator)
`publish-cws.mjs`, `publish-amo-listed.mjs` invoked directly from YAML steps.
- Pros: no shared code path; failure of one is structurally isolated by GitHub Actions step boundaries.
- Cons: duplicates probe-before-submit logic in each script; per-store retry classification (`already-published` vs `failure`) re-implemented twice; no shared aggregation step writes the single summary required by AC-3-5; harder to add a third target (Edge Add-ons store, hypothetical) later.
- **Rejected**.

### Alternative 4: External orchestration (Argo Workflows, Step Functions)
Move orchestration out of GitHub Actions.
- Pros: theoretical future flexibility.
- Cons: enormous infra footprint for a 1-maintainer, 3-target, low-frequency system; resume-driven anti-pattern (per nw-sa-critique-dimensions Dimension 1).
- **Rejected**.

## Consequences

### Positive
- Decision logic is unit-testable without HTTP mocks. Mutation testing on `decisions.pure.mjs` is the highest-leverage target for the >= 80% gate.
- Adapters are interchangeable: `web-ext sign --channel listed` could be replaced with direct AMO v5 API calls without touching `decisions.pure.mjs` or the orchestrator.
- Future Edge Add-ons store support requires adding `edge-adapter.effect.mjs` only; orchestrator dispatch table extends naturally.
- Existing pure transforms (`patchManifestForFirefox`) are reused unmodified.
- Pattern aligns with existing `find-next-amo-version.mjs` and `sign-firefox-xpi.mjs` shape (small, single-purpose Node ESM scripts).

### Negative
- More files than a monolithic script (8 new `.mjs` files vs 1).
- Discipline required: PR review must confirm `.pure.mjs` files don't import I/O modules. Mitigated by ADR-009 grep-based CI rule.
- Newcomers must learn the pure/effect convention. Mitigated by file naming making the convention visible.

### Quality attribute impact
- **Maintainability/Testability**: positive (CRITICAL driver per ISO 25010).
- **Performance**: neutral (Promise.all for parallel publish; no overhead).
- **Reliability**: positive (per-target outcome objects + aggregation make fail-safe verifiable).

## References

- Functional ports-and-adapters background: Mark Seemann, "From dependency injection to dependency rejection".
- Project paradigm rule: `CLAUDE.md`.
- nw-sa-critique-dimensions: avoids Resume-Driven Development (microservices/Argo) and Technology Preference Bias (no library forced when fetch suffices).
