# BroShow

Browser extension that records a single browser tab and saves the recording as a video file. Manifest V3, runs in Chrome/Edge/Brave/Arc and Firefox.

## What it does

- One click → records the **active browser tab** (visual + optionally audio).
- Saves the result to your **Downloads folder** as `broshow-YYYY-MM-DD-HHMMSS.mp4` (Chromium) or `.webm` (Firefox).
- Everything runs **locally in your browser**. No accounts, no servers, no telemetry.

A toolbar badge shows `REC` while recording is active. Click the icon and hit **Stop Recording** to finish; the file downloads automatically.

## Install

- **Chrome / Edge / Brave / Arc**: install from the Chrome Web Store [link forthcoming once published].
- **Firefox**: install from addons.mozilla.org [link forthcoming], or sideload the most recent signed `.xpi` from [Releases](https://github.com/jeffabailey/broshow/releases).
- **Sideload (any browser)**: download the matching `broshow-chrome-X.Y.Z.zip` (unzip → `chrome://extensions` → Load unpacked) or `broshow-firefox-X.Y.Z.xpi` (drag onto Firefox) from [Releases](https://github.com/jeffabailey/broshow/releases).

## Usage

1. Click the BroShow toolbar icon.
2. Click **Start Recording**. (Firefox: a recorder window opens; pick a tab in the browser-share dialog.)
3. The toolbar shows a `REC` badge while recording.
4. Click the icon again → **Stop Recording**. The file is saved to your Downloads folder.

### Audio

- **Chromium**: tab audio is captured automatically alongside the video.
- **Firefox**: tab audio capture isn't available on the desktop platform (Firefox bug [1541425](https://bugzilla.mozilla.org/show_bug.cgi?id=1541425), open since 2019). To record audio on Firefox, opt in via the recorder window's checkbox and pick a microphone or a virtual audio device (e.g., [BlackHole](https://existential.audio/blackhole/) on macOS routed via a Multi-Output Device).

## Privacy

BroShow does not collect, transmit, or store any personal data.

- **No telemetry**, no analytics, no error reporting.
- **No network requests** — the extension makes none.
- **No remote code** — the MP4 muxer is bundled into the package at build time; nothing is downloaded after install.
- **No PII**, no credentials, no cookies, no browsing history, no tracking.
- **No third-party services**, SDKs, or analytics libraries.
- The recorded video file is generated entirely in your browser and saved only to your local Downloads folder. The developer never sees it.

Full privacy policy: [PRIVACY.md](PRIVACY.md).

## Permissions

| Permission | Why it's used |
|---|---|
| `tabCapture` | To record the active tab when you click Start Recording (Chromium only). |
| `offscreen` | To run the MediaRecorder pipeline outside the popup so recording survives popup-close (Chromium only). |
| `downloads` | To save the recording to your Downloads folder. |
| `storage` | To track recording state across the popup, offscreen document, and service worker. Stores no user data. |

The extension does **not** request `<all_urls>`, `tabs`, `webRequest`, `cookies`, `history`, or any other broad-access permission.

## Build from source

```bash
git clone https://github.com/jeffabailey/broshow.git
cd broshow
npm install
npm run build              # outputs dist/
npm run package            # outputs packages/broshow-chrome-X.Y.Z.zip + .xpi
npm run sign               # signs the Firefox xpi via AMO unlisted channel
                           # (requires AMO_JWT_ISSUER + AMO_JWT_SECRET env vars)
```

Local development with live reload:

```bash
npm run dev:chrome         # launches Chromium with the extension loaded
npm run dev:firefox        # launches Firefox with the extension loaded
```

## Tests

```bash
npm test                   # vitest unit + acceptance suites
npm run test:mutation      # Stryker mutation testing on pure modules (target >= 80% kill rate)
```

## Architecture

- **Functional programming paradigm.** Pure functions for transforms (`*.pure.mjs`); effect boundaries at browser API edges (`*.effect.mjs`).
- **Chromium recording host**: popup → service worker → offscreen document hosting `tabCapture` + MediaRecorder + mp4-muxer.
- **Firefox recording host**: popup opens a record-tab window that uses `getDisplayMedia` (Firefox lacks `chrome.tabCapture` and `chrome.offscreen` for extensions). See [ADR-003](docs/adrs/ADR-003-firefox-recording-host.md).
- **Marketplace publishing**: `release.yml` builds + signs on tag-push; `workflow_dispatch` + environment-gated approval triggers Chrome Web Store + AMO-listed publishes. See [MAINTAINER-SETUP.md](MAINTAINER-SETUP.md).

Architecture decision records: [`docs/adrs/`](docs/adrs/).

## Contributing

PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
