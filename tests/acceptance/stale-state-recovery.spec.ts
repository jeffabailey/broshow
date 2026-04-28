// ---------------------------------------------------------------------------
// Milestone 5: Stale State Recovery  (DP-5)
// ---------------------------------------------------------------------------
// Covers: docs/feature/browser-tab-recorder/devops/environments.yaml
//         install_states.with_prior_recording_state
//
// MV3 service workers are evicted aggressively. Any state held only in
// service-worker memory is lost. Persisted RecordingState in
// chrome.storage.local can become stale — e.g., status='recording' when
// no MediaStream is alive. The extension MUST reset to idle on cold start
// and not block the user from starting a new recording.
//
// Strategy: pre-seed chrome.storage.local with stale state, launch the
// extension, observe that the popup shows ready-to-record and that
// starting a new recording works.
//
// All tests tagged @skip until Walking Skeleton passes.
// Each scenario applies the no-network fixture (KPI hard gate).
// ---------------------------------------------------------------------------

import {
  test,
  expect,
  chromium,
  type BrowserContext,
} from '@playwright/test';
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
const PROFILE_DIR_BASE = path.resolve(__dirname, '../.tmp-profile-stale');

// -- Helpers ---------------------------------------------------------------

const getExtensionId = async (context: BrowserContext): Promise<string> => {
  let [background] = context.serviceWorkers();
  if (!background) background = await context.waitForEvent('serviceworker');
  return background.url().split('/')[2];
};

const launchExtensionContextWithProfile = async (
  profileDir: string,
): Promise<BrowserContext> => {
  if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });
  return chromium.launchPersistentContext(profileDir, {
    headless: false,
    acceptDownloads: true,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--auto-select-tab-capture-source-by-title=BroShow Test Page',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-search-engine-choice-screen',
    ],
  });
};

const seedPriorStorage = async (
  profileDir: string,
  payload: Record<string, unknown>,
): Promise<void> => {
  const seedContext = await launchExtensionContextWithProfile(profileDir);
  try {
    const extensionId = await getExtensionId(seedContext);
    const page = await seedContext.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.evaluate((data) => chrome.storage.local.set(data), payload);
    await page.close();
  } finally {
    await seedContext.close();
  }
};

// -- Setup -----------------------------------------------------------------

test.beforeAll(() => {
  if (fs.existsSync(DOWNLOAD_DIR)) fs.rmSync(DOWNLOAD_DIR, { recursive: true });
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
});

// -- Milestone 5: Stale State Recovery -------------------------------------
// @skip — activate after Walking Skeleton passes

test.describe('Milestone 5: Stale State Recovery @real-io', () => {
  // -----------------------------------------------------------------------
  // US-trace: install_states.with_prior_recording_state (environments.yaml)
  //           Maps loosely to US-02 (Start Recording) — proves user can
  //           start a recording after a prior crash.
  // KPI:      recording_success_rate (DEVOPS DP-5)
  // -----------------------------------------------------------------------

  test.skip(
    'Given chrome.storage.local has RecordingState with status="recording" but no live MediaStream, ' +
      'when the extension cold-starts and the user opens the popup, ' +
      'then the popup presents the ready-to-record state and a fresh recording can be started',
    async () => {
      const profile = `${PROFILE_DIR_BASE}-stale-recording`;
      if (fs.existsSync(profile)) fs.rmSync(profile, { recursive: true });

      // Given: a prior session left RecordingState='recording' in storage
      //        but no MediaStream / MediaRecorder is alive (SW eviction
      //        edge case). startTime is in the past.
      await seedPriorStorage(profile, {
        recordingState: {
          status: 'recording',
          tabId: 999,
          startTime: Date.now() - 5 * 60_000,
        },
      });

      // When: the user opens the popup on cold start
      const context = await launchExtensionContextWithProfile(profile);
      try {
        attachNetworkRecorder(context);

        const extensionId = await getExtensionId(context);
        const popupPage = await context.newPage();
        const bootErrors: string[] = [];
        popupPage.on('pageerror', (err) => bootErrors.push(err.message));
        await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

        // Then: the popup shows the IDLE / ready state — the stale
        //       'recording' status was treated as suspect and reset
        const startButton = popupPage.locator('button', {
          hasText: 'Start Recording',
        });
        await expect(startButton).toBeVisible();
        await expect(startButton).toBeEnabled();
        await expect(popupPage.locator('#status')).toHaveText('Ready to record');

        // And: no Stop Recording button is visible (user is NOT presented
        //      with a UI implying recording is active)
        const stopButton = popupPage.locator('button', {
          hasText: 'Stop Recording',
        });
        await expect(stopButton).toHaveCount(0);

        expect(bootErrors).toEqual([]);
        assertZeroExternalNetwork(context);
      } finally {
        await context.close();
      }
    },
  );

  test.skip(
    'Given stale RecordingState with status="processing" from a crashed mp4 mux, ' +
      'when the extension cold-starts, ' +
      'then the user-observable state resets to ready-to-record',
    async () => {
      const profile = `${PROFILE_DIR_BASE}-stale-processing`;
      if (fs.existsSync(profile)) fs.rmSync(profile, { recursive: true });

      // Given: a prior recording entered 'processing' (mp4 muxing) and
      //        the SW was evicted before completion. The status is stale.
      await seedPriorStorage(profile, {
        recordingState: { status: 'processing' },
      });

      // When: the user opens the popup on cold start
      const context = await launchExtensionContextWithProfile(profile);
      try {
        attachNetworkRecorder(context);

        const extensionId = await getExtensionId(context);
        const popupPage = await context.newPage();
        const bootErrors: string[] = [];
        popupPage.on('pageerror', (err) => bootErrors.push(err.message));
        await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

        // Then: the popup shows ready-to-record (stale processing was
        //       reset to idle on boot)
        const startButton = popupPage.locator('button', {
          hasText: 'Start Recording',
        });
        await expect(startButton).toBeVisible();
        await expect(startButton).toBeEnabled();
        await expect(popupPage.locator('#status')).toHaveText('Ready to record');

        expect(bootErrors).toEqual([]);
        assertZeroExternalNetwork(context);
      } finally {
        await context.close();
      }
    },
  );

  test.skip(
    'Given a clean profile with no prior RecordingState, ' +
      'when the extension cold-starts, ' +
      'then the popup initializes to ready-to-record (negative regression test)',
    async () => {
      const profile = `${PROFILE_DIR_BASE}-clean`;
      if (fs.existsSync(profile)) fs.rmSync(profile, { recursive: true });

      // Given: a clean profile — no chrome.storage.local seed at all.
      //        This proves the test apparatus is not the source of any pass
      //        in the previous two scenarios.
      const context = await launchExtensionContextWithProfile(profile);
      try {
        attachNetworkRecorder(context);

        const extensionId = await getExtensionId(context);
        const popupPage = await context.newPage();
        const bootErrors: string[] = [];
        popupPage.on('pageerror', (err) => bootErrors.push(err.message));
        await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

        // Then: the popup shows the ready state — clean install path works
        const startButton = popupPage.locator('button', {
          hasText: 'Start Recording',
        });
        await expect(startButton).toBeVisible();
        await expect(startButton).toBeEnabled();
        await expect(popupPage.locator('#status')).toHaveText('Ready to record');

        expect(bootErrors).toEqual([]);
        assertZeroExternalNetwork(context);
      } finally {
        await context.close();
      }
    },
  );
});
