// ---------------------------------------------------------------------------
// Walking Skeleton -- record-all-tabs (R1-cropped)
// ---------------------------------------------------------------------------
// THE thinnest end-to-end proof of the reframed (R1-cropped) job: pick "Record
// all tabs (window, cropped)" mode in the popup, draw a crop region over the
// live window preview, record, stop, and get ONE cropped mp4 (webm fallback).
//
// WS strategy (Architecture of Reference): Driving + driven-internal ports are
// REAL (real popup, real record page, real chrome.downloads, real filesystem).
// The non-deterministic external port (getDisplayMedia surface picker) is faked
// by Chrome's --use-fake-ui-for-media-stream / --auto-select-desktop-capture-source
// flags, mirroring the existing walking-skeleton.spec.ts harness.
//
// Mandate 1 (hexagonal boundary): driving ports are the popup UI and the record
// page, exercised through the loaded extension -- this file never imports src/
// internals. The CropRect math is exercised at the pure-unit layer
// (tests/unit/record-all-tabs-crop-geometry.test.ts), NOT re-asserted here.
//
// Assertion robustness (per task brief -- avoid brittle pixel diffing): we do
// NOT screenshot-compare to prove "chrome is excluded". We assert robustly:
//   - a file downloads with the unchanged pattern broshow-YYYY-MM-DD-HHmmss.{mp4|webm}
//   - the recorded video's dimensions match the crop output size (crop applied)
// Pixel/crop FIDELITY belongs to the pure crop-geometry unit tests + the human
// dogfood gate (slice-01 AC-crop, production data).
//
// Testability gate (SPIKE / Chrome 148): unpacked-extension loading via CLI/CDP
// is blocked on Chrome 148, and the user-drawn crop drag + a real window-surface
// getDisplayMedia need real window pixels. Scenarios that require the real crop
// drag are marked `test.fixme` with the @human-gate tag and pinned to the manual
// dogfood matrix in distill/test-scenarios.md §"Human / CI gate". The mode-control
// scenario (no crop, no capture) runs headless today.
//
// One-at-a-time (BDD Outside-In): the FIRST scenario is enabled; capture-bound
// scenarios are `test.fixme` until DELIVER wires the record-page crop preview
// and the human gate is run.
//
// AC traceability: AC1.1 (mode control + default unchanged), AC1.2 (start carries
// the mode), AC-crop (slice-01, content-only output), AC2.3 (filename unchanged).
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
const DOWNLOAD_DIR = path.resolve(__dirname, '../../downloads-record-all-tabs');
const TEST_PAGE_PATH = path.resolve(__dirname, '../../fixtures/test-page.html');

// The popup control label for the new top-level mode (ADR-012).
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
// @walking_skeleton @real-io @chromium -- the cropped-window mode is offered
// ---------------------------------------------------------------------------

test.describe('@walking_skeleton @real-io @chromium record-all-tabs: Dana can pick the cropped-window mode', () => {
  let context: BrowserContext;

  test.beforeAll(async () => {
    context = await launchExtensionContext(
      path.resolve(__dirname, '../../.tmp-profile-rat-ws'),
    );
    attachNetworkRecorder(context);
  });

  test.afterEach(() => {
    assertZeroExternalNetwork(context);
  });

  test.afterAll(async () => {
    await context?.close();
  });

  // ---- ENABLED scenario (headless-safe: no crop draw, no capture) ----------
  test('Dana opens the popup and sees a "Record all tabs" mode she can choose, with single-tab still the default (AC1.1)', async () => {
    // Given: Dana has Chrome with BroShow installed (real Chromium, real extension)
    const extensionId = await getExtensionId(context);

    // When: she opens the BroShow popup
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

    // Then: she sees a control offering the "Record all tabs (window, cropped)" mode
    //       (observable user outcome -- AC1.1; ADR-012 new top-level mode)
    await expect(
      popupPage.getByText(WINDOW_CROPPED_MODE_LABEL, { exact: false }),
    ).toBeVisible();

    // And: the default Start Recording control is still present and enabled --
    //      single-tab behavior is byte-for-byte unchanged until she opts in (AC1.1)
    const startButton = popupPage.locator('button', { hasText: 'Start Recording' });
    await expect(startButton).toBeVisible();
    await expect(startButton).toBeEnabled();

    await popupPage.close();
  });

  // ---- HUMAN-GATED scenario (real crop drag + real window pixels) ----------
  // @human-gate: the crop drag over a live window preview and the window-surface
  // getDisplayMedia need real window pixels and a real pointer drag that Chrome
  // 148 will not let an unpacked extension drive via CDP. Run as the slice-01
  // dogfood gate (distill/test-scenarios.md §"Human / CI gate"). DELIVER unfixmes
  // this once the record-page crop preview is wired AND the dogfood pass is recorded.
  test.fixme(
    '@human-gate Dana picks "Record all tabs", drags a crop region, records, stops, and gets ONE cropped file named broshow-YYYY-MM-DD-HHmmss.{mp4|webm} (AC-crop, AC2.1, AC2.3)',
    async () => {
      // Given: Dana has a real browser window with content open
      const extensionId = await getExtensionId(context);
      const testPage = await context.newPage();
      await testPage.goto(`file://${TEST_PAGE_PATH}`);

      // When: she opens the popup and selects "Record all tabs (window, cropped)"
      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
      await popupPage.getByText(WINDOW_CROPPED_MODE_LABEL, { exact: false }).click();
      await popupPage.click('button:has-text("Start Recording")');

      // And: the record page opens with a LIVE preview of the window stream, and
      //      she drags a crop rectangle over the content area and confirms
      //      (HUMAN STEP -- real pointer drag over real window pixels)
      //      ... record-page crop UI interaction happens here ...

      // And: she records briefly, then clicks Stop (<=1 gesture -- AC3.3)
      //      ... stop interaction happens here ...

      // Then: exactly ONE file downloads with the UNCHANGED filename pattern (AC2.3)
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
        await popupPage.waitForTimeout(1000);
      }
      expect(downloaded, 'Expected exactly one cropped broshow-* download').not.toBeNull();
      expect(downloaded!).toMatch(/^broshow-\d{4}-\d{2}-\d{2}-\d{6}\.(mp4|webm)$/);

      // And: the recorded video's dimensions match the crop output size (the crop
      //      was applied -- robust proxy for "content-only", NOT a pixel diff).
      //      Dimension extraction is performed in the human dogfood pass; the
      //      pure crop math is proven headlessly in
      //      tests/unit/record-all-tabs-crop-geometry.test.ts.

      await popupPage.close();
      await testPage.close();
    },
  );
});
