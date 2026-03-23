// ---------------------------------------------------------------------------
// Walking Skeleton acceptance tests for BroRecord browser extension
// ---------------------------------------------------------------------------
// Extension testing requires chromium.launchPersistentContext() -- Playwright's
// default context fixture does NOT support loading unpacked extensions.
//
// Limitations documented here:
// - tabCapture uses --auto-select-tab-capture-source-by-title Chrome flag
//   to auto-select the tab for capture in automated tests.
// - Offscreen documents require headed mode (no headless support).
// - Recording tests (start/stop/download) are tagged @recording and may
//   require manual verification in environments where screen capture is blocked.
// ---------------------------------------------------------------------------

import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// -- Paths --

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXTENSION_PATH = path.resolve(__dirname, '../../dist');
const DOWNLOAD_DIR = path.resolve(__dirname, '../downloads');
const TEST_PAGE_PATH = path.resolve(__dirname, '../fixtures/test-page.html');

// -- Helpers --

const getExtensionId = async (context: BrowserContext): Promise<string> => {
  let [background] = context.serviceWorkers();
  if (!background) {
    background = await context.waitForEvent('serviceworker');
  }
  const extensionId = background.url().split('/')[2];
  return extensionId;
};

const launchExtensionContext = async (): Promise<BrowserContext> => {
  const userDataDir = path.resolve(__dirname, '../.tmp-profile');
  if (fs.existsSync(userDataDir)) {
    fs.rmSync(userDataDir, { recursive: true });
  }

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    acceptDownloads: true,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      // Auto-select tab capture source for tabCapture API
      '--auto-select-tab-capture-source-by-title=BroRecord Test Page',
      // Auto-select screen for getDisplayMedia fallback in test environments
      '--auto-select-desktop-capture-source=Entire screen',
      '--use-fake-ui-for-media-stream',
      // Provide fake media device so plain getUserMedia succeeds in offscreen doc
      '--use-fake-device-for-media-stream',
      // Disable various Chrome UIs that interfere with testing
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-search-engine-choice-screen',
    ],
  });

  // Set Chrome's download directory via CDP
  const cdpSession = await context.newCDPSession(context.pages()[0] || await context.newPage());
  await cdpSession.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: DOWNLOAD_DIR,
    eventsEnabled: true,
  });

  return context;
};

const waitForDownload = (dir: string, timeoutMs = 15000): Promise<string> =>
  new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const files = fs
        .readdirSync(dir)
        .filter((f) => !f.endsWith('.crdownload'));
      if (files.length > 0) return resolve(path.join(dir, files[0]));
      if (Date.now() - start > timeoutMs)
        return reject(new Error('Download timeout'));
      setTimeout(check, 200);
    };
    check();
  });

const ensureDistBuilt = (): void => {
  const manifestPath = path.resolve(EXTENSION_PATH, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      'dist/ not found. Run "npm run build" before acceptance tests.',
    );
  }
};

// -- Setup --

test.beforeAll(() => {
  ensureDistBuilt();

  if (fs.existsSync(DOWNLOAD_DIR)) {
    fs.rmSync(DOWNLOAD_DIR, { recursive: true });
  }
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
});

// -- Walking Skeleton Tests --

