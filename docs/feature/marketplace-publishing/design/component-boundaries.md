# Component Boundaries: Marketplace Publishing

Feature ID: `marketplace-publishing`
Wave: DESIGN
Paradigm: Functional programming -- pure-vs-effect file-naming convention.

## 1. Pure / Effect classification

A module is **pure** when it satisfies all of:
- No imports from `node:fs`, `node:fs/promises`, `node:child_process`, `node:http`, `node:https`, or any module whose API performs I/O.
- No call to global `fetch`, `process.env` reads beyond constant-time configuration injection (constants passed as args), `Date.now()`, `Math.random()`, or anything time/IO-dependent.
- No top-level side effect (no `writeFileSync` at import time, no console.log other than as the final step of a CLI entry).
- Inputs determine outputs (referential transparency).

Naming convention: `*.pure.mjs` for pure, `*.effect.mjs` for I/O-bearing modules. Existing scripts (`patch-firefox-manifest.mjs`, `strip-chrome-only-permissions.mjs`) are pure today; they would be renamed to `*.pure.mjs` only if churn cost is justified -- not required by this feature. New modules adopt the convention.

Enforcement (added by DEVOPS in a CI step):
```sh
git ls-files 'scripts/*.pure.mjs' | xargs grep -lE \
  "^import .* from 'node:(fs|child_process|http|https|fs/promises)'|^import .* from 'fs'|fetch\(" \
  && exit 1 || exit 0
```
This is the FP-equivalent of ArchUnit / import-linter / dependency-cruiser. ADR-009.

## 2. Module-by-module boundary

### 2.1 `scripts/decisions.pure.mjs` (PURE)

**Responsibility**: All decision logic that does not require I/O.

Exports:

```js
/**
 * @param {string} raw - workflow input (e.g., "both", "cws", "amo-listed", "cws,amo-listed")
 * @returns {readonly PublishTarget[]}
 * @throws {InvalidInputError}
 */
export const parseTargets = (raw) => /* pure */;

/**
 * @param {{ dryRun: boolean, cwsPublish: string }} input
 * @returns {PublishMode}
 */
export const parseMode = (input) => /* pure */;

/**
 * @param {string} requestedVersion
 * @param {Set<string>} existingVersions
 * @returns {VersionState}  // 'available' | 'already-published' | 'partial-upload'
 */
export const classifyVersionState = (requestedVersion, existingVersions, optionalDraftVersion) => /* pure */;

/**
 * Plans the run order: which targets, what mode for each, in what order/parallel.
 * @param {readonly PublishTarget[]} targets
 * @param {PublishMode} mode
 * @returns {readonly PublishStep[]}
 */
export const planRun = (targets, mode) => /* pure */;

/**
 * @param {readonly PublishOutcome[]} outcomes
 * @returns {AggregateResult}
 */
export const aggregateOutcomes = (outcomes) => /* pure */;

/**
 * @param {AggregateResult} result
 * @returns {string}  // Markdown
 */
export const renderSummary = (result) => /* pure */;
```

Forbidden imports: `node:fs`, `node:child_process`, `fetch`, `process.env`.
Allowed imports: other `*.pure.mjs` modules, standard library data structures only.

Tests: `tests/unit/decisions.test.ts` -- pure unit tests, no mocks needed. Mutation testing target >= 80% on this file is the easiest win.

### 2.2 `scripts/manifest.pure.mjs` (PURE) -- existing

`patch-firefox-manifest.mjs` is already pure. Reused unchanged. (Optional rename to `.pure.mjs` post-DELIVER for consistency; not blocking.)

### 2.3 `scripts/cws-adapter.effect.mjs` (EFFECT)

**Responsibility**: All Chrome Web Store API I/O. Implements driven ports defined in `architecture-design.md` section 6.

Exports:
```js
export const exchangeCwsRefreshToken = async (creds) => { /* fetch oauth2.googleapis.com */ };
export const probeCwsItemState       = async (creds, itemId) => { /* GET items/{id} */ };
export const uploadCwsItem           = async (creds, itemId, zipPath) => { /* PUT items/{id} */ };
export const publishCwsItem          = async (creds, itemId, target) => { /* POST items/{id}/publish */ };
```

