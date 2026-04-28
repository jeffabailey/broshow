# Platform Architecture: BroShow (browser-tab-recorder)

## Scope and Reality Check

BroShow is a **Chromium browser extension (Manifest V3)**. There is no server, no cluster, no cloud. The "delivery platform" is:

1. A laptop with `node`, `npm`, and a `git push`.
2. GitHub (source of truth + CI runner).
3. A `.zip` artifact built by CI.
4. The Chrome Web Store (and, optionally later, the Edge Add-ons store and AMO for Firefox).
5. The user's browser (the actual runtime "production").

Because of this, the standard "platform engineer" toolbox (Kubernetes, Terraform, service mesh, autoscaling, blue-green) does not apply. What *does* apply is build reproducibility, packaging integrity, store submission hygiene, and the zero-network privacy contract.

## Platform Constraint Impact Analysis

| Constraint | Source | % Delivery Affected | Priority |
|------------|--------|---------------------|----------|
| Zero outbound network requests at runtime | `outcome-kpis.md` (Trust) | 100% | HIGH |
| Permissions <= 4 in manifest | `outcome-kpis.md` (Trust) | 100% | HIGH (currently failing — see upstream-changes.md) |
| Bundled extension < 500KB excl. mp4 muxer | `outcome-kpis.md` (Trust) | 100% | HIGH |
| Solo developer, trunk-based | User decision | 100% | MEDIUM (lightweight gates) |
| MV3 service worker cannot host MediaRecorder | `architecture-design.md` | 100% | HIGH (drives offscreen-doc requirement) |
| Firefox lacks `chrome.offscreen` | `technology-stack.md` | ~33% (1 of 3 browsers) | MEDIUM (deferred, build-only in CI) |

### Constraint-Free Baseline
- Maximum theoretical deployment frequency: as fast as `web-ext build` runs locally + manual CWS upload (~minutes for build, ~hours-to-days for CWS review).
- Components that can proceed without constraints: Chrome + Edge full pipeline (~67% of browser matrix).
- Quick wins available now: GitHub Actions build/test matrix, size-budget assertion, network-request assertion in Playwright.

## Delivery Chain

```
┌──────────────┐    git push    ┌──────────────────┐
│  Developer   │ ─────────────▶ │     GitHub       │
│  (local)     │                │  - source repo   │
│  - hooks     │                │  - Actions CI    │
└──────────────┘                │  - Releases (opt)│
                                └────────┬─────────┘
                                         │ artifact:
                                         │ broshow-vX.Y.Z.zip
                                         ▼
                                 ┌────────────────┐
                                 │ Manual upload  │
                                 │ to Chrome Web  │
                                 │     Store      │
                                 └────────┬───────┘
                                          │ (CWS reviews ~hours-days)
                                          ▼
                                  ┌──────────────┐
                                  │ End user's   │
                                  │  browser     │
                                  │ (production) │
                                  └──────────────┘
```

## Platform Components

### 1. Local development environment
- Node.js >= 20.x (matches `target: chrome120` in esbuild)
- npm
- Git
- Optional: pre-commit / pre-push hook (lefthook or husky) — see `ci-cd-pipeline.md`

### 2. Source control: GitHub
- Branch: `main` (only long-lived branch — trunk-based)
- Short-lived feature branches < 1 day
- Lightweight branch protection (see `branching-strategy.md`)

### 3. CI: GitHub Actions
- Runs on `push: main` and `pull_request: main`
- Matrix across Chrome / Edge / Firefox (Firefox build-only)
- Produces `dist/` and packaged `broshow-{version}.zip`
- Mutation testing job triggered per-feature

### 4. Packaging: `web-ext`
- Already a dev-dependency in `package.json`
- `web-ext build --source-dir dist/ --artifacts-dir artifacts/` produces store-ready `.zip`

### 5. Distribution: Chrome Web Store (manual today)
- Developer uploads `.zip` via CWS Developer Dashboard
- Future extension point (a single CI job): GitHub Release on tag → manual CWS publish workflow that surfaces the artifact for the developer to download and upload. CWS API publish credentials are NOT wired (deferred).

### 6. Runtime "production": user's browser
- Observability is local-only (see `observability-design.md`)
- "Monitoring" is store-review feedback + user reports (see `monitoring-alerting.md`)

## What is intentionally NOT here

| Concept | Why not |
|---------|---------|
| Kubernetes / containers | No server-side runtime |
| Terraform / IaC | No cloud resources to provision |
| Blue-green / canary | No fleet to shift traffic across; rollout is per-user-update via CWS |
| Service mesh / sidecars | Single browser process |
| Remote telemetry (Sentry, Datadog, PostHog, GA) | Violates `Network requests made: 0` KPI |
| Feature flag SaaS (LaunchDarkly, Flagsmith) | Same — would phone home |
| HPA / autoscaling | One extension instance per browser |
| Multi-region | N/A |
| Database migrations | No DB; only `chrome.storage.local` per-user |

## Rollback model

For a browser extension, "rollback" means:

1. **Pre-publish rollback**: revert the offending commit on `main`, rebuild, re-upload to CWS. Cheap (minutes of dev time + hours of CWS re-review).
2. **Post-publish rollback**: upload the *prior* `.zip` (kept as a GitHub Release artifact — that is the point of the future "GitHub Release on tag" job) back to CWS. CWS auto-updates users on next browser update cycle (within ~24h for most users).
3. **There is no instant rollback.** This is acceptable because:
   - There is no shared state to corrupt.
   - The blast radius is per-user, not site-wide.
   - The CWS review process itself acts as a safety gate.

## Rejected Simple Alternatives

### Alternative 1: No CI at all, just local `npm run build` and manual upload
- **What**: Developer builds locally, zips, uploads. No GitHub Actions.
- **Expected Impact**: Meets ~50% of requirements (it ships).
- **Why Insufficient**: No mechanism to assert the zero-network KPI, the size budget, or the permission count automatically. Solo developer drift is the most common cause of KPI regression. CI is the cheapest forcing function.

### Alternative 2: GitHub Actions on Chrome only, skip Edge and Firefox
- **What**: Build and test only Chrome. Defer Edge/Firefox entirely.
- **Expected Impact**: Meets ~70% of requirements (Chrome-first).
- **Why Insufficient**: Edge is ~free (Chromium-equivalent APIs) — no reason to skip. Firefox build-only is also nearly free and catches API drift before it becomes a structural problem. Skipping leaves cross-browser concerns to be discovered at user-report time, which violates the "build quality in" principle.

### Alternative 3: Use ffmpeg.wasm (already considered in design)
- Not relevant to platform; noted for completeness — would balloon bundle past the 500KB budget, making the size gate impossible.

## Deliverables this platform produces

| Artifact | Producer | Consumer |
|----------|----------|----------|
| `dist/` (unpacked extension) | `npm run build` | local `web-ext run`, packaging step |
| `artifacts/broshow-{version}.zip` | `web-ext build` in CI | CWS upload (manual), GitHub Release (future) |
| Test reports (vitest, playwright) | CI | Developer review |
| Mutation report (Stryker) | CI per-feature job | Developer review |
| Size-budget report | CI | Developer review, KPI gate |
| Network-request assertion result | Playwright | Developer review, KPI gate |
