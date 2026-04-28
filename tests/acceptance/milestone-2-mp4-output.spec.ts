import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  attachNetworkRecorder,
  assertZeroExternalNetwork,
} from './fixtures/no-network';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXTENSION_PATH = path.resolve(__dirname, '../../dist');
const DOWNLOAD_DIR = path.resolve(__dirname, '../downloads');
const TEST_PAGE_PATH = path.resolve(__dirname, '../fixtures/test-page.html');

const getExtensionId = async (context: BrowserContext): Promise<string> => {
  let [background] = context.serviceWorkers();
  if (!background) {
    background = await context.waitForEvent('serviceworker');
  }
  return background.url().split('/')[2];
};

const launchExtensionContext = async (): Promise<BrowserContext> => {
  const userDataDir = path.resolve(__dirname, '../.tmp-profile-m2');
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
      const files = fs.readdirSync(dir).filter(f => !f.endsWith('.crdownload'));
      if (files.length > 0) return resolve(path.join(dir, files[0]));
      if (Date.now() - start > timeoutMs) return reject(new Error('Download timeout'));
      setTimeout(check, 200);
    };
    check();
  });

test.beforeAll(() => {
  if (fs.existsSync(DOWNLOAD_DIR)) {
    fs.rmSync(DOWNLOAD_DIR, { recursive: true });
  }
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
});

// -- Milestone 2: Mp4 Output --

test.describe('Milestone 2: Mp4 Output', () => {
  let context: BrowserContext;

  test.beforeAll(async () => {
    context = await launchExtensionContext();
    attachNetworkRecorder(context);
  });

  test.afterEach(() => {
    assertZeroExternalNetwork(context);
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test.skip('Given I complete a recording, the downloaded file is mp4', async () => {
    // Given: Extension loaded, recording completed
    const extensionId = await getExtensionId(context);
    const testPage = await context.newPage();
    await testPage.goto(`file://${TEST_PAGE_PATH}`);

    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await popupPage.click('button:has-text("Start Recording")');
    await popupPage.waitForSelector('button:has-text("Stop Recording")', { timeout: 5000 });
    await popupPage.waitForTimeout(3000);
    await popupPage.click('button:has-text("Stop Recording")');

    // When: The file is downloaded
    const downloadedFile = await waitForDownload(DOWNLOAD_DIR);

    // Then: The file has an .mp4 extension
    expect(downloadedFile).toMatch(/\.mp4$/);

    // And: The file starts with an mp4 signature (ftyp box)
    const buffer = fs.readFileSync(downloadedFile);
    const ftypSignature = buffer.toString('ascii', 4, 8);
    expect(ftypSignature).toBe('ftyp');
  });

  test('Given mp4 muxing fails, the file is saved as WebM with a notice', async () => {
    test.setTimeout(60_000);

    // Clean download dir before this test to avoid picking up the mp4 from the
    // first test in this describe block.
    if (fs.existsSync(DOWNLOAD_DIR)) {
      fs.rmSync(DOWNLOAD_DIR, { recursive: true });
    }
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

    const extensionId = await getExtensionId(context);
    const testPage = await context.newPage();
    await testPage.goto(`file://${TEST_PAGE_PATH}`);

    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

    // Given: Set the forceWebmFallback flag in extension storage so the SW
    // appends ?forceWebmFallback=1 to the offscreen document URL.
    // This causes the offscreen document to throw during MP4 muxing while
    // still recovering the pre-recorded WebM blob via the webmFallback path.
    await popupPage.evaluate(() => {
      return chrome.storage.local.set({ forceWebmFallback: true });
    });

    // When: I complete a recording
    await popupPage.click('button:has-text("Start Recording")');
    await popupPage.waitForSelector('button:has-text("Stop Recording")', { timeout: 5000 });
    await popupPage.waitForTimeout(2000);
    await popupPage.click('button:has-text("Stop Recording")');

    // Then: A .webm file is downloaded instead of mp4
    const downloadedFile = await waitForDownload(DOWNLOAD_DIR);
    expect(downloadedFile).toMatch(/\.webm$/);

    // And: The popup shows a fallback notice element
    const fallbackMessage = popupPage.locator('[data-testid="fallback-notice"]');
    await expect(fallbackMessage).toBeVisible({ timeout: 5000 });
  });
});
