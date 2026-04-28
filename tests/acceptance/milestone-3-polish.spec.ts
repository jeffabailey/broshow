import { test, expect, type BrowserContext } from '@playwright/test';
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
const TEST_PAGE_AUDIO_PATH = path.resolve(__dirname, '../fixtures/test-page-audio.html');

const getExtensionId = async (context: BrowserContext): Promise<string> => {
  let [background] = context.serviceWorkers();
  if (!background) {
    background = await context.waitForEvent('serviceworker');
  }
  return background.url().split('/')[2];
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

// -- Milestone 3: Polish --
// @skip — activate after Milestone 2 passes

test.describe('Milestone 3: Polish', () => {
  test.beforeEach(({ context }) => {
    attachNetworkRecorder(context);
  });

  test.afterEach(({ context }) => {
    assertZeroExternalNetwork(context);
  });

  test.skip('Given I start recording, the extension icon shows a recording indicator', async ({
    context,
  }) => {
    // Given: Extension loaded
    const extensionId = await getExtensionId(context);
    const testPage = await context.newPage();
    await testPage.goto(`file://${TEST_PAGE_PATH}`);

    // When: I start recording
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await popupPage.click('button:has-text("Start Recording")');
    await popupPage.waitForSelector('button:has-text("Stop Recording")', { timeout: 5000 });

    // Then: The extension badge shows a recording indicator
    // Note: Badge text/color is verified via chrome.action.getBadgeText in service worker.
    // Playwright can check this via evaluating in the service worker context.
    const background = context.serviceWorkers()[0];
    const badgeText = await background.evaluate(() =>
      chrome.action.getBadgeText({})
    );
    expect(badgeText).toBe('REC');

    // Cleanup
    await popupPage.click('button:has-text("Stop Recording")');
    await waitForDownload(DOWNLOAD_DIR);
  });

  test.skip('Given I stop recording, the recording indicator is removed', async ({
    context,
  }) => {
    // Given: Recording in progress
    const extensionId = await getExtensionId(context);
    const testPage = await context.newPage();
    await testPage.goto(`file://${TEST_PAGE_PATH}`);

    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await popupPage.click('button:has-text("Start Recording")');
    await popupPage.waitForSelector('button:has-text("Stop Recording")', { timeout: 5000 });

    // When: I stop recording
    await popupPage.waitForTimeout(2000);
    await popupPage.click('button:has-text("Stop Recording")');
    await waitForDownload(DOWNLOAD_DIR);

    // Then: The badge is cleared
    const background = context.serviceWorkers()[0];
    const badgeText = await background.evaluate(() =>
      chrome.action.getBadgeText({})
    );
    expect(badgeText).toBe('');
  });

  test.skip('Given the tab is playing audio, the recording includes audio', async ({
    context,
  }) => {
    // Given: A tab playing audio
    const extensionId = await getExtensionId(context);
    const testPage = await context.newPage();
    await testPage.goto(`file://${TEST_PAGE_AUDIO_PATH}`);
    // Trigger audio playback on the test page
    await testPage.click('button#play-audio');

    // When: I record the tab
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await popupPage.click('button:has-text("Start Recording")');
    await popupPage.waitForSelector('button:has-text("Stop Recording")', { timeout: 5000 });
    await popupPage.waitForTimeout(3000);
    await popupPage.click('button:has-text("Stop Recording")');

    // Then: The downloaded file contains an audio track
    const downloadedFile = await waitForDownload(DOWNLOAD_DIR);
    const stats = fs.statSync(downloadedFile);
    // A recording with audio should be notably larger than video-only
    // This is a rough heuristic; proper verification would use ffprobe
    expect(stats.size).toBeGreaterThan(5000);
  });

  test.skip('Given I complete a recording, the filename has the correct format', async ({
    context,
  }) => {
    // Given: Extension loaded
    const extensionId = await getExtensionId(context);
    const testPage = await context.newPage();
    await testPage.goto(`file://${TEST_PAGE_PATH}`);

    // When: I complete a recording
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await popupPage.click('button:has-text("Start Recording")');
    await popupPage.waitForSelector('button:has-text("Stop Recording")', { timeout: 5000 });
    await popupPage.waitForTimeout(2000);
    await popupPage.click('button:has-text("Stop Recording")');

    // Then: The filename matches broshow-YYYY-MM-DD-HHmmss.mp4
    const downloadedFile = await waitForDownload(DOWNLOAD_DIR);
    const filename = path.basename(downloadedFile);
    expect(filename).toMatch(/^broshow-\d{4}-\d{2}-\d{2}-\d{6}\.mp4$/);
  });
});
