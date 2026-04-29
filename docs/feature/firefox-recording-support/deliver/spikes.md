# DELIVER Spikes: firefox-recording-support

> Companion artifact to step 03-01. Records the outcome of the two
> architectural spikes carried over from DESIGN (D7 + the open item under
> wave-decisions.md "Open items forwarded to DISTILL / DELIVER"):
>
> - **S-1**: Does `navigator.mediaDevices.getDisplayMedia()` honor the
>   user-gesture chain when invoked from the Firefox MV3 background event
>   page after a popup-forwarded `start-recording` message on Firefox 121+?
> - **S-2**: Does an active `MediaRecorder` keep the Firefox MV3 background
>   event page alive for >= 5 minutes without an explicit heartbeat?
>
> Both spikes require human interaction with the Firefox surface picker
> and cannot be fully automated from the test harness (no headless or
> webdriver path drives a real surface picker on macOS Firefox 121+).
> They are recorded here as **PENDING-MANUAL** with a precise smoke
> recipe; the outcome cell is updated when the recipe is executed.
>
> If S-1 fails, ADR-003's "Alternatives" section names the fallback path
> (Option B: record-tab API). The crafter MUST stop and escalate before
> any silent workaround.

## Manifest pre-conditions (automated)

The patched Firefox manifest produced by
`scripts/patch-firefox-manifest.mjs` is pinned by
`tests/unit/manifest-patch-firefox-permissions.test.ts` to declare:

- `browser_specific_settings.gecko.id = "broshow@jeffabailey.com"`
- `browser_specific_settings.gecko.strict_min_version >= 121.0`
- `background.scripts: ["background.js"]` (the MV3 event-page entry that
  Firefox honors; Chromium ignores `scripts` and uses `service_worker`)
- `permissions` is a subset of the Chromium source minus
  `["tabCapture", "offscreen"]` (no new permissions; AC-FF-08 holds)

Verified in vitest (9 passing tests in
`manifest-patch-firefox-permissions.test.ts`). Confirmed by
`unzip -p packages/broshow-firefox-0.1.2.xpi manifest.json` that the
emitted xpi carries the expected shape.

## S-1: getDisplayMedia user-gesture chain on Firefox MV3 background

| Field | Value |
|---|---|
| Status | **PENDING-MANUAL** |
| Owner | crafter -> human-in-the-loop on Firefox 121+ |
| Blocks | step 03-02 (popup -> background message routing) |
| Fallback if FAIL | ADR-003 Option B (record-tab) -- escalate, do not silently work around |

### Recipe

Pre-requisites:
- macOS or Linux host with screen-capture permission already granted to
  Firefox (System Settings -> Privacy & Security -> Screen Recording on
  macOS; Wayland portal granted on Linux).
- Firefox 121.0 or newer. Local copy reports
  `firefox --version` -> `Mozilla Firefox 150.0.1` at the time of writing,
  which is comfortably above the `strict_min_version` floor.

Steps:

1. Build a fresh xpi:
   ```
   npm run package
   ```
   Confirms `packages/broshow-firefox-<version>.xpi` is present and
   `unzip -p packages/broshow-firefox-<version>.xpi manifest.json`
   shows `background.scripts` and `browser_specific_settings.gecko`.

2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
   Click **Load Temporary Add-on...** and select either:
   - `dist/manifest.json` (preferred -- live-edit-friendly), OR
   - the unpacked staging directory used by `scripts/package-extensions.mjs`.

   Avoid double-clicking the unsigned xpi on stock Firefox; signature
   enforcement will reject it. Temporary load is the supported path.

3. Open `about:debugging` -> click **Inspect** next to the BroShow
   add-on. The DevTools window that opens IS the Firefox MV3 background
   event-page console. Confirm the bundled background script ran:
   - The DevTools "Sources" tab lists `background.js`.
   - No red errors in the Console at load time.

4. Open any tab (e.g., `about:blank`). Click the BroShow toolbar action
   to open the popup.

5. Click **Start** in the popup.

