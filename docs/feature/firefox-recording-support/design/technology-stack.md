# Technology Stack: firefox-recording-support

> Wave: DESIGN
> Sibling: `architecture-design.md`, `component-boundaries.md`
> Scope: Firefox-specific additions and parity confirmations only. The parent
> feature's stack (TypeScript, esbuild, vitest, playwright, mp4-mux) carries
> over unchanged.

## 1. Stack inheritance from parent feature

Inherited and unchanged by this feature:

| Item | Version constraint | License | Source |
|---|---|---|---|
| TypeScript | (project current) | Apache-2.0 | parent build |
| esbuild | (project current) | MIT | parent build |
| vitest | (project current) | MIT | parent test |
| playwright | (project current) | Apache-2.0 | parent test |
| mp4-muxer / mp4-mux | (project current) | MIT | ADR-002 |
| Manifest V3 | n/a | n/a | ADR-001, `scripts/patch-firefox-manifest.mjs` |

Re-justified in the Firefox context:

- **mp4-mux (ADR-002)**: confirmed to run inside the Firefox MV3 background
  event page (DOM, Blob, URL APIs all available there). No alternative
  evaluated; the ADR-002 alternative analysis (ffmpeg.wasm, raw WebM)
  remains valid on Firefox.

## 2. Firefox-specific runtime APIs

These are **browser-provided**, not dependencies (no install, no license,
no bundle cost). Documented for completeness.

### 2.1 `navigator.mediaDevices.getDisplayMedia`

