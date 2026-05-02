# Chrome Web Store Listing Content

The Chrome Web Store Developer Dashboard requires several fields to be filled out **manually** before you can publish your item. These are **not** settable via the CWS Publish API and therefore **cannot** be automated by the release workflow.

The CWS Publish API (the one the release pipeline uses) only supports two operations: upload a zip and publish a previously-uploaded zip. Listing metadata, privacy disclosures, permission justifications, and the data-usage certification all live behind the Dashboard UI.

**Good news**: you fill these in **once**. After that they persist across every upload-and-publish cycle. The release workflow handles the per-version mechanics; you handle the per-listing presence and compliance.

---

## Where to enter each field

Open: https://chrome.google.com/webstore/devconsole -> click into BroShow -> tabs across the top.

| Field | Tab |
|---|---|
| Single purpose description | **Privacy practices** |
| Permission justifications (5x) | **Privacy practices** |
| Remote-code-use answer + justification | **Privacy practices** |
| Data usage certification | **Privacy practices** |
| Publisher contact email | **Account** -> **Public account** (or **Settings**) |
| Contact email verification | Click the link in the verification email |

Listing metadata lives on the **Store listing** tab and includes description, screenshots, category, and language — also one-time and persistent, but not currently blocking publish per the error list you posted. Cover those after the privacy fields.

---

## Copy-paste values for BroShow

Each value is tailored to what BroShow actually does (record a single browser tab to mp4/webm, locally only, no network, no telemetry, no remote code).

### Single purpose description

> BroShow records the visual (and optionally audio) contents of a single browser tab and saves the recording as an MP4 file to the user's Downloads folder. The extension has no other function.

### `tabCapture` justification

> BroShow uses tabCapture to record the visible contents of the active browser tab. Recording is initiated only when the user explicitly clicks "Start Recording" in the extension popup, and stops when the user clicks "Stop". The captured video stream is encoded locally using a bundled MP4 muxer and saved to the user's Downloads folder. Nothing about the captured stream is sent to any server.

### `offscreen` justification

> BroShow uses an offscreen document to host the MediaRecorder pipeline that encodes the captured tab into MP4. The offscreen document is required because tab capture must run outside the popup (which closes when the user clicks elsewhere) and outside the service worker (which has no DOM and cannot host MediaRecorder). The offscreen document only exists for the duration of an active recording.

### `storage` justification

> BroShow uses chrome.storage.local to coordinate state between the popup UI, the offscreen recording document, and the service worker. The only values stored are a current-session recording state ("idle" / "recording" / "stopping"), an internal recording session ID, and per-recording technical metadata (timestamped filename, mime type). No user data, no captured frames, no PII, no analytics, and no information about the user's browsing is stored.

### `downloads` justification

> BroShow uses the downloads API to save the completed recording (an MP4 or WebM file) to the user's local Downloads folder when the user clicks "Stop" or the recording finishes naturally. The download URL is a blob: URI generated in-process from the recorded data; no remote URL is ever requested. The file is given a timestamped name; no other downloads are triggered by the extension.

### Remote code use

**Answer: No, I am not using remote code.**

> BroShow ships entirely as bundled JavaScript inside the extension package. The extension does not call eval(), does not load remote scripts, does not fetch JavaScript at runtime, and does not use any framework that does. The MP4 encoding library (mp4-muxer) is bundled at build time. No code is downloaded from any external source after install.

### Data usage certification

The Privacy Practices tab presents a series of yes/no checkboxes about data collection. Answer as follows for BroShow:

| Question | Answer | Note |
|---|---|---|
| Personally identifiable information | **No** | Extension never collects PII. |
| Health information | **No** | |
| Financial and payment information | **No** | |
| Authentication information | **No** | No login, no auth tokens, no cookies harvested. |
| Personal communications | **No** | Extension does not read or transmit communications. The user can choose to record a tab containing communications, but the extension itself never reads, parses, or transmits the captured content — it is encoded locally and saved to disk only. |
| Location | **No** | |
| Web history | **No** | |
| User activity (clicks, scrolls, mouse movements) | **No** | |
| Website content | **No*** | See note below. |

***On "Website content":** the captured tab frames are technically website content. However, they are processed **entirely in-browser** and saved to the user's local Downloads folder. Nothing is transmitted to any server, never stored on any external system, and never seen by the developer. Some maintainers answer "Yes" here for absolute correctness and add a clarifying note; others answer "No" because the data never leaves the user's machine. Either is defensible; if you choose "Yes" use this clarifying note:

> The captured tab content (the recording itself) is encoded locally by the bundled MP4 muxer and saved to the user's Downloads folder. It is never transmitted to any server, never accessible to the developer, and persists only as the local file the user saves.

**Final certification (3 mandatory checkboxes):**

