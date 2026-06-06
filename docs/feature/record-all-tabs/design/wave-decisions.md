# DESIGN Wave Decisions: record-all-tabs (R1-cropped)

> Wave: DESIGN (Morgan / nw-solution-architect)
> Successors: DISTILL (acceptance-designer), DEVOPS (platform-architect)
> Companion docs: `architecture-design.md`, `component-boundaries.md`,
>   `data-models.md`, `technology-stack.md`; ADRs `docs/adrs/ADR-010..013`.

## Key decisions

| ID | Decision | ADR | Rationale (one line) |
|----|----------|-----|----------------------|
| **D-DESIGN-1** | Mechanism = window-surface `getDisplayMedia` + user-drawn canvas crop (R1-cropped). Supersedes tabCapture-follow framing of D1 (D1′). | ADR-010 | Only feasible path; follows the active tab inherently, hides chrome via crop, zero new deps. |
| **D-DESIGN-2** | Crop UX = **live preview in the record page**; user drags a box over the live window stream, confirms. No chrome-height estimation. | ADR-011 | WYSIWYG; removes the SPIKE's "fragile chrome-height-estimation" risk; preview→stream mapping is a PURE function. |
| **D-DESIGN-3** | New **top-level mode** `'window-cropped'` (own `RecordingMode` + `RecordingPath`). NOT folded into desktop-screen-recording. Default single-tab unchanged. | ADR-012 | Distinct job; keeps shipped modes regression-safe; additive types. |
| **D-DESIGN-4** | Canvas-crop compositor lives in the **record page, upstream of the UNCHANGED `createRecordingSession`**. `RecorderHost` port untouched; no new platform branch. | ADR-013 | Recorder consumes any MediaStream; mode is orthogonal to target; continuity is structural (one stream, no seam). |
| **D-DESIGN-5** | Audio = **include if shared**, else video-only. No new audio infra. | arch §10 | Reuses the `record.ts` track-composition pattern; `mp4.ts` already muxes audio when present. |
| **D-DESIGN-6** | Firefox maps with **no extra branching** — it already records via getDisplayMedia in the record page; add only the window-surface constraint + the compositor (both mode deltas, not target deltas). | arch §9 | Single platform branch (`selectHost`) preserved. |

## Components touched

| File | Change | Additive / Breaking |
|---|---|---|
| `types.ts` | + `'window-cropped'` RecordingPath; + `CropRect`; + start-recording variant; + `RecordingMode` | **Additive** |
| `popup-logic.ts` | + mode→path mapping; + `messageForAction('window-cropped')` overload | **Additive** |
| `popup.ts` / `popup.html` / `popup.css` | + mode option; route the new mode to the record page | **Additive** |
| `record.ts` | + window-surface constraint for this mode; + live crop preview + compositor wiring | **Additive** (new mode branch; Firefox path unchanged) |
| `crop-geometry.ts` (NEW, PURE) | drag-rect → `CropRect`; clamp; output sizing | New (additive) |
| `crop-compositor.ts` (NEW, effect) | per-frame canvas crop; `captureStream` | New (additive) |
| `background-logic.ts` | carry the mode discriminant; no state-graph change | **Additive** |
| `recorder-host*.ts` / `selectHost` / `mp4.ts` / `offscreen*.ts` / `manifest.json` | none | **Unchanged** |

## Additive type changes (for DISTILL acceptance design)

- `RecordingPath` widened: `| 'window-cropped'`.
- `PopupToSW`: `| { type:'start-recording'; path:'window-cropped' }` (no streamId,
  no CropRect on the wire — the CropRect is consumed locally in the record page).
- `CropRect = { readonly x,y,w,h: number }` in **stream coordinates**; invariants
  clamped by the pure `crop-geometry.ts`.
- `RecordingMode = 'single-tab' | 'desktop-screen' | 'window-cropped'`; default
  `'single-tab'`.
- No breaking change; TypeScript exhaustiveness flags every site that must
  acknowledge the new member.

## Pure seams for unit + mutation coverage (no browser needed)

- `crop-geometry.ts` — drag-rect (preview px) → stream-space `CropRect`; clamping;
  degenerate-drag handling; output dimension computation. **This is where the
  ≥80% mutation gate lands.**
- `popup-logic.ts` mode→path mapping + `messageForAction` window-cropped variant.

## Testability note (Chrome 148 constraint — for DISTILL/DELIVER)

Chrome 148 blocks CLI/CDP unpacked-extension loading. Crop-fidelity and
follow-across-switches need **real window pixels** and cannot be CDP-driven.
Recommendation:

- **Pure seams** → headless Vitest unit + mutation (above).
- **Effect/E2E** → Puppeteer/Playwright **persistent context** (headed,
  `--load-extension` via the runner) OR a documented **human-in-loop manual
  gate**. Budget this cost in DISTILL/DELIVER.

## Residual privacy caveat (carry to DISTILL)

Cropping hides browser chrome and other tabs, but **the active tab's content is
still recorded on switch** — switching to a sensitive tab records it. User
accepted this ("R1-cropped is enough"); no pause/exclude in v1. DISTILL must
cover the **"Recording window region" honest indicator** (slice-02) so the user
always has a visible signal. Touch PRIVACY.md / listing copy if needed (DoD #6).

## External integrations / contract tests

**None.** All capture, crop, and mux are in-browser. No third-party APIs. **No
contract tests** recommended for the platform-architect handoff. The boundaries
that matter are browser-API boundaries (`getDisplayMedia`,
`canvas.captureStream`, `chrome.downloads`), covered by the port/adapter split
and the headed/manual E2E gate.

## Architecture-rule enforcement (for DEVOPS)

Extend **dependency-cruiser** (`no-chrome-in-pure-logic`) to cover
`crop-geometry.ts` and the `popup-logic.ts` additions: pure modules must not
import `chrome|browser|navigator` or DOM/canvas runtime.

## Open items / risks handed forward

- **DISTILL:** author behavioral ACs for the pure seams; design the
  crop-fidelity + follow-across-switches E2E (headed or manual); carry the
  privacy-indicator scenario.
- **DEVOPS:** confirm the headed-E2E runner fits CI budget or document the human
  gate; extend dependency-cruiser; no contract tests.
- **Risk (residual):** crop-rectangle accuracy / `captureStream` frame rate —
  mitigated by live preview (ADR-011) and validated on production data
  (slice-01 AC-crop).
- **Non-blocking:** the 0.2.18 production tab-recording bug observed during the
  SPIKE (`Cannot read properties of undefined (reading 'track')`) is logged
  separately; out of scope for this feature.
