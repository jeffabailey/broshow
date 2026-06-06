# Upstream Issues — record-all-tabs (R1-cropped), found in DISTILL

> Wave: DISTILL. Back-propagation per the document-update contract. None of these
> BLOCK DISTILL handoff — they are re-aim artifacts from the SPIKE pivot
> (D1→D1′) that the PO should confirm. No contradictions; the reconciliation gate
> passed with 0 contradictions.

## ISS-1 — AC2.2 (seam threshold) is obsoleted, not satisfied

- **Origin:** DISCUSS US-2 AC2.2 ("the seam between tab A and tab B footage is
  within the maximum-gap threshold established by the SPIKE", `@pending-spike`).
- **Status:** OBSOLETED by the SPIKE. Under R1-cropped there is exactly one
  uninterrupted window stream for the whole session; a tab switch changes the
  pixels inside the stream, not the stream identity. There is no seam to bound.
- **DISTILL action taken:** no scenario authored for AC2.2; documented as
  obsoleted in `test-scenarios.md` §AC traceability and in feature-delta §"Wave:
  SPIKE". This already matches the feature-delta's own supersede note.
- **PO confirmation requested:** mark AC2.2 as `OBSOLETED (SPIKE)` in the story so
  it is not later read as an untested AC.

## ISS-2 — AC1.4 (hide/disable mode on unsupported target) is satisfied-by-inheritance

- **Origin:** DISCUSS US-1 AC1.4 ("on an unsupported target per capability probe,
  the mode control is hidden or disabled with a one-line reason — no dead
  control"). Written for the obsolete tabCapture-follow capability probe.
- **Status:** RE-AIMED. Under R1-cropped the mechanism is `getDisplayMedia`, which
  BroShow already feature-detects via `detectRecordingCapability` (`popup-logic.ts`,
  capability paths `chromium-offscreen` / `firefox-display-media` / unsupported).
  The cropped-window mode rides the SAME probe — it is available wherever
  `getDisplayMedia` is, and the unsupported branch already disables recording with
  a reason.
- **DISTILL action taken:** no dedicated "hide the mode control" scenario; the
  existing capability-gate (covered by `tests/unit/capability-check.test.ts` from
  the prior feature) already blocks unsupported runtimes. Flagged here rather than
  silently dropped.
- **PO confirmation requested:** confirm AC1.4 is satisfied-by-inheritance (the
  cropped-window mode does not need its own control-hiding logic beyond the
  existing probe). If the PO wants the mode option specifically hidden (not just
  recording disabled) on unsupported targets, add a DELIVER step + one scenario.

## ISS-3 — US-2/US-3 phrasing still references "follow" / "switch"

- **Origin:** US-2/US-3 titles and pitches use the tabCapture-follow vocabulary
  ("the recording continues into the tab I switch to").
- **Status:** Functionally still TRUE under R1-cropped (the window stream follows
  the active tab inherently), so the user-visible job is unchanged. Only the
  MECHANISM changed. The DISTILL scenarios test the reframed mechanism while
  honoring the same observable job.
- **DISTILL action taken:** scenarios assert the observable job (one file, content
  updates across switches, honest indicator) without depending on the obsolete
  re-acquire mechanism. No story edit required; noted for clarity.

## DEVOPS artifact gap (warn, not block)

- No `docs/feature/record-all-tabs/devops/` directory exists. Per the graceful
  degradation matrix, DISTILL proceeds with the default environment matrix. For a
  browser-extension feature the only meaningful environment is a **clean browser
  profile** (each WS run `fs.rmSync` the profile dir before launch), as
  established for the prior feature (firefox D11). Forwarded to the
  platform-architect to decide whether a feature-specific `environments.yaml`
  (single env: `clean-profile`) is warranted.

## SSOT product artifacts absent (warn, not block)

- `docs/product/journeys/*.yaml`, `docs/product/architecture/brief.md`, and
  `docs/product/kpi-contracts.yaml` were not found. This project uses the
  SSOT-bootstrap model where `feature-delta.md` is the SSOT (DISCUSS bootstrapped
  `docs/product/` only partially). Driving ports were read from the feature-delta
  §"Driving Ports" + DESIGN component-boundaries, so the hexagonal boundary is
  verifiable. No `@kpi` scenarios authored (no KPI contract); soft-gate warning
  logged, proceeded.