> [x] I do not sell or transfer user data to third parties, apart from the approved use cases.
> [x] I do not use or transfer user data for purposes unrelated to my item's single purpose.
> [x] I do not use or transfer user data to determine creditworthiness or for lending purposes.

All three are true for BroShow.

### Publisher contact email

Use your maintainer email (the one associated with the developer account).

After saving, Chrome Web Store sends a verification email. Click the link inside it. The "verified" badge appears within a few minutes.

### Privacy policy URL

The Privacy practices tab also has a **Privacy policy** field. Use:

> https://github.com/jeffabailey/broshow/blob/main/PRIVACY.md

(The repo's `PRIVACY.md` is publicly viewable and renders as readable HTML on GitHub; CWS reviewers will fetch and read it.)

---

## Listing metadata (Store listing tab)

Not blocking publish per your current error list, but you'll want to fill this in for the public listing to look presentable. Quick suggestions:

| Field | Suggested value |
|---|---|
| Title | `BroShow` |
| Summary (≤132 chars) | `Record a browser tab and save it as an MP4 file. No accounts, no servers, no telemetry — everything runs locally in your browser.` |
| Description | Reuse the README's "What it does" section + "Privacy" section. Mention: tab-only capture, optional audio, MP4 output, Manifest V3, no telemetry, no remote code, no network. |
| Category | **Productivity** (best fit) or **Developer Tools** |
| Language | English (US) |
| Screenshots | Need at least 1 (1280x800 or 640x400 PNG). Capture: popup with "Start Recording" button, recording in-progress with REC badge visible on toolbar, finished MP4 in Downloads. |
| Promotional tile (optional) | 440x280 PNG. Skip for v1; CWS lets you submit without it. |
| Icon | Already in the package (`icons/icon-128.png`). |

Skip everything optional for the first publish — you can iterate after.

---

## Why none of this can be automated

The Chrome Web Store Publish API documented at https://developer.chrome.com/docs/webstore/api exposes exactly two write operations:

- `POST https://www.googleapis.com/upload/chromewebstore/v1.1/items/{itemId}` -- replace the package
- `POST https://www.googleapis.com/chromewebstore/v1.1/items/{itemId}/publish` -- publish the most recent upload

There is no endpoint for:

- Setting permission justifications
- Setting the single-purpose description
- Setting privacy-practices answers
- Submitting the data-usage certification
- Setting/verifying the publisher contact email
- Uploading or modifying listing metadata (description, screenshots, category)

This is a long-standing API gap that Google has not addressed despite community requests. (Some third-party tools claim "automated listings" but they all rely on UI scraping / browser automation, which is fragile and against the spirit of the developer terms.)

The release workflow's `cws-adapter.effect.mjs` therefore implements only the upload-and-publish path. Everything else is a one-time human task in the Dashboard.

---

## After this is done — what the release workflow handles

| Per release | Per listing |
|---|---|
| ✅ Build + package zip (workflow) | ❌ Listing metadata (manual, one-time) |
| ✅ Upload zip via API (workflow) | ❌ Privacy practices (manual, one-time) |
| ✅ Publish API call (workflow + your approval click) | ❌ Permission justifications (manual, one-time) |
| ✅ AMO listed submission (workflow) | ❌ Contact email + verification (manual, one-time) |
| ✅ Version conflict detection (workflow) | ❌ Screenshots (manual, can update later) |
| ✅ Step summary table (workflow) | ❌ Description (manual, can update later) |

Once the right column is done, you don't touch the Dashboard for routine releases.

---

## Action checklist (after MAINTAINER-SETUP Step 6)

- [ ] CWS Dashboard -> **Account** -> set publisher contact email -> save
- [ ] Click verification link in email
- [ ] CWS Dashboard -> BroShow item -> **Privacy practices** tab:
  - [ ] Single purpose description (paste from above)
  - [ ] tabCapture justification (paste from above)
  - [ ] offscreen justification (paste from above)
  - [ ] storage justification (paste from above)
  - [ ] downloads justification (paste from above)
  - [ ] Remote-code-use: **No** + paste justification
  - [ ] Data usage certification (uncheck all data-collection checkboxes; check the 3 final certifications)
  - [ ] Privacy policy URL: `https://github.com/jeffabailey/broshow/blob/main/PRIVACY.md`
  - [ ] **Save draft**
- [ ] CWS Dashboard -> BroShow item -> **Store listing** tab:
  - [ ] Title, summary, description, category, language
  - [ ] At least 1 screenshot
  - [ ] **Save draft**
- [ ] Now the publish workflow won't be blocked on these fields

After this is done, the workflow_dispatch -> approve flow described in `MAINTAINER-SETUP.md` works end-to-end without further Dashboard interaction.
