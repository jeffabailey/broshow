// ---------------------------------------------------------------------------
// Milestone 2 -- record-all-tabs (R1-cropped), slice-02
// ---------------------------------------------------------------------------
// Completes R1-cropped: the cropped window stream FOLLOWS tab switches with no
// gap (inherent to one window stream -- no seam, no re-acquire), the visible
// "Recording window region" indicator is present and accurate for the whole
// session (the honest-indicator answer to the accepted privacy caveat), stop
// works in <=1 gesture regardless of switch count, and out-of-window activation
// does NOT extend capture (bound to the originally-shared window).
//
// Slice-02 ACs covered: AC2.1 generalized (one file, content updates, no gap),
// AC1.3 / AC3.1 (indicator present + accurate), AC3.2 (other window NOT captured),
// AC3.3 (<=1-gesture stop). Residual privacy caveat (DESIGN §16): the indicator
// is the honest signal -- this milestone tests its PRESENCE/ACCURACY, NOT
// pixel-level chrome exclusion.
//
// Real-browser vs pure-seam split: follow + indicator-accuracy + out-of-window
// hold all need real window pixels and real tab activation across a real window,
// which Chrome 148 will not let an unpacked extension drive via CDP. They are
// `test.fixme @human-gate`, pinned to the slice-02 dogfood matrix. The INDICATOR
// COPY (its existence and text in the record-page / popup DOM) is automatable
// headless and is the ENABLED first scenario -- it proves the honest-indicator
// surface exists without needing real capture.
//
// Mandate 11 (layer 3+ sad paths example-based): the out-of-window and follow
// scenarios are named example tests, never PBT-generated.
//
// Mandate 1: driving ports = popup UI + record page via the loaded extension.
// Assertion robustness: indicator text presence, single download count, NOT a
// second file on switch -- never screenshot pixel diffs (per task brief).
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
const DOWNLOAD_DIR = path.resolve(__dirname, '../../downloads-record-all-tabs-m2');
const TEST_PAGE_PATH = path.resolve(__dirname, '../../fixtures/test-page.html');

const WINDOW_CROPPED_MODE_LABEL = 'Record all tabs';
// The honest-indicator copy (slice-02, US-1 AC1.3 / US-3 AC3.1). Exact text is
// the crafter's call in DELIVER; the contract is that a recording-scope signal
// of this meaning is visible. DISTILL pins the meaning; the human gate confirms
// accuracy across switches.
const RECORDING_REGION_INDICATOR = 'Recording window region';

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
// HONEST INDICATOR PRESENCE (AC1.3 / AC3.1) -- ENABLED, headless-safe
// ---------------------------------------------------------------------------

test.describe('@real-io @chromium record-all-tabs M2: the honest "Recording window region" indicator is present', () => {
  let context: BrowserContext;

  test.beforeAll(async () => {
    context = await launchExtensionContext(
      path.resolve(__dirname, '../../.tmp-profile-rat-m2-indicator'),
    );
    attachNetworkRecorder(context);
  });

  test.afterEach(() => {
    assertZeroExternalNetwork(context);
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('the cropped-window record surface carries a visible "Recording window region" indicator so Dana always knows the scope being captured (AC1.3, US-3 honest indicator)', async () => {
    // Given: Dana selects the cropped-window mode (the surface that hosts capture)
    const extensionId = await getExtensionId(context);
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

    // When: she chooses "Record all tabs" and clicks Start, the popup routes to
    //       the record page (the gesture + preview owner that hosts the
    //       cropped-window capture). Same proven routing the M1 spec exercises.
    await popupPage.getByText(WINDOW_CROPPED_MODE_LABEL, { exact: false }).click();
    const recordPagePromise = context.waitForEvent('page', { timeout: 5000 });
    await popupPage.click('button:has-text("Start Recording")');
    const recordPage = await recordPagePromise;
    await recordPage.waitForLoadState('domcontentloaded');
    expect(recordPage.url()).toContain('record.html');

    // Then: the record page carries a visible recording-scope indicator with the
    //       honest "Recording window region" meaning (the answer to the accepted
    //       privacy caveat: cropping hides chrome, so the user must always SEE that
    //       the active window's content is what's captured). This pins the
    //       indicator's EXISTENCE on the surface that owns the session; accuracy-
    //       across-switches is the human-gated scenario below.
    await expect(
      recordPage.getByText(RECORDING_REGION_INDICATOR, { exact: false }),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// FOLLOW-ACROSS-SWITCHES + STOP + OUT-OF-WINDOW -- human-gated (real pixels)
// ---------------------------------------------------------------------------

test.describe('@real-io @chromium record-all-tabs M2: follow, stop, and window boundary', () => {
  // @human-gate -- follow needs real window pixels + real tab activation.
  test.fixme(
    '@human-gate AC2.1: with the cropped window recording, Dana switches across 3 tabs and the single file shows each tab\'s content in order with no gap (one stream, no seam)',
    async () => {
      // Given: a cropped-window recording is running on tab A (human-gated capture).
      // When:  Dana activates tab B, then tab C, in the SAME window, then stops.
      // Then:  exactly ONE file downloads -- NOT a second file per switch -- and a
      //        human reviewer confirms (production data) the content updates as
      //        tabs switch with no visible gap. Robust proxy asserted in the gate:
      //        download COUNT is 1 after N switches. NOT a pixel diff.
      const files = fs.existsSync(DOWNLOAD_DIR)
        ? fs.readdirSync(DOWNLOAD_DIR).filter((f) => !f.endsWith('.crdownload'))
        : [];
      expect(files.length).toBe(1);
    },
  );

  test.fixme(
    '@human-gate AC3.1: the "Recording window region" indicator stays present and accurate across every tab switch for the whole session',
    async () => {
      // Given: a cropped-window recording running with multiple tab switches.
      // Then:  the indicator remains visible and continues to reflect that the
      //        active window region is being captured -- it never disappears or
      //        goes stale mid-session (human dogfood confirms accuracy).
      expect(true).toBe(true); // placeholder; accuracy confirmed in the human gate
    },
  );

  test.fixme(
    '@human-gate AC3.3: Dana stops the recording in a single gesture no matter how many tab switches happened',
    async () => {
      // Given: a cropped-window recording with several tab switches.
      // When:  Dana clicks Stop ONCE.
      // Then:  the recording finalizes and downloads -- a single stop gesture is
      //        sufficient regardless of switch count (one stream, one stop).
      expect(true).toBe(true); // placeholder; single-gesture stop confirmed in the gate
    },
  );

  // --- BOUNDARY / NEGATIVE (AC3.2, D2) -- example-based (Mandate 11) --------
  test.fixme(
    '@human-gate @error AC3.2: activating a tab in a DIFFERENT browser window does NOT extend capture to that window -- capture holds on the originally-shared window (D2)',
    async () => {
      // Given: a cropped-window recording bound to window 1.
      // When:  Dana activates a tab in a SEPARATE browser window (window 2).
      // Then:  the recording continues to capture window 1's content -- window 2 is
      //        NOT captured (getDisplayMedia is bound to the chosen window;
      //        out-of-window activation never chases). Human dogfood confirms
      //        window 2 content is absent from the recording.
      expect(true).toBe(true); // placeholder; boundary confirmed in the human gate
    },
  );
});
