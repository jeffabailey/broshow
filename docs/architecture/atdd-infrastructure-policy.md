# ATDD Infrastructure Policy

Per `nw-distill` § Project Infrastructure Policy. One file per project. Apply-if-exists;
write-if-absent; rewrite with `--policy=fresh`. Git history is the audit trail.

> Bootstrapped 2026-06-06 during DISTILL of `record-all-tabs` (first DISTILL run in
> this project). Language: **TypeScript** (`[lang-mode] typescript`). Test stack:
> **Vitest** (unit/pure) + **@playwright/test** (acceptance E2E, persistent-context
> extension loading). No pytest-bdd / Gherkin in this repo — scenarios are
> `test.describe`/`test(...)` blocks with Given/When/Then comments (repo convention).

## Driving
| Port | Mechanism | Note |
|---|---|---|
| Popup UI (mode selector + indicator) | Playwright `chromium.launchPersistentContext` + `--load-extension`; real `popup.html` via `chrome-extension://<id>/popup.html` | headed; `--use-fake-ui-for-media-stream` auto-grants capture |
| Record page (`record.html`) crop preview + gesture | Playwright persistent context; real `record.html` page in a real window | owns `getDisplayMedia` gesture + live crop preview |
| Popup → SW `start-recording` message | exercised indirectly via the loaded extension (popup click → SW) | never imported directly in acceptance specs |
| Pure logic (`crop-geometry.ts`, `popup-logic.ts` mode/message) | Vitest direct function call (the pure function's signature IS its driving port) | no browser; headless; mutation target (≥80% kill) |

## Driven internal (real)
| Port | Mechanism | Note |
|---|---|---|
| `chrome.downloads` (file output) | real `chrome.downloads` via the loaded extension; assertion = file appears on disk (DOWNLOAD_DIR or ~/Downloads) | the user-observable outcome of this product IS a file on disk |
| Recorder pipeline (`createRecordingSession` / `createMediaRecorderSession`) | real, in the record page; consumes the cropped `MediaStream` unchanged | unchanged by this feature |
| Canvas-crop compositor (`crop-compositor.ts`) | real `<canvas>` + `captureStream` in the record page (headed E2E or human gate) | effect seam; not headless-testable |

## Driven external / non-deterministic (fake)
| Port | Fake | Note |
|---|---|---|
| `getDisplayMedia({displaySurface:'window'})` | Chrome flags `--use-fake-ui-for-media-stream` + `--use-fake-device-for-media-stream` / `--auto-select-desktop-capture-source` | real picker is human-gated; the fake auto-selects a surface so the pipeline runs in CI |
| Wall-clock (`new Date()` for filename) | real `Date` (filename pattern asserted by regex, not exact value) | `formatRecordingFilename` is pure; covered by existing `tests/unit/background.test.ts` |

## State-delta port

`tests/common/state_delta.ts` bootstrapped this run (TypeScript port of the Mandate-8
universe-bound assertion contract). NOTE: the `record-all-tabs` pure seams
(`crop-geometry`, mode-mapping) are **pure functions with a single return value** —
Mandate 8 exempts them (nw-tdd "Pure-function tests with single output"). The port is
bootstrapped for future state-mutating features in this project; it is not required by
this feature's tests. See `docs/feature/record-all-tabs/distill/wave-decisions.md`.