- Standard: W3C Screen Capture
  (https://w3c.github.io/mediacapture-screen-share/).
- Firefox support: 66+ (the API); usable in MV3 extensions on Firefox 121+
  (the version we target via `strict_min_version`).
- Invocation context: must run inside a window-like context with a user
  gesture in flight. The MV3 background event page qualifies in Firefox
  when the gesture chain originates in the popup's click and is forwarded
  via `chrome.runtime.sendMessage`.
- Inputs we use: `{ video: true, audio: true }`.
- Outputs we consume: a `MediaStream` with 1 video track and 0..1 audio
  tracks (audio depends on user choice in the picker).
- Failure modes we handle:
  - `NotAllowedError` -> user cancelled the picker. Treated as no-op
    (FR-FF-05).
  - Any other error -> surfaced as "Firefox could not start the capture..."
    in the popup (per US-FF-02 retry copy).

### 2.2 `MediaRecorder` mime-type matrix on Firefox

The recorder requests an mp4-friendly codec where possible; falls back to
WebM otherwise. On Firefox the support matrix is more limited than on
Chromium and is the reason the existing WebM-fallback path matters.

| MIME requested | Chromium 121+ | Firefox 121 ESR | Firefox 124+ | Decision |
|---|---|---|---|---|
| `video/mp4;codecs=avc1,mp4a` | Supported (via mp4-muxer post-process; MediaRecorder itself emits WebM) | Not natively emitted | Not natively emitted | **Out of MediaRecorder's mouth: WebM. mp4-mux remuxes to mp4.** Same as Chrome. |
| `video/webm;codecs=vp8,opus` | Supported | Supported | Supported | **Recorder mime-type baseline on both targets.** |
| `video/webm;codecs=vp9,opus` | Supported | Best-effort (build-dependent) | Supported | Optional; recorder probes `MediaRecorder.isTypeSupported` and prefers VP9 if present. |

Implication: the Firefox host's MediaRecorder configuration is **identical**
to Chrome's. The remux step (mp4-mux) operates on the WebM bytes
identically. There is no Firefox-specific codec branch in the pure logic.

### 2.3 `chrome.downloads` / `browser.downloads`

- Same surface (`downloads.download({ url, filename })`) on both browsers.
- `webextension-polyfill` (see 3.1) bridges naming so adapter code reads
  `chrome.downloads` identically across targets.
- Constraint: data URLs are accepted by both. The adapter MAY swap to
  `URL.createObjectURL(blob)` if a future build observes a size limit
  rejection on Firefox; this is an internal adapter change, not a stack
  change.

## 3. New dependencies (proposed, evaluated)

### 3.1 `webextension-polyfill` -- Mozilla, BSD-2-Clause

- Repo: https://github.com/mozilla/webextension-polyfill
- License: **BSD-2-Clause** (preferred per OSS hierarchy in the architect's
  policy).
- Maintenance: Maintained by Mozilla. Releases continue; >3000 GitHub stars;
  used by hundreds of cross-browser MV3 extensions.
- Bundle cost: small (~6KB minified).
- Purpose: gives the adapter layer a single `chrome.*` namespace that works
  on both Chromium and Firefox. Without it, the adapter must split between
  `chrome.*` and `browser.*` APIs (Firefox returns Promises directly;
  Chrome MV3 also returns Promises, so the polyfill is mostly a naming
  shim today).

**Decision: ADD as an optional dependency, with a fallback escape hatch.**
The adapter detects `globalThis.chrome ?? globalThis.browser` and uses
whichever exists. The polyfill is bundled only if integration testing on
Firefox 121 ESR shows a real Promise-shape mismatch. If Firefox 121+ is
already promise-native everywhere we touch (downloads, runtime, storage),
**the polyfill is not added** and we save the 6KB.

Alternatives considered:

- **No polyfill, hand-rolled namespace bridge** (selected if 121 ESR is
  promise-clean). Pros: zero new dep, smaller bundle. Cons: ~30 lines of
  glue code we own.
- **`webextension-polyfill-ts`**: Outdated; superseded by upstream's own
  TypeScript types. Rejected.

### 3.2 (Negative) -- not added

- **No new permissions in `src/manifest.json`.** NFR-FF-01.
- **No `tabs` permission**, **no `<all_urls>`**, **no host permissions**.
  `getDisplayMedia` does not require any of these.
- **No background-message broker library.** `chrome.runtime.sendMessage` is
  sufficient.
- **No state library.** The state machine is 3 states; pure functions
  suffice.
- **No telemetry / analytics SDK.** NFR-FF-03 (no outbound network).

## 4. Build-pipeline additions

`scripts/patch-firefox-manifest.mjs` already wires `background.scripts` for
Firefox MV3. The patcher remains the single source of truth for target
divergence at build time. No new patcher steps are required for this
feature -- the `tabCapture` and `offscreen` permissions remain declared
(Firefox treats them as warnings; this is acceptable per NFR-FF-01).

The build emits two artifacts (Chrome zip, Firefox xpi) from a single
source tree. No second tsconfig, no second esbuild config -- the path
selection is **runtime** (per DQ-2), not build-time.

## 5. Architecture-rule enforcement tooling

Recommended (handoff to platform-architect for CI integration):

| Tool | License | Purpose | Notes |
|---|---|---|---|
| dependency-cruiser | MIT | Forbid `chrome.*` / `browser.*` imports inside `*-logic.ts`; forbid host adapters from importing each other | JS/TS-native; runs in CI; works with esbuild output unchanged |

Considered alternatives:

- **eslint-plugin-import + custom rule** -- Pros: already in many JS
  projects. Cons: weaker graph analysis than dependency-cruiser; hand-rolled
  rule maintenance burden.
- **ts-arch / arch-unit-ts** -- Active but smaller community; not chosen
  unless the project already uses it.

## 6. Test-stack confirmations

No additions. The existing vitest + playwright stack covers:

- Pure logic (vitest, target-agnostic).
- End-to-end on Chromium (playwright with the Chrome channel; existing).
- End-to-end on Firefox (playwright firefox project; configured by parent
  feature).

If Playwright's Firefox driver does not honor the surface picker the same
way headed Firefox does, the AC-FF-03 5-minute scenario can be exercised
manually on a real Firefox build per the smoke matrix in `outcome-kpis.md`
-- this is acceptance-designer's call in DISTILL, not a stack decision.

## 7. License posture

| Component | License | OSS-policy class | Notes |
|---|---|---|---|
| TypeScript | Apache-2.0 | Tier-1 | inherited |
| mp4-mux | MIT | Tier-1 | inherited; ADR-002 |
| webextension-polyfill (if used) | BSD-2-Clause | Tier-1 | optional |
| dependency-cruiser | MIT | Tier-1 | dev-only |

No proprietary, no copyleft, no AGPL -- consistent with the project's OSS
posture.

## 8. Bundle-size guardrail

`outcome-kpis.md` requires `extension_size < 500KB excluding mp4-mux`. This
feature's worst-case additions:

- ~30 lines of new TS in `background.ts` for the Firefox host adapter.
- ~30 lines of new TS in `popup-logic.ts` for the discriminated capability
  result.
- 0..6KB if webextension-polyfill is bundled (decision deferred per 3.1).

Estimated impact: **<= 10KB** including polyfill. Guardrail respected.
