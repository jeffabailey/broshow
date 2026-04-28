// ---------------------------------------------------------------------------
// Milestone 4: Upgrade Robustness  (DP-4)
// ---------------------------------------------------------------------------
// Covers: docs/feature/browser-tab-recorder/devops/environments.yaml
//         install_states.upgrade_from_prior_version
//
// Strategy: launch a real Chromium with the extension loaded and a
// pre-seeded `chrome.storage.local` that simulates a prior version's state.
// Assert observable user outcomes (popup loads, Start works, no boot error).
//
// All tests are tagged @skip until Walking Skeleton + Milestones 2/3 pass.
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
const PROFILE_DIR_BASE = path.resolve(__dirname, '../.tmp-profile-upgrade');

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

/**
 * Seed `chrome.storage.local` with a prior-version shape, then close the
 * context. The next launch (with the same profile dir) will see the seeded
 * data — this approximates a real upgrade where storage survives across
 * extension reload but in-memory state does not.
 */
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

// -- Milestone 4: Upgrade Robustness ---------------------------------------
// @skip — activate after Milestones 1-3 pass

test.describe('Milestone 4: Upgrade Robustness @real-io', () => {
  // -----------------------------------------------------------------------
  // US-trace: install_states.upgrade_from_prior_version (environments.yaml)
  //           Maps loosely to US-01 (extension still installs / opens) and
  //           US-02 (recording can be started fresh).
  // KPI:      recording_success_rate (DEVOPS DP-4)
  // -----------------------------------------------------------------------

  test.skip(
    'Given prior version stored a valid idle RecordingState and a LastRecording, ' +
      'when the new version installs over it and the user opens the popup, ' +
      'then the extension does not crash and a fresh recording can be started',
    async () => {
      const profile = `${PROFILE_DIR_BASE}-valid-prior`;
      if (fs.existsSync(profile)) fs.rmSync(profile, { recursive: true });

      // Given: prior version persisted a valid idle RecordingState and a
      //        LastRecording health record
      await seedPriorStorage(profile, {
        recordingState: { status: 'idle' },
        lastRecording: {
          recordingId: 'prior-rec-uuid',
          outcome: 'ok',
          ts: Date.now() - 60_000,
        },
      });

      // When: the user installs the new version (relaunch with same profile,
      //       same extension build) and opens the popup
      const context = await launchExtensionContextWithProfile(profile);
      try {
        attachNetworkRecorder(context);

        const bootErrors: string[] = [];
        context.on('weberror', (err) => bootErrors.push(err.error().message));

        const extensionId = await getExtensionId(context);
        const popupPage = await context.newPage();
        popupPage.on('pageerror', (err) => bootErrors.push(err.message));
        await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

        // Then: the popup renders the ready state without crashing
        const startButton = popupPage.locator('button', {
          hasText: 'Start Recording',
        });
        await expect(startButton).toBeVisible();
        await expect(startButton).toBeEnabled();
        await expect(popupPage.locator('#status')).toHaveText('Ready to record');

        // And: no boot-time errors fired
        expect(bootErrors).toEqual([]);

        // And: zero external network requests during boot
        assertZeroExternalNetwork(context);
      } finally {
        await context.close();
      }
    },
  );

  test.skip(
    'Given prior storage contains unrecognized fields (forward-compat shape), ' +
      'when the new version reads it on cold start, ' +
      'then unknown fields are ignored and the extension does not crash',
    async () => {
      const profile = `${PROFILE_DIR_BASE}-forward-compat`;
      if (fs.existsSync(profile)) fs.rmSync(profile, { recursive: true });

      // Given: prior version stored extra fields the current version does
      //        not know about (forward-compat: additive shape change)
      await seedPriorStorage(profile, {
        recordingState: {
          status: 'idle',
          futureFieldA: 'ignored',
          futureNested: { foo: 'bar' },
        },
        unknownTopLevelKey: 42,
      });

      // When: the user opens the popup after upgrade
      const context = await launchExtensionContextWithProfile(profile);
      try {
        attachNetworkRecorder(context);

        const bootErrors: string[] = [];
        const extensionId = await getExtensionId(context);
        const popupPage = await context.newPage();
        popupPage.on('pageerror', (err) => bootErrors.push(err.message));
        await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

        // Then: the popup renders successfully and the user-observable
        //       state is "ready to record" — unknown fields had no effect
        const startButton = popupPage.locator('button', {
          hasText: 'Start Recording',
        });
        await expect(startButton).toBeVisible();
        await expect(startButton).toBeEnabled();
        expect(bootErrors).toEqual([]);

        assertZeroExternalNetwork(context);
      } finally {
        await context.close();
      }
    },
  );

  test.skip(
    'Given prior storage contains an explicitly-incompatible RecordingState shape, ' +
      'when the new version cold-starts on an upgrade install event, ' +
      'then a one-time migration runs and the stale state is discarded',
    async () => {
      const profile = `${PROFILE_DIR_BASE}-incompat`;
      if (fs.existsSync(profile)) fs.rmSync(profile, { recursive: true });

      // Given: prior version stored a status the current version no longer
      //        recognizes (subtractive shape change — requires migration).
      //        'archived' is a fictional removed status; real extensions
      //        encounter equivalents during refactors.
      await seedPriorStorage(profile, {
        // intentionally not a valid current RecordingState
        recordingState: {
          status: 'archived',
          archivedAt: Date.now() - 86_400_000,
        },
      });

      // When: the user opens the popup after upgrade (chrome.runtime.onInstalled
      //       fires with reason === 'update' on the next launch)
      const context = await launchExtensionContextWithProfile(profile);
      try {
        attachNetworkRecorder(context);

        const extensionId = await getExtensionId(context);
        const popupPage = await context.newPage();
        const bootErrors: string[] = [];
        popupPage.on('pageerror', (err) => bootErrors.push(err.message));
        await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

        // Then: the user-observable state is idle / ready — the stale
        //       'archived' status was discarded, NOT carried forward
        const startButton = popupPage.locator('button', {
          hasText: 'Start Recording',
        });
        await expect(startButton).toBeVisible();
        await expect(startButton).toBeEnabled();
        await expect(popupPage.locator('#status')).toHaveText('Ready to record');
        expect(bootErrors).toEqual([]);

        // And: the stored state has been replaced with a current-shape
        //      idle state (or removed). User-observable proxy: clicking
        //      Start successfully transitions to recording.
        const recordingStateAfter = await popupPage.evaluate(() =>
          chrome.storage.local
            .get('recordingState')
            .then((r) => r.recordingState as { status?: string } | undefined),
        );
        // Either cleared or rewritten to a current-shape status
        const statusAfter = recordingStateAfter?.status;
        expect(
          statusAfter === undefined ||
            statusAfter === 'idle' ||
            statusAfter === 'recording' ||
            statusAfter === 'processing',
        ).toBe(true);
        expect(statusAfter).not.toBe('archived');

        assertZeroExternalNetwork(context);
      } finally {
        await context.close();
      }
    },
  );
});
