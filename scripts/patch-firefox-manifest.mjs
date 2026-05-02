import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';

import { stripChromeOnlyPermissions } from './strip-chrome-only-permissions.mjs';

const FIREFOX_GECKO_ID = 'broshow@jeffabailey.com';
const FIREFOX_STRICT_MIN_VERSION = '121.0';

const FIREFOX_SVG_ICON_PATH = 'icons/logo.svg';
const FIREFOX_SVG_ICONS = Object.freeze({
  16: FIREFOX_SVG_ICON_PATH,
  32: FIREFOX_SVG_ICON_PATH,
  48: FIREFOX_SVG_ICON_PATH,
  128: FIREFOX_SVG_ICON_PATH,
});

const addGeckoSettings = (manifest) => ({
  ...manifest,
  background: {
    ...manifest.background,
    scripts: ['background.js'],
  },
  browser_specific_settings: {
    gecko: {
      id: FIREFOX_GECKO_ID,
      strict_min_version: FIREFOX_STRICT_MIN_VERSION,
      data_collection_permissions: {
        required: ['none'],
      },
    },
  },
});

// Firefox supports SVG icons in the manifest; Chromium does not. Use a single
// scalable SVG so the toolbar/about:addons icons stay sharp at any DPR.
const useSvgIcons = (manifest) => ({
  ...manifest,
  icons: { ...FIREFOX_SVG_ICONS },
  ...(manifest.action
    ? {
        action: {
          ...manifest.action,
          default_icon: { ...FIREFOX_SVG_ICONS },
        },
      }
    : {}),
});

// Firefox manifest patching pipeline: a composition of pure transforms.
// First strip Chromium-only permissions, then layer on the gecko settings,
// then swap raster icons for the scalable SVG (Firefox-only feature).
export const patchManifestForFirefox = (manifest) =>
  useSvgIcons(addGeckoSettings(stripChromeOnlyPermissions(manifest)));

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    console.error('Usage: node scripts/patch-firefox-manifest.mjs <manifest.json>');
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const patched = patchManifestForFirefox(manifest);
  writeFileSync(manifestPath, JSON.stringify(patched, null, 2) + '\n');
}
