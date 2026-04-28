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

// -- Milestone 2: Mp4 Output --
// @skip — activate after Walking Skeleton passes

test.describe('Milestone 2: Mp4 Output', () => {
  test.beforeEach(({ context }) => {
    attachNetworkRecorder(context);
  });

  test.afterEach(({ context }) => {
    assertZeroExternalNetwork(context);
  });

  test.skip('Given I complete a recording, the downloaded file is mp4', async ({
    context,
  }) => {
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

  test.skip('Given mp4 muxing fails, the file is saved as WebM with a notice', async ({
    context,
  }) => {
    // This test requires simulating mp4-mux failure.
    // Strategy: inject a broken mp4-mux mock or test with corrupted stream data.

    // Given: Mp4 muxing will fail for this recording
    // (test setup would need to trigger this condition)

    // When: I complete a recording
    const extensionId = await getExtensionId(context);
    const testPage = await context.newPage();
    await testPage.goto(`file://${TEST_PAGE_PATH}`);

    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await popupPage.click('button:has-text("Start Recording")');
    await popupPage.waitForSelector('button:has-text("Stop Recording")', { timeout: 5000 });
    await popupPage.waitForTimeout(2000);
    await popupPage.click('button:has-text("Stop Recording")');

    // Then: A .webm file is downloaded instead
    const downloadedFile = await waitForDownload(DOWNLOAD_DIR);
    expect(downloadedFile).toMatch(/\.webm$/);

    // And: The popup shows a fallback message
    const fallbackMessage = popupPage.locator('[data-testid="fallback-notice"]');
    await expect(fallbackMessage).toBeVisible({ timeout: 5000 });
  });
});
