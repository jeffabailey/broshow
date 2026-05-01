# Data Models: Marketplace Publishing

Feature ID: `marketplace-publishing`
Wave: DESIGN
Paradigm: Functional -- algebraic types (sum types via string-literal unions; product types via plain objects). JSDoc `@typedef` is the type carrier; runtime is plain JS. Tests pin shapes by example.

## 1. Algebraic types (sum types)

### `PublishTarget`

Identifies a marketplace channel that the publish flow can address.

```js
/** @typedef {'cws' | 'amo-listed' | 'amo-unlisted'} PublishTarget */
```

Notes:
- `amo-unlisted` is included in the type so that the existing `sign-firefox-xpi.mjs` flow can be modeled in summaries; the publish orchestrator does NOT dispatch to `amo-unlisted` (handled by the existing tag-build job, NOT the new publish job).
- `parseTargets` (in `decisions.pure.mjs`) accepts the workflow input `'both' | 'cws' | 'amo-listed'` and expands `'both'` to `['cws', 'amo-listed']`.

### `PublishMode`

Drives every adapter's behavior.

```js
/** @typedef {'publish' | 'upload-only' | 'dry-run'} PublishMode */
```

Mapping from workflow inputs:
| `dry_run` input | `cws_publish` input | Resulting mode |
|---|---|---|
| `true` | (any) | `dry-run` |
| `false` | `default` | `publish` (CWS publishTarget=default) |
| `false` | `trustedTesters` | `publish` (CWS publishTarget=trustedTesters; treated identically by the type, distinguished by `CwsPublishTarget` below) |
| `false` | `upload-only` | `upload-only` |

For AMO listed, `upload-only` is meaningless (AMO listed does not separate upload from submission); when target is `amo-listed` and mode is `upload-only`, orchestrator coerces to `publish` and logs an explanatory note.

### `CwsPublishTarget`

CWS-specific; distinguishes the publish endpoint's `publishTarget` query param.

```js
/** @typedef {'default' | 'trustedTesters'} CwsPublishTarget */
```

### `OutcomeStatus`

```js
/** @typedef {'success' | 'failure' | 'skipped' | 'already-published' | 'would-succeed' | 'would-fail'} OutcomeStatus */
```

- `success` -- happy path, real submission accepted.
- `failure` -- real submission failed (auth, payload, transient).
- `skipped` -- target not in `targets` workflow input.
- `already-published` -- probe revealed marketplace already has this version; no submission attempted.
- `would-succeed` -- dry-run only: probe + validation passed; actual submit skipped.
- `would-fail` -- dry-run only: probe revealed a conflict OR credentials check failed.

### `VersionState` (probe classification)

```js
/** @typedef {'available' | 'partial-upload' | 'already-published'} VersionState */
```

- `available` -- marketplace has no record of this version on this channel.
- `partial-upload` -- CWS has this version uploaded as DRAFT but not yet published; re-running with mode=`publish` calls only the publish endpoint, not re-upload.
- `already-published` -- marketplace's listed/published version equals requested version.

### `CwsErrorCode` and `AmoErrorCode`

```js
/** @typedef {'version_conflict' | 'auth_expired' | 'rate_limited' | 'payload_too_large' | 'item_not_found' | 'unknown_http'} CwsErrorCode */
/** @typedef {'version_conflict' | 'auth_expired' | 'validation_failed' | 'unknown_http'} AmoErrorCode */
```

Adapter HTTP responses are classified into these codes by pure functions in `decisions.pure.mjs` (input: HTTP status + body excerpt; output: error code). Classification is unit-tested.

## 2. Product types

### `CwsCreds`

```js
/**
 * @typedef {Object} CwsCreds
 * @property {string} clientId
 * @property {string} clientSecret
 * @property {string} refreshToken
 * @property {string} extensionId
 */
```

Constructed by orchestrator from `process.env`. Passed by value to adapter functions; never mutated.

### `AmoJwtCreds`

```js
/**
 * @typedef {Object} AmoJwtCreds
 * @property {string} issuer
 * @property {string} secret
 */
```

### `Result<T, E>`

Adapter return shape. Used in lieu of throwing for known failure modes.

```js
/**
 * @template T, E
 * @typedef {{ ok: true, value: T } | { ok: false, error: E }} Result
 */
```

Example: `probeCwsItemState` returns `Result<CwsItemState, { code: CwsErrorCode, message: string }>`.

### `CwsItemState`

```js
/**
 * @typedef {Object} CwsItemState
 * @property {string} itemId
 * @property {'OK' | 'IN_PROGRESS' | 'FAILED'} uploadState  // CWS API field
 * @property {string|null} draftVersion   // version of the in-progress draft, if any
 * @property {string|null} publishedVersion // version currently live, if any
 */
```

The pure `classifyVersionState(requestedVersion, itemState)` consumes this and returns a `VersionState`.

### `PublishStep` (orchestrator's plan)

```js
/**
 * @typedef {Object} PublishStep
 * @property {PublishTarget} target
 * @property {PublishMode} mode
 * @property {CwsPublishTarget|null} cwsPublishTarget   // only set when target === 'cws'
 */
```

`planRun(targets, mode)` builds an array of these. Pure.

### `PublishOutcome` (per-step result)

The single value every adapter returns to the orchestrator.

```js
/**
 * @typedef {Object} PublishOutcome
 * @property {PublishTarget} target
 * @property {OutcomeStatus} status
 * @property {string} version           // the version that was (or would have been) submitted
 * @property {string} message           // human-readable outcome description
 * @property {string|null} dashboardUrl // link to the marketplace dashboard for this item, when applicable
 * @property {string|null} errorCode    // CwsErrorCode | AmoErrorCode | null
 * @property {number} durationSeconds   // for NFR-2 structured logging
 */
```

