# Upstream Changes (back-propagation to design / discuss waves)

This document captures changes the DEVOPS wave is requesting from upstream waves (DESIGN, DISCUSS) because they constitute real design contradictions or implementation drift, not just clarifications.

## UC-1: Manifest permissions exceed KPI cap (HIGH) — RESOLVED 2026-04-27 (cap raised to <= 4)

### Status update (2026-04-27)
DELIVER discovered that the design's original claim "`chrome.downloads.download()` works without the `downloads` permission when the source is a `blob:` URL" was **incorrect**. Per Chrome MV3 docs, `chrome.downloads.download()` requires the `downloads` permission for every URL type; the "no permission" path applies only to `<a download>` element clicks (a different code path). User chose option (b) per /nw-deliver session 2026-04-27: keep `downloads` and bump the KPI cap from `<= 3` to `<= 4` rather than refactor the download mechanism. The authoritative permission list is now `["tabCapture", "offscreen", "storage", "downloads"]` (4 of 4 against the new cap). The text below preserves the original contradiction analysis for historical context.

### Quoted contradiction (historical)

**KPI** (`docs/feature/browser-tab-recorder/discuss/outcome-kpis.md`, Trust Outcomes — original target before correction):
> "Permissions requested | <= 3 | Number of permissions in manifest"

**Design** (`docs/feature/browser-tab-recorder/design/technology-stack.md`, Permissions section):
> ```json
> { "permissions": ["tabCapture", "offscreen"], "optional_permissions": [], "host_permissions": [] }
> ```
> "No `downloads` permission needed — `chrome.downloads.download()` works without it when downloading blob URLs"

**Implementation** (`src/manifest.json`):
> ```json
> "permissions": ["activeTab", "tabs", "tabCapture", "offscreen", "downloads", "storage"]
> ```
> **6 permissions** — twice the KPI cap, and a 3x divergence from the design's stated 2-permission target.

### Why this matters

- **KPI gate violation**: the permission-count CI gate this wave introduces will fail until reduced.
- **Trust contract violation**: each extra permission widens the privacy surface the user is asked to trust. The KPI exists because permission count is a leading indicator of perceived (and actual) intrusiveness.
- **CWS reviewer concern**: each permission requires justification at submission. Six justifications increase the chance of review friction.

### Recommended action (for software-crafter / architect)

1. **Audit each permission** against actual call sites in `src/background.ts`, `src/popup.ts`, and `src/offscreen.ts`:

   | Permission | Likely status | Action |
   |------------|---------------|--------|
   | `tabCapture` | REQUIRED | Keep |
   | `offscreen`  | REQUIRED | Keep |
   | `storage`    | REQUIRED (used by current implementation; also load-bearing for the logger and `lastRecording` health surface designed in this wave) | Keep — update design to acknowledge as 3rd permission |
   | `downloads`  | LIKELY REMOVABLE per design's explicit note | Remove and verify download still works with blob URL |
   | `activeTab`  | REVIEW — `chrome.tabCapture.getMediaStreamId({targetTabId})` may obviate it | Remove if unused after audit |
   | `tabs`       | REVIEW — only needed if extension reads tab metadata (URL/title), which it should not (privacy) | Remove if unused after audit |

2. **Target end state**: `permissions: ["tabCapture", "offscreen", "storage"]` — exactly 3, satisfying the KPI cap.

3. **Update the design document** (`technology-stack.md`) to list `storage` as the 3rd required permission with rationale: "Used for transient recording state across service-worker eviction, in-extension health surface (`lastRecording`), and opt-in local logging."

4. **CI gate behavior in the interim**: the permission-count gate WILL be added to the CI pipeline in this wave's deliverable. It will fail on the first run against the current manifest. This failure is intentional — it surfaces UC-1 as a build-breaking event so it cannot be ignored.

### Severity

**HIGH** — actively violates a user-facing trust KPI and a documented design intent. Should be addressed before the next CWS submission.

---

## UC-2: Storage permission load-bearing for observability (MEDIUM)

### Quoted contradiction

**Design** (`docs/feature/browser-tab-recorder/design/technology-stack.md`, Permissions):
> Lists only `tabCapture` and `offscreen` as required permissions. Does not mention `storage`.

**This wave's design** (`observability-design.md`, `monitoring-alerting.md`):
> Logger writes to `chrome.storage.local`; `lastRecording` health surface persists to `chrome.storage.local`. Both require the `storage` permission.

### Why this matters

The design's permission list is incomplete — `storage` is needed for any persisted state across service-worker eviction (which MV3 does aggressively), and is now also load-bearing for the observability and monitoring designs delivered by this wave. The current implementation already declares `storage`, so no immediate ship blocker — but the design document is misleading.

### Recommended action

Update `technology-stack.md` Permissions section to:
```json
{
  "permissions": ["tabCapture", "offscreen", "storage"],
  "optional_permissions": [],
  "host_permissions": []
}
```
With rationale: "`storage` is required for (a) recording-state persistence across MV3 service-worker eviction, (b) the in-extension health surface (`lastRecording`), and (c) the opt-in local logger ring buffer. All `chrome.storage.local`; never transmitted."

### Severity

**MEDIUM** — documentation-only fix; satisfied by completing UC-1.

---

## UC-3: Firefox runtime support — narrowing of stretch goal (LOW)

### Quoted

**Design** (`docs/feature/browser-tab-recorder/design/technology-stack.md`, Browser Compatibility):
> "Firefox | Partial/TBD | `browser.tabCapture` exists but `offscreen` API does not. Would need alternative architecture (background page). Stretch goal."

### What this wave decided

Firefox in CI is **build + typecheck + unit tests only**. Runtime support is deferred. The CI Firefox leg's purpose is **early API drift detection** (catch a `chrome.offscreen` reference creeping into a code path that should be Firefox-safe), not runtime validation.

### Severity

**LOW** — this is an explicit clarification of an already-acknowledged stretch goal, not a contradiction. No design document change required; recorded here so the architect knows the CI matrix scope was deliberately narrowed.

---

## Summary for the orchestrator / architect

| ID | Severity | Action owner | Action |
|----|----------|--------------|--------|
| UC-1 | HIGH (RESOLVED 2026-04-27) | software-crafter (with architect review) | Audit and reduce manifest to <= 4 permissions (`tabCapture`, `offscreen`, `storage`, `downloads`); CI gate enforces. Cap raised from 3 to 4 because the design's blob-URL exception was incorrect. |
| UC-2 | MEDIUM | architect | Update `technology-stack.md` to include `storage` as the 3rd permission |
| UC-3 | LOW | (informational) | None; noted for architect awareness |
