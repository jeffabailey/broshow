// ---------------------------------------------------------------------------
// Milestone 1 -- record-all-tabs (R1-cropped), slice-01
// ---------------------------------------------------------------------------
// First R1-cropped end-to-end proof beyond the walking skeleton: the
// cropped-window record flow, crop fidelity (content-only), filename parity, and
// the regression guard that the two shipped modes (single-tab Chromium,
// desktop-screen) are byte-for-byte unchanged (QA-1, AC1.1).
//
// Slice-01 ACs covered: AC1.1, AC1.2 (mode control + getDisplayMedia window
// acquisition), AC-crop (downloaded video shows ONLY the user-drawn region),
// AC2.3 (filename/path unchanged), regression (existing modes unchanged).
//
// Real-browser vs pure-seam split:
//   - Crop FIDELITY (math) -> pure unit tests (record-all-tabs-crop-geometry).
//   - Crop fidelity (real pixels), getDisplayMedia(window), canvas compositor
//     -> headed E2E / human dogfood gate (@human-gate), because Chrome 148 blocks
//     CLI/CDP unpacked-extension capture and the crop needs real window pixels.
//   - Mode control visibility + single-tab regression -> headless-safe E2E.
//
// One-at-a-time: the regression-guard scenario (single-tab still records) is
// ENABLED; capture-bound and crop-fidelity scenarios are `test.fixme @human-gate`.
//
// Mandate 1: driving ports = popup UI + record page via the loaded extension.
// No src/ imports. Assertion robustness: file pattern + recorded dimensions,
// never screenshot pixel diffs (per task brief).
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
const DOWNLOAD_DIR = path.resolve(__dirname, '../../downloads-record-all-tabs-m1');
const TEST_PAGE_PATH = path.resolve(__dirname, '../../fixtures/test-page.html');

const WINDOW_CROPPED_MODE_LABEL = 'Record all tabs';

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

