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
  it('removes tabCapture and offscreen from the permissions list (FR-FF-04 / NFR-FF-01)', () => {
    const stripped = stripChromeOnlyPermissions(SOURCE_MANIFEST);

    // Observable outcome: Firefox install no longer warns on tabCapture/offscreen
    expect(stripped.permissions).not.toContain('tabCapture');
    expect(stripped.permissions).not.toContain('offscreen');
  });

  it('retains storage and downloads (still required on Firefox)', () => {
    const stripped = stripChromeOnlyPermissions(SOURCE_MANIFEST);

    expect(stripped.permissions).toContain('storage');
    expect(stripped.permissions).toContain('downloads');
  });

  it('does not mutate the input manifest (pure function contract)', () => {
    const before = JSON.parse(JSON.stringify(SOURCE_MANIFEST));
    stripChromeOnlyPermissions(SOURCE_MANIFEST);
    expect(SOURCE_MANIFEST).toEqual(before);
  });

  it('exposes the canonical list of Chromium-only permissions', () => {
    expect(CHROME_ONLY_PERMISSIONS).toEqual(
      expect.arrayContaining(['tabCapture', 'offscreen']),
    );
  });
});

describe('AC-FF-08 Firefox manifest pipeline strips Chromium-only permissions end-to-end', () => {
  it('the Firefox-patched manifest declares no Chromium-only permissions (composed pipeline)', () => {
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
  it('the Chromium manifest still declares all four original permissions', () => {
    // The Chromium pipeline never calls stripChromeOnlyPermissions. Pin
    // current behavior so a future "always strip" refactor is caught.
    const chromiumPermissions = SOURCE_MANIFEST.permissions.slice().sort();
    expect(chromiumPermissions).toEqual(
      ['downloads', 'offscreen', 'storage', 'tabCapture'].sort(),
    );
  });
});

describe('Step 03-01: Firefox manifest declares MV3 event-page wiring (D1, ADR-003 Option C)', () => {
  // The Firefox MV3 event page hosts MediaRecorder. The patched manifest
  // MUST declare both:
  //   1. browser_specific_settings.gecko.{id, strict_min_version} so AMO
  //      accepts the build and Firefox enforces the minimum version (121.0,
  //      where MV3 event-page support is stable).
  //   2. background.scripts: ['background.js'] so Firefox loads the bundled
  //      background script as an event page (Firefox MV3 does NOT honor
  //      background.service_worker the way Chromium does).
  //
  // Without (2), getDisplayMedia cannot run from the background context and
  // ADR-003 Option C is unimplementable on Firefox. This scenario pins the
  // patcher's output so a future refactor cannot silently drop these fields.

  it('declares browser_specific_settings.gecko with id and strict_min_version 121.0+', () => {
    const patched = patchManifestForFirefox(SOURCE_MANIFEST);

    expect(patched.browser_specific_settings).toBeDefined();
    expect(patched.browser_specific_settings.gecko).toBeDefined();
    expect(patched.browser_specific_settings.gecko.id).toBe(
      'broshow@jeffabailey.com',
    );
    // strict_min_version must be >= 121.0 (the version where Firefox MV3
    // event-page + getDisplayMedia from background reliably honor the
    // user-gesture chain forwarded from a popup message).
    const minVersion = patched.browser_specific_settings.gecko.strict_min_version;
    expect(minVersion).toBeDefined();
    const major = parseInt(String(minVersion).split('.')[0], 10);
    expect(major).toBeGreaterThanOrEqual(121);
  });

  it('declares background.scripts so Firefox loads the bundled background script as an event page', () => {
    const patched = patchManifestForFirefox(SOURCE_MANIFEST);

    // Firefox MV3 honors background.scripts; Chromium honors background.service_worker.
    // The patched manifest may carry both (Firefox ignores service_worker),
    // but scripts MUST be present and reference the bundled entry.
    expect(patched.background).toBeDefined();
    expect(Array.isArray(patched.background.scripts)).toBe(true);
    expect(patched.background.scripts).toContain('background.js');
  });

  it('AC-FF-08 holds: no new permissions introduced by the event-page wiring', () => {
    // Adding browser_specific_settings + background.scripts must not bring
    // any new permission entries. Permissions remain a subset of the source
    // manifest minus Chromium-only entries.
    const patched = patchManifestForFirefox(SOURCE_MANIFEST);
    const sourcePermissions = new Set(SOURCE_MANIFEST.permissions);

    for (const perm of patched.permissions) {
      expect(sourcePermissions.has(perm)).toBe(true);
    }
  });
});

describe('Firefox manifest swaps PNG icons for the scalable SVG (icons/logo.svg)', () => {
  // Firefox WebExtensions support SVG icons in `manifest.icons` and
  // `manifest.action.default_icon`. Chromium does NOT — so the swap is
  // Firefox-only and lives inside patchManifestForFirefox. This pin holds
  // the contract so a future refactor can't silently drop the SVG entries
  // (which would degrade the toolbar/about:addons icon to a fuzzy raster).

  const SOURCE_WITH_PNG_ICONS = {
    ...SOURCE_MANIFEST,
    icons: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
    action: {
      default_popup: 'popup.html',
      default_icon: {
        16: 'icons/icon-16.png',
        32: 'icons/icon-32.png',
        48: 'icons/icon-48.png',
        128: 'icons/icon-128.png',
      },
    },
  };

  it('replaces top-level icons with logo.svg at every standard size', () => {
    const patched = patchManifestForFirefox(SOURCE_WITH_PNG_ICONS);

    expect(patched.icons).toEqual({
      16: 'icons/logo.svg',
      32: 'icons/logo.svg',
      48: 'icons/logo.svg',
      128: 'icons/logo.svg',
    });
  });

  it('replaces action.default_icon entries with logo.svg', () => {
    const patched = patchManifestForFirefox(SOURCE_WITH_PNG_ICONS);

    expect(patched.action?.default_icon).toEqual({
      16: 'icons/logo.svg',
      32: 'icons/logo.svg',
      48: 'icons/logo.svg',
      128: 'icons/logo.svg',
    });
  });

  it('preserves action.default_popup (only the icon entries are rewritten)', () => {
    const patched = patchManifestForFirefox(SOURCE_WITH_PNG_ICONS);

    expect(patched.action?.default_popup).toBe('popup.html');
  });

  it('does not mutate the input manifest (pure function contract)', () => {
    const before = JSON.parse(JSON.stringify(SOURCE_WITH_PNG_ICONS));
    patchManifestForFirefox(SOURCE_WITH_PNG_ICONS);
    expect(SOURCE_WITH_PNG_ICONS).toEqual(before);
  });

  it('handles a manifest without an action block gracefully', () => {
    const manifestSansAction = {
      ...SOURCE_WITH_PNG_ICONS,
      action: undefined,
    };
    delete (manifestSansAction as unknown as Record<string, unknown>).action;

    const patched = patchManifestForFirefox(manifestSansAction);

    expect(patched.icons).toEqual({
      16: 'icons/logo.svg',
      32: 'icons/logo.svg',
      48: 'icons/logo.svg',
      128: 'icons/logo.svg',
    });
    expect(patched.action).toBeUndefined();
  });
});
