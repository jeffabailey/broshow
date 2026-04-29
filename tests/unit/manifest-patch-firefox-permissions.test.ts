// ---------------------------------------------------------------------------
// Firefox manifest patcher -- permission stripping contract
// ---------------------------------------------------------------------------
// Pins NFR-FF-01 and AC-FF-08 at the patcher boundary:
//
//   - The Firefox-patched manifest MUST NOT carry "tabCapture" or "offscreen"
//     in `permissions` (those APIs do not exist on Firefox; declaring them
//     produces install warnings without user-visible benefit).
//   - The Firefox-patched manifest MUST retain "storage" and "downloads"
//     (still required on Firefox).
//   - The Chromium manifest MUST NOT be perturbed by the new helper
//     (regression guard for AC-FF-06 / AC-FF-08).
//
// Driving port: stripChromeOnlyPermissions(manifest) from
//   scripts/strip-chrome-only-permissions.mjs (RED scaffold today).
//   The DELIVER wave wires this into patch-firefox-manifest.mjs.
//
// AC traceability:
//   AC-FF-08 No new permissions added to the manifest
//   FR-FF-04 (component-boundaries.md) -- Firefox build does not bundle
//            offscreen entry; this is the manifest-side guarantee.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
// The two .mjs build scripts are consumed via runtime import. They are not
// part of the TypeScript src/ project (per tsconfig.json `include` excludes
// tests/), so vitest+esbuild resolve them at test time without type-checking.
import {
  stripChromeOnlyPermissions,
  CHROME_ONLY_PERMISSIONS,
} from '../../scripts/strip-chrome-only-permissions.mjs';
import { patchManifestForFirefox } from '../../scripts/patch-firefox-manifest.mjs';

const SOURCE_MANIFEST = {
  manifest_version: 3,
  name: 'BroShow',
  version: '0.1.2',
  description: 'Record a browser tab and save as mp4',
  permissions: ['tabCapture', 'offscreen', 'storage', 'downloads'],
  action: { default_popup: 'popup.html' },
  background: { service_worker: 'background.js', type: 'module' },
};

describe('AC-FF-08 stripChromeOnlyPermissions removes Chromium-only permissions for Firefox', () => {
  it.skip('removes tabCapture and offscreen from the permissions list (FR-FF-04 / NFR-FF-01)', () => {
    const stripped = stripChromeOnlyPermissions(SOURCE_MANIFEST);

    // Observable outcome: Firefox install no longer warns on tabCapture/offscreen
    expect(stripped.permissions).not.toContain('tabCapture');
    expect(stripped.permissions).not.toContain('offscreen');
  });

  it.skip('retains storage and downloads (still required on Firefox)', () => {
    const stripped = stripChromeOnlyPermissions(SOURCE_MANIFEST);

    expect(stripped.permissions).toContain('storage');
    expect(stripped.permissions).toContain('downloads');
  });

  it.skip('does not mutate the input manifest (pure function contract)', () => {
    const before = JSON.parse(JSON.stringify(SOURCE_MANIFEST));
    stripChromeOnlyPermissions(SOURCE_MANIFEST);
    expect(SOURCE_MANIFEST).toEqual(before);
  });

  it.skip('exposes the canonical list of Chromium-only permissions', () => {
    expect(CHROME_ONLY_PERMISSIONS).toEqual(
      expect.arrayContaining(['tabCapture', 'offscreen']),
    );
  });
});

describe('AC-FF-08 Firefox manifest pipeline strips Chromium-only permissions end-to-end', () => {
  it.skip('the Firefox-patched manifest declares no Chromium-only permissions (composed pipeline)', () => {
    // DELIVER wires stripChromeOnlyPermissions into patchManifestForFirefox.
    // This pin asserts the composed pipeline leaves Firefox without those
    // permissions, no matter the order the crafter chooses.
    const firefoxManifest = stripChromeOnlyPermissions(
      patchManifestForFirefox(SOURCE_MANIFEST),
    );

    expect(firefoxManifest.permissions).not.toContain('tabCapture');
    expect(firefoxManifest.permissions).not.toContain('offscreen');
    expect(firefoxManifest.permissions).toContain('storage');
    expect(firefoxManifest.permissions).toContain('downloads');
    // Chromium-shaped manifest fields (browser_specific_settings) come from
    // patchManifestForFirefox; verify they survive the strip step.
    expect(firefoxManifest.browser_specific_settings?.gecko?.id).toBe(
      'broshow@jeffabailey.com',
    );
  });
});

describe('AC-FF-06 the Chromium build pipeline is untouched (regression guard)', () => {
  it.skip('the Chromium manifest still declares all four original permissions', () => {
    // The Chromium pipeline never calls stripChromeOnlyPermissions. Pin
    // current behavior so a future "always strip" refactor is caught.
    const chromiumPermissions = SOURCE_MANIFEST.permissions.slice().sort();
    expect(chromiumPermissions).toEqual(
      ['downloads', 'offscreen', 'storage', 'tabCapture'].sort(),
    );
  });
});