Boundary contract:
- Each function returns a `Result`-shaped object: `{ ok: true, value }` or `{ ok: false, error: { code, message, retryable } }`. No throws for known API error codes.
- Throws are reserved for unrecoverable bugs (programmer errors). Orchestrator's outer catch turns those into `PublishOutcome.status='failure'`.
- All HTTP errors classified into known codes: `version_conflict`, `auth_expired`, `rate_limited`, `payload_too_large`, `unknown_http`.
- Reads no `process.env` directly -- credentials are passed in.
- Writes nothing to disk.

Allowed imports: `node:fs/promises` (for reading the zip into a stream for upload), `fetch`, `decisions.pure.mjs`, no other adapters.

Tests:
- Unit tests stub `fetch` (via `vi.stubGlobal` or msw); verify request shapes and response classification.
- Contract tests via Pact-JS replay golden CWS responses.

### 2.4 `scripts/amo-listed-adapter.effect.mjs` (EFFECT)

**Responsibility**: All AMO listed-channel I/O. Calls native `fetch` for the version probe; shells out to `web-ext sign --channel listed` for the actual submission.

Exports:
```js
export const probeAmoListedVersions = async (jwtCreds, addonGuid) => { /* GET versions; filter listed */ };
export const submitAmoListed         = async (jwtCreds, xpiPath, version) => { /* spawn web-ext sign */ };
```

Boundary contract: same `Result` shape as CWS adapter. Classifies `web-ext` stdout/stderr for "Version X already exists" -> `version_conflict`.

JWT signing: imports from `amo-jwt.pure.mjs` (small new pure module extracted from the existing JWT inline code in `find-next-amo-version.mjs`).

Allowed imports: `node:child_process` (for `web-ext` spawn), `fetch`, `amo-jwt.pure.mjs`, `decisions.pure.mjs`.

### 2.5 `scripts/sign-firefox-xpi.mjs` (EXISTING, EFFECT) -- UNCHANGED

The local-sideload unlisted signing path. Continues to work exactly as today. Its existence is a guardrail tested by US-2 AC-2-3 and AC-2-7.

This adapter is NOT called by the new orchestrator. The new feature does not modify it.

### 2.6 `scripts/find-next-amo-version.mjs` (EXISTING, EFFECT) -- UNCHANGED

Used by `sign-firefox-xpi.mjs` for unlisted auto-bump. NOT called from listed publish (FR-5, AC-2-1). The new orchestrator must NOT invoke this for listed targets.

### 2.7 `scripts/amo-jwt.pure.mjs` (NEW, PURE)