This shape is the contract surface across the pure/effect boundary in the orchestrator. AC-3-5 traces directly to this type's existence.

### `AggregateResult`

```js
/**
 * @typedef {Object} AggregateResult
 * @property {readonly PublishOutcome[]} outcomes
 * @property {0 | 1} exitCode
 * @property {string|null} recoveryHint   // copy-paste dispatch params when any outcome is failure
 * @property {boolean} memoryRulePreserved // always true; sentinel for AC-X-5 trace
 */
```

`aggregateOutcomes` (pure) computes `exitCode` and `recoveryHint`.

## 3. Workflow input model (GitHub Actions inputs)

| Input | Type | Default | Constraints |
|---|---|---|---|
| `tag` | string | (required) | Must match an existing GitHub release tag; orchestrator validates. |
| `targets` | choice | `both` | One of: `both`, `cws`, `amo-listed`. |
| `cws_publish` | choice | `default` | One of: `default`, `trustedTesters`, `upload-only`. |
| `dry_run` | boolean | `false` | Opt-in to dry-run mode. |

These are passed via env to `publish-orchestrator.effect.mjs` and parsed by `parseTargets` / `parseMode` (pure).

## 4. AC-to-driving-port traceability

Per the orchestrator brief: "each AC MUST name driving port for DISTILL". The driving port for ALL ACs in this feature is one of:
- **DP1: `runPublishWorkflow`** (the `publish-orchestrator.effect.mjs` main entry, invoked by GitHub Actions workflow_dispatch via release.yml)
- **DP2: `runDryRun`** (same orchestrator, mode=dry-run; conceptually same driving port; distinguished here to make AC-5-* traceability obvious)
- **DP3: `runBootstrap`** (the `cws-bootstrap.mjs` local CLI)
- **DP4: existing `release.yml` build job** (pre-existing; only invoked for ACs that test the unchanged tag-push path)
- **DP5: existing `sign-firefox-xpi.mjs`** (the sideload-test path; only AC-2-3 and AC-2-7 reference it)

Mapping (carries forward to DISTILL):

| AC | Driving Port |
|---|---|
| AC-1-1 | DP3 |
| AC-1-2 | DP3 |
| AC-1-3 | (documentation; no driving port -- compile-time check) |
| AC-1-4 | DP2 |
| AC-1-5 | DP3 |
| AC-1-6 | DP3 |
| AC-2-1 | DP1 |
| AC-2-2 | DP1 |
| AC-2-3 | DP5 |
| AC-2-4 | DP1 |
| AC-2-5 | DP1 (negative: orchestrator must not write source files) |
| AC-2-6 | DP1 |
| AC-2-7 | DP1 + DP5 (coexistence assertion) |
| AC-3-1 | DP4 (negative: tag push does NOT trigger publish) |
| AC-3-2 | DP1 |
| AC-3-3 | DP1 |
| AC-3-4 | DP1 |
| AC-3-5 | DP1 |
| AC-3-6 | DP1 |
| AC-3-7 | DP1 |
| AC-3-8 | DP1 |
| AC-3-9 | DP4 |
| AC-3-10 | DP1 |
| AC-4-1 | DP1 |
| AC-4-2 | DP1 |
| AC-4-3 | DP1 |
| AC-4-4 | DP1 |
| AC-4-5 | DP1 |
| AC-5-1 | DP2 |
| AC-5-2 | DP2 |
| AC-5-3 | DP2 |
| AC-5-4 | DP2 |
| AC-5-5 | DP2 |
| AC-5-6 | DP2 |
| AC-5-7 | DP2 |
| AC-X-1 | DP1 (log emission boundary) |
| AC-X-2 | (architecture rule; pure-vs-effect file-naming check) |
| AC-X-3 | (mutation testing CI gate) |
| AC-X-4 | DP1 |
| AC-X-5 | DP4 (negative path: tag push observed, no marketplace API call) |

This table is the input DISTILL needs to write driving-port-anchored acceptance tests.

## 5. Type instances (examples)

### Example: happy-path CWS outcome

```js
{
  target: 'cws',
  status: 'success',
  version: '0.3.0',
  message: 'Submitted for review (publishTarget=default)',
  dashboardUrl: 'https://chrome.google.com/webstore/detail/abcdefghijklmnopqrstuvwxyz123456',
  errorCode: null,
  durationSeconds: 12.4
}
```

### Example: AMO listed conflict

```js
{
  target: 'amo-listed',
  status: 'already-published',
  version: '0.3.0',
  message: 'Version 0.3.0 already on AMO listed channel.',
  dashboardUrl: 'https://addons.mozilla.org/en-US/firefox/addon/broshow',
  errorCode: 'version_conflict',
  durationSeconds: 1.7
}
```

### Example: dry-run pass

```js
{
  target: 'cws',
  status: 'would-succeed',
  version: '0.3.0',
  message: '[DRY RUN] would upload broshow-chrome-0.3.0.zip and call publish (publishTarget=default)',
  dashboardUrl: null,
  errorCode: null,
  durationSeconds: 0.9
}
```

### Example: aggregate result with recovery hint

```js
{
  outcomes: [
    /* success cws */,
    /* failure amo-listed: auth_expired */
  ],
  exitCode: 1,
  recoveryHint: 'Re-dispatch with: targets=amo-listed, cws_publish=default, dry_run=false. Regenerate AMO_JWT_SECRET first.',
  memoryRulePreserved: true
}
```
