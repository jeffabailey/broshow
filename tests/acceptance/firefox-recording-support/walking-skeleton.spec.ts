// ---------------------------------------------------------------------------
// Walking Skeleton (firefox-recording-support) -- Chrome regression guards
// ---------------------------------------------------------------------------
// WS strategy: Strategy C (Real local). Real Chromium via
// chromium.launchPersistentContext + --load-extension. Real chrome.offscreen,
// real chrome.tabCapture, real chrome.downloads, real filesystem.
//
// Why this lives here: the Firefox feature introduces a RecorderHost
// abstraction that refactors the Chrome path. AC-FF-06, AC-FF-08, AC-FF-09
// are explicit regression guards: Sam-on-Chrome must continue to record
// without any Firefox-specific UI artifacts and without growth in
// permissions or outbound network.
//
// Firefox runtime smoke lives in firefox-host-smoke.spec.ts (Playwright
// cannot drive Firefox extensions; web-ext or manual matrix instead).
//
// Driving ports invoked (Mandate 1):
//   - initializePopup(...)             -- src/popup-logic.ts (popup user-facing port)
//   - createMessageHandler(apis)       -- src/background-logic.ts (SW message port)
//   These are exercised indirectly via the popup HTML and the loaded service
//   worker; we never import internal components in this file.
//
// AC traceability is recorded in scenario titles and tags:
//   AC-FF-06 -- Chrome popup hides Firefox hint, auto-targets active tab
//   AC-FF-08 -- No new permissions in patched manifest
//   AC-FF-09 -- Zero outbound network during a complete recording flow
// ---------------------------------------------------------------------------

import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  attachNetworkRecorder,
  assertZeroExternalNetwork,
} from '../fixtures/no-network';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXTENSION_PATH = path.resolve(__dirname, '../../../dist');
const DOWNLOAD_DIR = path.resolve(__dirname, '../../downloads-firefox-feature');
const TEST_PAGE_PATH = path.resolve(__dirname, '../../fixtures/test-page.html');
const SRC_MANIFEST_PATH = path.resolve(__dirname, '../../../src/manifest.json');
const FIREFOX_HINT_TEXT = 'Firefox will ask you to choose a tab, window, or screen';

const ensureDistBuilt = (): void => {
  const manifestPath = path.resolve(EXTENSION_PATH, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('dist/ not found. Run "npm run build" before acceptance tests.');
  }
};

const getExtensionId = async (context: BrowserContext): Promise<string> => {
  let [background] = context.serviceWorkers();
  if (!background) {
    background = await context.waitForEvent('serviceworker');
  }
  return background.url().split('/')[2];
};

const launchChromiumExtension = async (userDataDir: string): Promise<BrowserContext> => {
  if (fs.existsSync(userDataDir)) {
    fs.rmSync(userDataDir, { recursive: true });
  }
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    acceptDownloads: true,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--auto-select-tab-capture-source-by-title=BroShow Test Page',
      '--auto-select-desktop-capture-source=Entire screen',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-search-engine-choice-screen',
    ],
  });
  const cdp = await context.newCDPSession(context.pages()[0] || (await context.newPage()));
  await cdp.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: DOWNLOAD_DIR,
    eventsEnabled: true,
  });
  return context;
};

test.beforeAll(() => {
  ensureDistBuilt();
  if (fs.existsSync(DOWNLOAD_DIR)) {
    fs.rmSync(DOWNLOAD_DIR, { recursive: true });
  }
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
});

// ---------------------------------------------------------------------------
// AC-FF-06: Chrome flow is unchanged
// ---------------------------------------------------------------------------