20-line extraction of the JWT generation function from `find-next-amo-version.mjs`. Pure (uses `crypto` which is deterministic given inputs; randomness via `randomBytes` is the one impurity -- but since `crypto.randomBytes` is the only valid way to get a `jti`, we treat this module as pure for the project's purposes; document this exception).

Alternative if strict purity is required: pass a `jti` provider as a function argument; tests inject a deterministic provider. Recommended for future, not blocking for v1.

### 2.8 `scripts/fs-adapter.effect.mjs` (NEW, EFFECT)

Thin wrappers around `readFile`, `writeFile`, `appendFile`, `existsSync`. Purpose: a single seam for tests to stub filesystem effects without monkey-patching `node:fs`.

Exports:
```js
export const readManifestVersion = async (manifestPath) => /* readFile + parse */;
export const writeStepSummary    = async (markdown) => /* appendFile to $GITHUB_STEP_SUMMARY */;
export const fileExists          = async (path) => /* existsSync */;
```

### 2.9 `scripts/publish-orchestrator.effect.mjs` (NEW, EFFECT)

**Responsibility**: Composition root for the publish flow. Reads env, calls pure parsers, dispatches to adapters in parallel, aggregates outcomes, writes summary.

Pseudo-shape:
```js
import { parseTargets, parseMode, planRun, aggregateOutcomes, renderSummary } from './decisions.pure.mjs';
import * as cws from './cws-adapter.effect.mjs';
import * as amo from './amo-listed-adapter.effect.mjs';
import { readManifestVersion, writeStepSummary } from './fs-adapter.effect.mjs';

const main = async (env) => {
  const targets = parseTargets(env.TARGETS);
  const mode    = parseMode({ dryRun: env.DRY_RUN === 'true', cwsPublish: env.CWS_PUBLISH });
  const version = await readManifestVersion(env.MANIFEST_PATH);
  const steps   = planRun(targets, mode);

  const outcomes = await Promise.all(steps.map(step => runStep(step, version, env)));
  const result   = aggregateOutcomes(outcomes);
  await writeStepSummary(renderSummary(result));
  process.exit(result.exitCode);
};
```

This is the only module that imports both pure decisions AND concrete adapters. Dependency direction: orchestrator -> { pure, adapters }. Pure -> nothing. Adapters -> pure (read-only). No cycles.

### 2.10 `scripts/cws-bootstrap.mjs` (NEW, EFFECT, LOCAL-ONLY)

Local one-time CLI. Spins localhost HTTP server, opens browser, exchanges code for refresh token, prints to stdout. Never invoked from CI. Never writes to disk (AC-1-2).

### 2.11 `.github/workflows/release.yml` (EXISTING, EXTEND)

Two jobs after extension:
1. `build` (existing logic, lightly refactored to upload artifacts via `actions/upload-artifact` so the publish job can `download-artifact` rather than rebuild). UNCHANGED behavior on tag push (still creates GitHub release with both artifacts). The unlisted-signing step continues to use existing `find-next-amo-version.mjs` + `web-ext sign --channel unlisted`.
2. `publish` (new): `needs: build`, `if: github.event_name == 'workflow_dispatch'`, `environment: marketplace-prod`. Downloads artifacts, invokes orchestrator with workflow inputs.

## 3. Dependency direction (compliance check)

```
release.yml
   |
   v
publish-orchestrator.effect.mjs  ----+
   |                                  |
   +--> decisions.pure.mjs            |  (orchestrator depends on adapters)
   +--> cws-adapter.effect.mjs        |
   |       |                          |
   |       +--> decisions.pure.mjs    |
   +--> amo-listed-adapter.effect.mjs |
   |       |                          |
   |       +--> amo-jwt.pure.mjs      |
   |       +--> decisions.pure.mjs    |
   +--> fs-adapter.effect.mjs

decisions.pure.mjs   --> nothing   (pure leaf)
manifest.pure.mjs    --> nothing   (pure leaf, existing)
amo-jwt.pure.mjs     --> nothing   (pure leaf, except crypto.randomBytes)
```

Dependencies point inward toward pure modules. No pure module imports an effect module. Cycle-free. This satisfies the dependency-inversion principle in functional form.

## 4. Test-double seams

| Seam | Production adapter | Test double |
|---|---|---|
| `cws-adapter.effect.mjs` | real fetch | `vi.stubGlobal('fetch', mockFetch)` returning fixtures |
| `amo-listed-adapter.effect.mjs` (probe) | real fetch | same fetch stub |
| `amo-listed-adapter.effect.mjs` (sign) | spawn `web-ext` | `vi.spyOn(child_process, 'spawn')` returning canned stdout/stderr |
| `fs-adapter.effect.mjs` | real fs | in-memory map keyed by path |

The orchestrator imports adapters as namespace imports (`import * as cws from './cws-adapter.effect.mjs'`) so tests can monkey-patch the namespace if needed; preferred pattern is dependency injection: orchestrator's `main` accepts an optional `{ cwsAdapter, amoAdapter, fs }` second arg defaulting to the real modules. Tests construct the orchestrator with stubs.

## 5. Mutation testing scope

Per-feature kill rate >= 80% target applies to:
- `decisions.pure.mjs` (high-leverage, easiest)
- `amo-jwt.pure.mjs` (small surface)
- Adapters: 80% on classification logic only (network code excluded as effect; verified by contract tests not mutation tests)

Stryker config (DEVOPS adds): mutate `scripts/*.pure.mjs` and the classification helpers in `*.effect.mjs`; exclude `node_modules`, `tests`, raw HTTP-call lines.

## 6. Architecture rule summary (enforceable)

1. `*.pure.mjs` MUST NOT import `node:fs`, `node:child_process`, `node:http`, `node:https`, `fs/promises`, or call `fetch`. Enforced by grep CI step.
2. No new module shall be added to `scripts/` without a `.pure.mjs` or `.effect.mjs` suffix (reviewed manually in PR; could be enforced by a glob check).
3. `find-next-amo-version.mjs` MUST NOT be invoked from any code path serving the listed channel. Enforced by code review + a unit test that mocks the orchestrator's adapter selection and asserts the unlisted probe is not called when target = `amo-listed`.
4. Source `manifest.json` and `package.json` MUST NOT be written by any CI script (preserves existing FR-5 + memory-rule guardrail). Enforced by a CI step diff check after the publish job: `git diff --exit-code -- src/manifest.json package.json`.