const launchExtensionContext = async (userDataDir: string): Promise<BrowserContext> => {
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
// REGRESSION GUARD (QA-1, AC1.1) -- ENABLED, headless-safe
// ---------------------------------------------------------------------------

test.describe('@real-io @chromium @regression record-all-tabs M1: shipped single-tab mode is unchanged', () => {
  let context: BrowserContext;

  test.beforeAll(async () => {
    context = await launchExtensionContext(
      path.resolve(__dirname, '../../.tmp-profile-rat-m1-reg'),
    );
    attachNetworkRecorder(context);
  });

  test.afterEach(() => {
    assertZeroExternalNetwork(context);
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('Dana, who never touches the new mode control, still records a single tab end-to-end and gets a broshow-* file (AC1.1 byte-for-byte regression)', async () => {
    test.setTimeout(60_000);

    // Given: Dana has the extension, a content tab, and never selects the new mode
    const extensionId = await getExtensionId(context);
    const testPage = await context.newPage();
    const cdp = await context.newCDPSession(testPage);
    await cdp.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: DOWNLOAD_DIR,
      eventsEnabled: true,
    });
    await testPage.goto(`file://${TEST_PAGE_PATH}`);

    // When: she opens the popup and clicks Start Recording (default single-tab path)
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await testPage.bringToFront();
    await popupPage.click('button:has-text("Start Recording")');

    // Then: the single-tab path behaves exactly as before -- Stop appears
    await expect(popupPage.locator('button', { hasText: 'Stop Recording' })).toBeVisible({
      timeout: 10_000,
    });

    // And: a file downloads with the unchanged filename pattern
    await popupPage.waitForTimeout(3000);
    await popupPage.click('button:has-text("Stop Recording")');

    const startWait = Date.now();
    let downloaded: string | null = null;
    while (Date.now() - startWait < 40_000) {
      const files = fs.existsSync(DOWNLOAD_DIR)
        ? fs.readdirSync(DOWNLOAD_DIR).filter((f) => !f.endsWith('.crdownload'))
        : [];
      if (files.length > 0) {
        downloaded = files[0];
        break;
      }
      const home = path.resolve(process.env.HOME || '', 'Downloads');
      const broshow = fs.existsSync(home)
        ? fs.readdirSync(home).filter((f) => f.startsWith('broshow'))
        : [];
      if (broshow.length > 0) {
        downloaded = broshow[0];
        break;
      }
      await popupPage.waitForTimeout(1000);
    }
    expect(downloaded, 'single-tab regression must still produce a download').not.toBeNull();
    expect(downloaded!).toMatch(/^broshow-\d{4}-\d{2}-\d{2}-\d{6}\.(mp4|webm)$/);

    await popupPage.close();
    await testPage.close();
  });
});

// ---------------------------------------------------------------------------
// CROPPED-WINDOW RECORD FLOW (AC1.2, AC-crop, AC2.3) -- human-gated
// ---------------------------------------------------------------------------

test.describe('@real-io @chromium record-all-tabs M1: cropped-window record flow', () => {
  let context: BrowserContext;

  test.beforeAll(async () => {
    context = await launchExtensionContext(
      path.resolve(__dirname, '../../.tmp-profile-rat-m1-crop'),
    );
    attachNetworkRecorder(context);
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('selecting "Record all tabs" then Start opens the record page that owns the window-surface getDisplayMedia gesture (AC1.2)', async () => {
    // Given: Dana selects the cropped-window mode in the popup
    const extensionId = await getExtensionId(context);
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

    // When: she chooses "Record all tabs" and clicks Start
    await popupPage.getByText(WINDOW_CROPPED_MODE_LABEL, { exact: false }).click();

    // Then: the popup routes to the record page (gesture + preview owner). This
    //       scenario pins the ROUTING observable (a record-page window opens),
    //       which is automatable; the getDisplayMedia grant + crop draw are the
    //       human-gated step below. Enabled by DELIVER 02-01 (routing wired).
    const recordPagePromise = context.waitForEvent('page', { timeout: 5000 });
    await popupPage.click('button:has-text("Start Recording")');
    const recordPage = await recordPagePromise;
    expect(recordPage.url()).toContain('record.html');
    await popupPage.close();
  });

  // @human-gate -- real crop drag + real window pixels (Chrome 148 / SPIKE).
  test.fixme(
    '@human-gate AC-crop: the downloaded video shows ONLY the user-drawn region -- no tab strip, toolbar, or other windows (production data, slice-01 dogfood)',
    async () => {
      // Given: Dana selects "Record all tabs", drags a crop box over the content
      //        area of a REAL browser window, and confirms (HUMAN STEP).
      // When:  she records a brief clip and stops.
      // Then:  the downloaded mp4's frame dimensions equal the crop output size
      //        (robust crop proxy) AND a human reviewer confirms, on production
      //        data, that no chrome is visible (recorded in the dogfood matrix --
      //        distill/test-scenarios.md §"Human / CI gate"). NOT a pixel diff.
      expect(true).toBe(true); // placeholder body; real steps run in the human gate
    },
  );

  test.fixme(
    '@human-gate AC2.3: the cropped-window recording downloads exactly ONE file named broshow-YYYY-MM-DD-HHmmss.{mp4|webm}',
    async () => {
      // Given/When: a complete cropped-window record + stop (human-gated capture).
      // Then: exactly one file, filename pattern unchanged from single-tab.
      const files = fs.existsSync(DOWNLOAD_DIR)
        ? fs.readdirSync(DOWNLOAD_DIR).filter((f) => !f.endsWith('.crdownload'))
        : [];
      expect(files.length).toBe(1);
      expect(files[0]).toMatch(/^broshow-\d{4}-\d{2}-\d{2}-\d{6}\.(mp4|webm)$/);
    },
  );

  // --- ERROR PATH (AC2.4) -- compositor / capture cannot start --------------
  test.fixme(
    '@human-gate @error AC2.4: if the window stream cannot be acquired (user cancels the surface picker), BroShow surfaces a visible notice and never silently records the wrong surface',
    async () => {
      // Given: Dana selects "Record all tabs" and Start, then CANCELS the
      //        getDisplayMedia surface picker (human step, real picker).
      // Then:  the record page shows a visible "getDisplayMedia rejected" / picker
      //        notice and returns to idle -- no file is produced, nothing is
      //        silently captured. (record.ts already surfaces this for the
      //        Firefox path; the cropped-window path reuses it.)
      expect(true).toBe(true); // placeholder; real cancel runs in the human gate
    },
  );
});
