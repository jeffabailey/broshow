# Walking Skeleton: Marketplace Publishing

Feature ID: `marketplace-publishing`
Wave: DISTILL
Date: 2026-04-30

## Strategy declaration

**Strategy B — Real local resources + fake costly externals.**

This strategy is binding for the walking skeleton scenarios in `walking-skeleton.test.mjs`.

## In / Out lists

### In (real resources used by the WS)

| Resource | Real implementation | Why real |
|---|---|---|
| Filesystem (read manifest, write xpi/zip, append step summary) | `node:fs/promises`, `os.tmpdir()` per scenario | Cheap, deterministic, fast. Catches path/permission bugs that an InMemory FS would miss. |
| HMAC-SHA256 JWT signing (AMO auth) | `node:crypto.createHmac` (pure compute) | Pure compute, no I/O cost. Mocking would test only the test. |
| Pure decision module (`decisions.pure.mjs`) | Real | No reason to fake; pure is the cheapest possible adapter. |
| Orchestrator wiring (`publish-orchestrator.effect.mjs`) | Real | Mandate 1 — driving port is invoked through the real orchestrator, not through internal components. |

### Out (faked by WS)

| Resource | Fake implementation | Why faked |
|---|---|---|
| Chrome Web Store API (OAuth + probe + upload + publish) | `fixtures/cws-fake.mjs` (vi.stubGlobal('fetch', ...)) | Real publishes are irreversible (uploads cannot be deleted). OAuth quota is small. |
| AMO API v5 (versions probe) | `fixtures/amo-fake.mjs` (fetch interceptor) | Real listed-channel probes count against 60-req/min quota; v0.2.17 incident shows real-world throttling. |
| `web-ext sign --channel listed` subprocess | `vi.spyOn(child_process, 'spawn')` returning canned stdout | Real invocation submits to the AMO listed reviewer queue; consumes an irrevocable version slot. |
| `web-ext sign --channel unlisted` subprocess | Not invoked by WS at all | Out of scope for this feature; the existing `sign-firefox-xpi.mjs` flow is verified by AC-2-3 / AC-2-7 via file presence, not deep behavior. |

## Environment-matrix tags

Per `devops/environments.yaml`, every scenario binds to exactly one named environment via `loadEnv(name)` in `fixtures/scenarios.mjs`:

| Tag | environments.yaml entry | Walking-skeleton coverage |
|---|---|---|
| `@env:clean` | `clean` (happy path: all creds valid, no prior versions) | WS-1, WS-2 |
| `@env:with-amo-throttle-active` | AMO 429 on probe | M4-FAILURE-1 |
| `@env:with-cws-rate-limit-active` | CWS 429 on upload | M4-FAILURE-2 |
| `@env:with-stale-cws-token-near-expiry` | invalid_grant from OAuth | M4-FAILURE-3 |

Two dedicated walking skeletons (WS-1 publish to both stores, WS-2 dry-run validates without writing) cover the `clean` environment so that the WS suite is demo-able to the maintainer in a single happy-path run plus a dry-run sanity check.

## Walking-skeleton scenarios (high level)

### WS-1: Maintainer publishes a release to both marketplaces

```
[walking-skeleton][real-io][env:clean] WS-1: Maintainer publishes v0.3.0 to Chrome Web Store and Firefox AMO listed

GIVEN Jeff has tagged v0.3.0 with manifest version "0.3.0"
  AND build artifacts (zip + xpi) exist on disk in a tmpdir
  AND CWS and AMO credentials are valid (fake servers ready)
  AND neither marketplace has version 0.3.0
WHEN  Jeff runs the publish orchestrator with TARGETS="cws,amo-listed", MODE="publish"
THEN  Jeff sees the orchestrator emit two success outcomes (one per target)
  AND a step summary file on disk lists both marketplaces with status "success" and version "0.3.0"
  AND the orchestrator exits 0
```

Mandate 1: invoked via `runPublish(env)` exported by `publish-orchestrator.effect.mjs` (driving port).
Mandate 2: zero technical jargon in the scenario title or assertions; "Jeff sees a step summary listing both marketplaces" is the observable user outcome.
Mandate 3: complete journey — Given (state), When (single action), Then (multiple observable outcomes).
Mandate 4: filesystem and crypto are real (`@real-io`); CWS/AMO are faked (`@in-memory`).

### WS-2: Maintainer validates the publish workflow without burning a version slot

```
[walking-skeleton][real-io][env:clean] WS-2: Maintainer dry-runs v0.3.0 against both marketplaces

GIVEN Jeff has tagged v0.3.0 with manifest version "0.3.0"
  AND build artifacts (zip + xpi) exist on disk
  AND CWS and AMO credentials are valid
WHEN  Jeff runs the publish orchestrator with TARGETS="cws,amo-listed", MODE="dry-run"
THEN  Jeff sees the orchestrator emit two "would-succeed" outcomes
  AND no upload, publish, or sign call hits any fake server
  AND the orchestrator exits 0
  AND the step summary on disk is prefixed "[DRY RUN]" and lists the would-be actions
```

This WS is the dry-run safety net: it proves the dry-run flag short-circuits all writes while still exercising the real filesystem and the real orchestrator wiring.

## Container preference

**No containers used.** The fake servers are in-process fetch interceptors; subprocess fakes are `vi.spyOn(child_process, 'spawn')`. Rationale:

- Single-maintainer FOSS project; introducing testcontainers/Docker would dwarf the feature's actual complexity.
- vitest's `vi.stubGlobal('fetch', ...)` and `child_process` mocking provide all the seam coverage we need.
- All test runs MUST be reproducible offline (no network access required), which fetch interception guarantees and a real container running an HTTP server does not (containers may pull images on first run).

## Demo recipe

```
npx vitest run tests/acceptance/marketplace-publishing/walking-skeleton.test.mjs
```

Pre-DELIVER (RED): two `it` blocks fail with `Error: Not yet implemented -- RED scaffold`.
Post-DELIVER (GREEN): two `it` blocks pass; demo to the maintainer = "the orchestrator publishes to both stores end-to-end with all the surrounding wiring (parsing, planning, dispatch, summary writing) running for real."

## Fixture-tier litmus test (Dim 9d compliance)

> "If I deleted the real adapter, would the WS still pass?"

| Adapter | Tier in WS | Litmus answer | Verdict |
|---|---|---|---|
| `fs-adapter.effect.mjs` | Real (tmp_path filesystem) | NO — WS reads real manifest, writes real summary file. | Pass |
| `amo-jwt.pure.mjs` | Real (`crypto.createHmac`) | NO — JWT is computed for real (no JWT, no AMO probe header). | Pass |
| `cws-adapter.effect.mjs` | Fake (fetch stub) | YES technically — but Dim 9 only flags this for **local resource** adapters. CWS is a remote API; fake-server is the right tier under Strategy B. | Pass (per Strategy B) |
| `amo-listed-adapter.effect.mjs` | Fake (fetch stub + spawn mock) | YES — same reasoning. | Pass (per Strategy B) |

Strategy-B compliance is documented as the trade-off; future contract tests (Pact-JS, per design ADR-005/006) cover real CWS/AMO drift detection.