test.describe('@walking_skeleton @real-io @chromium AC-FF-06: Chrome flow is unchanged after the Firefox refactor', () => {
  let context: BrowserContext;

  test.beforeAll(async () => {
    context = await launchChromiumExtension(
      path.resolve(__dirname, '../../.tmp-profile-ff-ws-ac06'),
    );
    attachNetworkRecorder(context);
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('Sam on Chrome opens the popup and never sees the Firefox surface-picker hint (via initializePopup)', async () => {
    // Given: Sam has Chrome with BroShow installed (real Chromium, real extension)
    const extensionId = await getExtensionId(context);

    // When: he clicks the BroShow toolbar icon (modeled by opening popup.html)
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

    // Then: the popup shows a Start Recording button (driving port: initializePopup
    //       resolved the Chromium capability path)
    const startButton = popupPage.locator('button', { hasText: 'Start Recording' });
    await expect(startButton).toBeVisible();
    await expect(startButton).toBeEnabled();

    // And: the popup does NOT show the Firefox surface-picker hint
    //      (observable user outcome -- AC-FF-06)
    await expect(popupPage.getByText(FIREFOX_HINT_TEXT)).toHaveCount(0);

    await popupPage.close();
  });

  test('Sam on Chrome records a tab end-to-end and ends with a downloaded file (via initializePopup + createMessageHandler)', async () => {
    test.setTimeout(60_000);

    // Given: Sam's downloads directory is clean
    if (fs.existsSync(DOWNLOAD_DIR)) {
      fs.rmSync(DOWNLOAD_DIR, { recursive: true });
    }
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

    // And: Sam has a real Chromium browser with the extension loaded
    const extensionId = await getExtensionId(context);
    const testPage = await context.newPage();
    const cdp = await context.newCDPSession(testPage);
    await cdp.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: DOWNLOAD_DIR,
      eventsEnabled: true,
    });
    await testPage.goto(`file://${TEST_PAGE_PATH}`);

    // When: Sam clicks the toolbar icon (opens popup) ...
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

    // ... and clicks Start Recording
    await testPage.bringToFront();
    await popupPage.click('button:has-text("Start Recording")');

    // Then: BroShow records the active tab automatically
    //       (no surface picker is shown -- Chrome's tabCapture auto-targets)
    await expect(popupPage.locator('button', { hasText: 'Stop Recording' })).toBeVisible({
      timeout: 10_000,
    });

    // And: after a brief recording, Sam clicks Stop Recording
    await popupPage.waitForTimeout(3000);
    await popupPage.click('button:has-text("Stop Recording")');

    // And: a file is downloaded with the same filename pattern as before the refactor
    const startWait = Date.now();
    let downloadedFile: string | null = null;
    while (Date.now() - startWait < 40_000) {
      const files = fs.existsSync(DOWNLOAD_DIR)
        ? fs.readdirSync(DOWNLOAD_DIR).filter((f) => !f.endsWith('.crdownload'))
        : [];
      if (files.length > 0) {
        downloadedFile = files[0];
        break;
      }
      const home = path.resolve(process.env.HOME || '', 'Downloads');
      const broshowFiles = fs.existsSync(home)
        ? fs.readdirSync(home).filter((f) => f.startsWith('broshow'))
        : [];
      if (broshowFiles.length > 0) {
        downloadedFile = broshowFiles[0];
        break;
      }
      await popupPage.waitForTimeout(1000);
    }

    expect(downloadedFile, 'Expected a broshow-* download from the Chrome flow').not.toBeNull();
    // Filename pattern parity (AC-FF-10 partial -- Chrome side proven here)
    expect(downloadedFile!).toMatch(/^broshow-\d{4}-\d{2}-\d{2}-\d{6}\.(mp4|webm)$/);

    await popupPage.close();
    await testPage.close();
  });
});

// ---------------------------------------------------------------------------
// AC-FF-09: No outbound network during the Chrome flow
// ---------------------------------------------------------------------------

test.describe('@walking_skeleton @real-io @chromium AC-FF-09: No outbound network on the Chrome path', () => {
  let context: BrowserContext;

  test.beforeAll(async () => {
    context = await launchChromiumExtension(
      path.resolve(__dirname, '../../.tmp-profile-ff-ws-ac09'),
    );
    attachNetworkRecorder(context);
  });

  test.afterEach(() => {
    // Observable outcome: zero http/https requests across the whole flow
    assertZeroExternalNetwork(context);
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('Sam completes a recording and BroShow makes zero outbound network requests (via initializePopup)', async () => {
    test.setTimeout(60_000);

    if (fs.existsSync(DOWNLOAD_DIR)) {
      fs.rmSync(DOWNLOAD_DIR, { recursive: true });
    }
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

    const extensionId = await getExtensionId(context);
    const testPage = await context.newPage();
    const cdp = await context.newCDPSession(testPage);
    await cdp.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: DOWNLOAD_DIR,
      eventsEnabled: true,
    });
    await testPage.goto(`file://${TEST_PAGE_PATH}`);

    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await testPage.bringToFront();
    await popupPage.click('button:has-text("Start Recording")');

    await expect(popupPage.locator('button', { hasText: 'Stop Recording' })).toBeVisible({
      timeout: 10_000,
    });
    await popupPage.waitForTimeout(2000);
    await popupPage.click('button:has-text("Stop Recording")');
    await popupPage.waitForTimeout(3000);

    // Observable outcome: assertZeroExternalNetwork in afterEach is the
    // assertion. It throws on any http(s) request observed during the flow.
    await popupPage.close();
    await testPage.close();
  });
});

// ---------------------------------------------------------------------------
// AC-FF-08: No new permissions added by the Firefox patcher
// ---------------------------------------------------------------------------

test.describe('@walking_skeleton @real-io @chromium AC-FF-08: No new permissions added to the manifest', () => {
  test('the Chromium-source manifest declares only the existing permission set (regression guard)', async () => {
    // Given: the source manifest at src/manifest.json is the canonical declaration
    const manifest = JSON.parse(fs.readFileSync(SRC_MANIFEST_PATH, 'utf8'));
    const permissions = (manifest.permissions ?? []).slice().sort();

    // Then: Sam's Chromium build still declares exactly the v0.1.2 permission set
    //       (no Firefox-only permission has leaked in via the refactor)
    expect(permissions).toEqual(['downloads', 'offscreen', 'storage', 'tabCapture']);
  });

  test('the built dist manifest declares the same permission set as the source', async () => {
    // Given: the dist manifest is the artifact loaded by Chrome at runtime
    const manifestPath = path.resolve(EXTENSION_PATH, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const permissions = (manifest.permissions ?? []).slice().sort();

    // Then: it matches the source manifest -- the bundle pipeline did not add
    //       a permission as a side effect of the Firefox refactor
    expect(permissions).toEqual(['downloads', 'offscreen', 'storage', 'tabCapture']);
  });
});