6. Observe in the background DevTools console the path that fires:
   - **PASS**: Firefox shows the **surface picker** (a dialog asking
     which screen/window/tab to share). Selecting any source resolves
     `navigator.mediaDevices.getDisplayMedia()` and recording begins.
     Cancelling the picker rejects with `NotAllowedError` (which the
     adapter maps to `{ ok: false, cause: 'picker-cancelled' }` per D10).
   - **FAIL**: the call rejects with `InvalidStateError`, a "user
     gesture required" `NotAllowedError`, or any error other than the
     cancel case above. The picker is NEVER shown.

7. Record the outcome in the table below. If FAIL, STOP and escalate
   per ADR-003 -- do not implement a silent workaround.

### Observation

| Run | Date | Firefox version | Outcome | Notes |
|---|---|---|---|---|
| 1 | _PENDING_ | _PENDING_ | _PENDING_ | _PENDING_ |

## S-2: 5-minute keep-alive without an explicit heartbeat

| Field | Value |
|---|---|
| Status | **PENDING-MANUAL** |
| Owner | crafter -> human-in-the-loop on Firefox 121+ |
| Default position | NO heartbeat. Only add one if S-2 observes the event page suspending. |
| Mitigation if FAIL | Add a no-op `setInterval` heartbeat inside `recorder-host-firefox.ts` |

### Recipe

Pre-requisites: same as S-1, plus S-1 must be PASS.

Steps:

1. Complete S-1 steps 1-5 (load add-on, start a recording).

2. Pick a stable surface to record (e.g., a plain browser tab showing
   `about:blank`). Once the picker resolves, you should see the
   `REC` badge appear on the BroShow toolbar action and a recording
   indicator from Firefox itself.

3. Close the popup. Do NOT interact with the popup or the BroShow
   toolbar action for the entire duration of the test.

4. Set a timer for **5 minutes 30 seconds** (a safety buffer past the
   5-minute target). Leave the recording running.

5. After the timer, return to the BroShow popup and click **Stop**.

6. Observe:
   - **PASS**: Stop completes normally, an mp4 download is triggered,
     and the saved file plays back with at least 5 minutes of video.
     The background DevTools console shows no "service worker
     terminated" / "event page unloaded" warnings during the run.
   - **FAIL**: any of -- the popup reports the recording was lost,
     no download fires, the saved file is shorter than 5 minutes,
     OR the background DevTools console logs that the page was
     unloaded mid-recording.

7. Record the outcome in the table below.

### Observation

| Run | Date | Firefox version | Duration captured | Outcome | Notes |
|---|---|---|---|---|---|
| 1 | _PENDING_ | _PENDING_ | _PENDING_ | _PENDING_ | _PENDING_ |

## What "PASS" enables for downstream steps

- **S-1 PASS** unblocks step 03-02 (popup -> background routing for
  `start-recording`). The crafter can implement the routing knowing the
  user-gesture chain survives the popup-to-background hop.
- **S-2 PASS** confirms `recorder-host-firefox.ts` does NOT need a
  heartbeat. The default position remains "no heartbeat".
- **S-2 FAIL** would justify adding a no-op `setInterval` heartbeat
  scoped to the active recording. That work is intentionally NOT
  performed pre-emptively; the spike must observe a failure first.

## Why this is PENDING-MANUAL rather than automated

- `web-ext run --target firefox-desktop` can launch Firefox with the
  add-on loaded but cannot click through the popup, dispatch a
  user-gesture into the background page, OR drive the surface picker
  -- those are deliberately gated to real human interaction by Gecko.
- Playwright cannot drive the Firefox surface picker on the same
  Firefox build that hosts the extension under test (the picker runs
  in the OS layer, not the DOM).
- Headless Firefox does not honor `getDisplayMedia` (no display).

A precise human recipe is therefore the most reliable verification.
The user can run this recipe and replace the `_PENDING_` cells with
PASS/FAIL outcomes; until then, downstream steps that depend on
S-1 PASS may proceed only with the user's explicit confirmation that
the spike has been run on a real Firefox 121+ install.
