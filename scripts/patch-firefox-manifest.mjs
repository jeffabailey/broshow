import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';

const FIREFOX_GECKO_ID = 'broshow@jeffabailey.com';
const FIREFOX_STRICT_MIN_VERSION = '121.0';

export const patchManifestForFirefox = (manifest) => ({
  ...manifest,
  background: {
    ...manifest.background,
    scripts: ['background.js'],
  },
  browser_specific_settings: {
    gecko: {
      id: FIREFOX_GECKO_ID,
      strict_min_version: FIREFOX_STRICT_MIN_VERSION,
    },
  },
});

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