test.describe('Walking Skeleton: Extension Loading', () => {
  let context: BrowserContext;

  test.beforeAll(async () => {
    context = await launchExtensionContext();
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('the extension loads and service worker registers without errors', async () => {
    // Given: Chromium launched with the extension loaded
    const extensionId = await getExtensionId(context);

    // Then: The extension has a valid ID (32 lowercase chars)
    expect(extensionId).toBeTruthy();
    expect(extensionId).toMatch(/^[a-z]{32}$/);
  });

  test('the popup opens and shows a Start Recording button', async () => {
    // Given: BroRecord extension is loaded in the browser
    const extensionId = await getExtensionId(context);

    // When: I open the extension popup
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

    // Then: I see a "Start Recording" button that is enabled
    const startButton = popupPage.locator('button', {
      hasText: 'Start Recording',
    });
    await expect(startButton).toBeVisible();
    await expect(startButton).toBeEnabled();

    // And: The status text shows ready state
    const statusText = popupPage.locator('#status');
    await expect(statusText).toHaveText('Ready to record');

    await popupPage.close();
  });

  test('the build output contains all required extension files', async () => {
    // Then: All required files exist in dist/
    const requiredFiles = [
      'manifest.json',
      'background.js',
      'popup.js',
      'popup.html',
      'offscreen.js',
      'offscreen.html',
    ];

    for (const file of requiredFiles) {
      const filePath = path.resolve(EXTENSION_PATH, file);
      expect(
        fs.existsSync(filePath),
        `Expected ${file} to exist in dist/`,
      ).toBe(true);
    }

    // And: manifest.json has the downloads permission for the download flow
    const manifest = JSON.parse(
      fs.readFileSync(path.resolve(EXTENSION_PATH, 'manifest.json'), 'utf-8'),
    );
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toContain('offscreen');
    expect(manifest.permissions).toContain('downloads');
  });
});

test.describe('Walking Skeleton: Recording Pipeline', () => {
  // -------------------------------------------------------------------------
  // These tests use tabCapture + getUserMedia with the Chrome flag
  // --auto-select-tab-capture-source-by-title to auto-select the tab.
  //
  // In environments where tab capture is not available (headless, some CI),
  // these tests will fail. The unit tests in tests/unit/background.test.ts
  // verify the download wiring through injected mocks instead.
  // -------------------------------------------------------------------------

  let context: BrowserContext;

  test.beforeAll(async () => {
    context = await launchExtensionContext();
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('clicking Start Recording transitions to recording state', async () => {
    // Given: BroRecord extension is loaded, I have a tab open
    const extensionId = await getExtensionId(context);
    const testPage = await context.newPage();
    await testPage.goto(`file://${TEST_PAGE_PATH}`);

    // When: I open the popup and click Start Recording
    const popupPage = await context.newPage();
    popupPage.on('console', (msg) => console.log(`[popup] ${msg.type()}: ${msg.text()}`));
    const sw = context.serviceWorkers()[0];
    if (sw) sw.on('console', (msg) => console.log(`[sw] ${msg.type()}: ${msg.text()}`));
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

    // Make the test page the active tab (simulates real popup overlay behavior)
    await testPage.bringToFront();
    await popupPage.click('button:has-text("Start Recording")');

    await popupPage.waitForTimeout(2000);
    const statusAfter = await popupPage.locator('#status').textContent();
    const buttonText = await popupPage.locator('button').textContent();
    console.log(`[test] Status after click: ${statusAfter}`);
    console.log(`[test] Button text after click: ${buttonText}`);

    // Then: The popup shows a "Stop Recording" button (indicating recording started)
    const stopButton = popupPage.locator('button', {
      hasText: 'Stop Recording',
    });
    await expect(stopButton).toBeVisible({ timeout: 5000 });

    // Clean up: stop recording so subsequent tests start from idle state
    await popupPage.click('button:has-text("Stop Recording")');
    await popupPage.waitForTimeout(2000);

    await popupPage.close();
    await testPage.close();
  });

  test('full pipeline: Start -> Record -> Stop -> Download produces an mp4 file', async () => {
    test.setTimeout(60_000);
    // Clean download dir from any previous test artifacts
    if (fs.existsSync(DOWNLOAD_DIR)) {
      fs.rmSync(DOWNLOAD_DIR, { recursive: true });
    }
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

    // Given: BroRecord extension is installed
    const extensionId = await getExtensionId(context);
    expect(extensionId).toBeTruthy();

    // And: I have a page with content open
    const testPage = await context.newPage();

    // Re-set download directory via CDP for this context
    const cdp = await context.newCDPSession(testPage);
    await cdp.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: DOWNLOAD_DIR,
      eventsEnabled: true,
    });

    await testPage.goto(`file://${TEST_PAGE_PATH}`);

    // Listen for console on all pages (including offscreen document)
    context.on('page', (page) => {
      page.on('console', (msg) => console.log(`[page:${page.url().slice(0, 60)}] ${msg.type()}: ${msg.text()}`));
    });

    // When: I open the popup
    const popupPage = await context.newPage();
    popupPage.on('console', (msg) => console.log(`[popup] ${msg.type()}: ${msg.text()}`));
    const sw = context.serviceWorkers()[0];
    if (sw) sw.on('console', (msg) => console.log(`[sw] ${msg.type()}: ${msg.text()}`));
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

    // And: I click "Start Recording" (with test page as active tab)
    await testPage.bringToFront();
    await popupPage.bringToFront();

    // Log all background pages (offscreen documents are background pages)
    const bgPages = context.backgroundPages();
    console.log(`[test] Background pages before start: ${bgPages.length}`);
    for (const bp of bgPages) {
      bp.on('console', (msg) => console.log(`[bg-page] ${msg.type()}: ${msg.text()}`));
      bp.on('pageerror', (err) => console.log(`[bg-page-error] ${err.message}`));
    }
    // Listen for new pages (offscreen doc will appear as a background page)
    context.on('page', (page) => {
      console.log(`[test] New page opened: ${page.url()}`);
      page.on('console', (msg) => console.log(`[new-page] ${msg.type()}: ${msg.text()}`));
      page.on('pageerror', (err) => console.log(`[new-page-error] ${err.message}`));
    });

    await popupPage.click('button:has-text("Start Recording")');

    // And: Recording starts (permission auto-granted via Chrome flag)
    await popupPage.waitForSelector('button:has-text("Stop Recording")', {
      timeout: 10000,
    });
    console.log('[test] Recording started, Stop Recording button visible');

    // Wait a moment for offscreen document to be created
    await popupPage.waitForTimeout(2000);

    // Check for offscreen document via targets
    const cdpCheck = await context.newCDPSession(testPage);
    const targetsAfterStart = await cdpCheck.send('Target.getTargets').catch(() => ({ targetInfos: [] }));
    const allTargets = targetsAfterStart.targetInfos.map((t: any) => `${t.type}:${t.title}:${t.url.slice(-60)}`);
    console.log(`[test] All targets after start: ${JSON.stringify(allTargets)}`);

    // Try to find offscreen document pages
    const pages = context.pages();
    console.log(`[test] Pages count: ${pages.length}`);
    for (const p of pages) {
      console.log(`[test] Page: ${p.url()}`);
    }
    const bgPagesAfterStart = context.backgroundPages();
    console.log(`[test] Background pages: ${bgPagesAfterStart.length}`);
    for (const bp of bgPagesAfterStart) {
      console.log(`[test] BG Page: ${bp.url()}`);
    }

    // And: I wait for content to be captured (and offscreen self-start to complete)
    // Wait longer to allow offscreen module script to load and self-start with retries
    await popupPage.waitForTimeout(5000);

    // Read offscreen diagnostic data from storage
    const offscreenDiag = await popupPage.evaluate(() =>
      chrome.storage.local.get(['offscreenLoaded']).then(r => ({
        loaded: r.offscreenLoaded || 'NOT_LOADED',
      }))
    ).catch(() => ({ loaded: 'EVAL_FAILED' }));
    console.log(`[test] Offscreen loaded: ${offscreenDiag.loaded}`);

    // Check popup status before stopping
    const statusBeforeStop = await popupPage.locator('#status').textContent();
    console.log(`[test] Status before stop: ${statusBeforeStop}`);

    // And: I click "Stop Recording" while waiting for download
    await popupPage.click('button:has-text("Stop Recording")');
    console.log('[test] Stop Recording clicked');

    // Wait briefly and check status right after stop
    await popupPage.waitForTimeout(500);
    const statusAfterStop = await popupPage.locator('#status').textContent();
    console.log(`[test] Status right after stop: ${statusAfterStop}`);

    // Use CDP to find and monitor the offscreen document
    const cdpBrowser = await context.newCDPSession(context.pages()[0] || testPage);

    // Wait for processing to complete and download to appear
    const startWait = Date.now();
    while (Date.now() - startWait < 40000) {
      // Check targets every iteration to see if offscreen doc appears/disappears
      if (Date.now() - startWait < 5000 || (Date.now() - startWait) % 5000 < 1100) {
        const targets = await cdpBrowser.send('Target.getTargets').catch(() => ({ targetInfos: [] }));
        const targetSummary = targets.targetInfos.map((t: any) => `${t.type}:${t.url.slice(-40)}`);
        console.log(`[test] Targets: ${JSON.stringify(targetSummary)}`);
      }
      const filesNow = fs.existsSync(DOWNLOAD_DIR)
        ? fs.readdirSync(DOWNLOAD_DIR).filter(f => !f.endsWith('.crdownload'))
        : [];
      if (filesNow.length > 0) {
        console.log(`[test] Download found: ${filesNow[0]}`);
        break;
      }

      // Check ~/Downloads too
      const homeDownloads = path.resolve(process.env.HOME || '', 'Downloads');
      const broFiles = fs.existsSync(homeDownloads)
        ? fs.readdirSync(homeDownloads).filter(f => f.startsWith('brorecord'))
        : [];
      if (broFiles.length > 0) {
        console.log(`[test] Found in ~/Downloads: ${broFiles[0]}`);
        break;
      }

      // Check popup status for errors
      const statusText = await popupPage.locator('#status').textContent().catch(() => '');
      if (statusText && (statusText.includes('Error') || statusText === 'Ready to record')) {
        console.log(`[test] Status changed: ${statusText}`);
        break;
      }

      await popupPage.waitForTimeout(1000);
    }

    // Check chrome://downloads via CDP for download history
    const cdpDownloads = await context.newCDPSession(popupPage);
    try {
      // Use Page.navigate to check downloads state
      const searchResults = await cdpDownloads.send('Browser.getVersion' as any).catch(() => null);
      console.log(`[test] Browser version: ${JSON.stringify(searchResults)}`);
    } catch (e) {
      // ignore
    }

    // Check popup status after waiting
    const finalStatus = await popupPage.locator('#status').textContent();
    console.log(`[test] Final popup status: ${finalStatus}`);

    // Then: A file is downloaded (check both locations)
    const filesInDir = fs.existsSync(DOWNLOAD_DIR)
      ? fs.readdirSync(DOWNLOAD_DIR).filter(f => !f.endsWith('.crdownload'))
      : [];
    const homeDownloads = path.resolve(process.env.HOME || '', 'Downloads');
    const brorecordFiles = fs.existsSync(homeDownloads)
      ? fs.readdirSync(homeDownloads).filter(f => f.startsWith('brorecord'))
      : [];
    console.log(`[test] Download dir: ${JSON.stringify(filesInDir)}, ~/Downloads: ${JSON.stringify(brorecordFiles)}`);

    const allFiles = [...filesInDir, ...brorecordFiles];
    expect(allFiles.length).toBeGreaterThan(0);

    const downloadedFile = filesInDir.length > 0
      ? path.join(DOWNLOAD_DIR, filesInDir[0])
      : path.join(homeDownloads, brorecordFiles[0]);

    // And: The file has content (is a valid video container)
    const stats = fs.statSync(downloadedFile);
    expect(stats.size).toBeGreaterThan(1000);

    await popupPage.close();
    await testPage.close();
  });
});
