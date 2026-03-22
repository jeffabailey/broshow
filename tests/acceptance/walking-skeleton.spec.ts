import { test, expect, type BrowserContext } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// -- Fixtures --

const EXTENSION_PATH = path.resolve(__dirname, '../../dist');
const DOWNLOAD_DIR = path.resolve(__dirname, '../downloads');
const TEST_PAGE_PATH = path.resolve(__dirname, '../fixtures/test-page.html');

// -- Helpers --

const getExtensionId = async (context: BrowserContext): Promise<string> => {
  // In Chromium, the extension ID can be found via service worker URL
  let [background] = context.serviceWorkers();
  if (!background) {
    background = await context.waitForEvent('serviceworker');
  }
  const extensionId = background.url().split('/')[2];
  return extensionId;
};

const waitForDownload = (dir: string, timeoutMs = 10000): Promise<string> =>
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

// -- Setup --

test.beforeAll(() => {
  if (fs.existsSync(DOWNLOAD_DIR)) {
    fs.rmSync(DOWNLOAD_DIR, { recursive: true });
  }
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
});

// -- Walking Skeleton Tests --

test.describe('Walking Skeleton: Tab Recording Pipeline', () => {
  // Note: These tests require launching Chromium with the extension loaded.
  // Playwright needs to use chromium.launchPersistentContext with extension args.
  // The actual test runner config handles this (see playwright.config.ts).

  test.skip('Given the extension is installed, the popup shows a Start Recording button', async ({
    context,
  }) => {
    // Given: BroRecord extension is loaded in the browser
    const extensionId = await getExtensionId(context);

    // When: I open the extension popup
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

    // Then: I see a "Start Recording" button
    const startButton = popupPage.locator('button', { hasText: 'Start Recording' });
    await expect(startButton).toBeVisible();
  });

  test.skip('Given I click Start Recording and grant permission, recording begins', async ({
    context,
  }) => {
    // Given: BroRecord extension is loaded, I have a tab open
    const extensionId = await getExtensionId(context);
    const testPage = await context.newPage();
    await testPage.goto(`file://${TEST_PAGE_PATH}`);

    // When: I open the popup and click Start Recording
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await popupPage.click('button:has-text("Start Recording")');

    // Then: The popup shows a "Stop Recording" button (indicating recording started)
    const stopButton = popupPage.locator('button', { hasText: 'Stop Recording' });
    await expect(stopButton).toBeVisible({ timeout: 5000 });
  });

  test.skip('Given I am recording, when I click Stop, a file is downloaded', async ({
    context,
  }) => {
    // Given: Extension loaded, recording started
    const extensionId = await getExtensionId(context);
    const testPage = await context.newPage();
    await testPage.goto(`file://${TEST_PAGE_PATH}`);

    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await popupPage.click('button:has-text("Start Recording")');
    await popupPage.waitForSelector('button:has-text("Stop Recording")', { timeout: 5000 });

    // When: I wait a moment then click Stop Recording
    await popupPage.waitForTimeout(3000);
    await popupPage.click('button:has-text("Stop Recording")');

    // Then: A video file is downloaded
    const downloadedFile = await waitForDownload(DOWNLOAD_DIR);
    expect(fs.existsSync(downloadedFile)).toBe(true);

    const stats = fs.statSync(downloadedFile);
    expect(stats.size).toBeGreaterThan(0);
  });

  test.skip('End-to-end: Install → Start → Record → Stop → Download', async ({
    context,
  }) => {
    // Given: BroRecord extension is installed in a Chromium browser
    const extensionId = await getExtensionId(context);
    expect(extensionId).toBeTruthy();

    // And: I have a page with content open
    const testPage = await context.newPage();
    await testPage.goto(`file://${TEST_PAGE_PATH}`);

    // When: I open the popup
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

    // And: I click "Start Recording"
    await popupPage.click('button:has-text("Start Recording")');

    // And: Recording starts (permission auto-granted via Chrome flag)
    await popupPage.waitForSelector('button:has-text("Stop Recording")', { timeout: 5000 });

    // And: I wait 5 seconds for content to be captured
    await popupPage.waitForTimeout(5000);

    // And: I click "Stop Recording"
    await popupPage.click('button:has-text("Stop Recording")');

    // Then: A file is downloaded
    const downloadedFile = await waitForDownload(DOWNLOAD_DIR);
    expect(fs.existsSync(downloadedFile)).toBe(true);

    // And: The file has content (is a valid video container)
    const stats = fs.statSync(downloadedFile);
    expect(stats.size).toBeGreaterThan(1000); // At least 1KB of video data
  });
});
