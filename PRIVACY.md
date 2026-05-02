# Privacy Policy for BroShow

**Effective:** 2026-05-02
**Last updated:** 2026-05-02

## Summary

BroShow is a browser extension that records a single browser tab and saves the recording as a video file (MP4 in Chromium browsers, WebM in Firefox) to your Downloads folder. **BroShow does not collect, transmit, or store any personal data.** Every step of recording, encoding, and saving happens locally in your browser, on your device.

## What data BroShow processes

When you click **Start Recording** in BroShow's popup:

- BroShow captures the visual contents of the active browser tab via the browser's built-in tab-capture API.
- If you opt in, BroShow also captures audio from a source you select (e.g., the tab's audio in Chromium, or a virtual audio input device in Firefox).
- The captured stream is encoded into a video file in-process using a bundled MP4 muxer (`mp4-muxer`, included in the extension package at build time).
- The video file is saved to your local Downloads folder via the browser's standard downloads API. The download URL is a `blob:` URL generated locally; no remote URL is ever requested.

The recording itself is the only data BroShow ever handles. It is:

- Created only by your explicit click on **Start Recording**.
- Encoded entirely on your device, inside your browser.
- Saved only to your local Downloads folder.
- Never transmitted to any server.
- Never uploaded to any cloud service.
- Never accessible to the developer.

## What BroShow does NOT do

- No telemetry or analytics — the extension makes no network requests at all.
- No tracking of your browsing or your activity.
- No collection of personally identifiable information (PII).
- No collection of credentials, passwords, session tokens, or cookies.
- No reading of website content outside an active recording.
- No remote code execution. All JavaScript ships in the extension package; no `eval`, no remotely-loaded scripts, no dynamic code download.
- No third-party services, SDKs, or analytics libraries.
- No advertisements.
- No tracking pixels.
- No external server communication of any kind.

## Permissions explained

BroShow declares only the permissions it actually uses:

| Permission | Why BroShow needs it |
|---|---|
| `tabCapture` | To record the active tab when you click Start Recording. (Chromium only — Firefox uses `getDisplayMedia` from a recorder window.) |
| `offscreen` | To host the recording pipeline outside the popup, so recording continues when the popup closes or you switch tabs. (Chromium only.) |
| `downloads` | To save the finished recording to your Downloads folder. |
| `storage` | To coordinate recording state (idle / recording / stopping) across the popup, offscreen document, and service worker. Stores no user data, no captured frames, no PII — only a recording state machine. |

The extension does **not** request `<all_urls>`, `tabs`, `webNavigation`, `webRequest`, `cookies`, `history`, `bookmarks`, or any other broad-access permission.

## Data sharing

BroShow does not share data with any third party. There is no data to share — the only output the extension produces is the local video file that **you** initiated. What you choose to do with that file (keep it, delete it, share it, upload it elsewhere) is entirely under your control.

## Data retention

BroShow retains no data on its own. The video file you save lives on your local disk in your Downloads folder until you delete it; the developer has no copy and no way to access it.

The `chrome.storage.local` state used to coordinate the popup / offscreen / service-worker handshake is transient — it tracks the current recording session and is cleared when the recording ends.

## Children's privacy

Because BroShow does not collect any data, it does not collect data from children either. The extension is safe to use at any age, subject to the developer policies of the Chrome Web Store and the Firefox Add-ons store.

## Open source

BroShow is open source under the MIT License. The complete source code is at:

> https://github.com/jeffabailey/broshow

You can audit exactly what BroShow does. The code shipped in the `.crx` (Chrome) and `.xpi` (Firefox) packages is the bundled JavaScript built from the matching git tag — there are no remote scripts and no `eval`. Anyone who wants to verify a published version can rebuild from the matching tag and compare the bundle.

## Changes to this policy

If BroShow's behavior ever changes in a way that affects what data it processes, this policy will be updated, the change will be summarized in the GitHub release notes, and the **Last updated** date at the top will be bumped.

## Contact

Questions or concerns about this privacy policy or about BroShow's behavior:

- File a GitHub issue: https://github.com/jeffabailey/broshow/issues
- Email the publisher: jeffabailey@gmail.com (the contact email associated with the Chrome Web Store and AMO listings)
