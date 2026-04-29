// ---------------------------------------------------------------------------
// strip-chrome-only-permissions.mjs
// ---------------------------------------------------------------------------
// Removes Chromium-only permissions ("tabCapture", "offscreen") from the
// Firefox-patched manifest. These permissions are meaningless on Firefox
// (the corresponding APIs do not exist) and declaring them produces install
// warnings without any user-visible benefit.
//
// Contract (pinned by tests/unit/manifest-patch-firefox-permissions.test.ts):
//   - Firefox manifest MUST NOT contain "tabCapture" or "offscreen" in
//     `permissions`.
//   - "storage" and "downloads" MUST be retained (still required on Firefox).
//   - The input manifest object is NOT mutated (pure function).
//   - The Chromium pipeline MUST NOT call this transform (regression guard).
// ---------------------------------------------------------------------------

/**
 * Canonical list of permissions that exist only on Chromium (Manifest V3
 * APIs that Firefox MV3 does not implement). Exported so tests can pin the
 * contract.
 */
export const CHROME_ONLY_PERMISSIONS = ['offscreen', 'tabCapture'];

const isChromeOnly = (permission) =>
  CHROME_ONLY_PERMISSIONS.includes(permission);

const stripChromeOnly = (permissions) =>
  permissions.filter((permission) => !isChromeOnly(permission));

/**
 * Pure transform: take a manifest object and return a new manifest with
 * Chromium-only permissions removed from the `permissions` array. Does not
 * mutate the input. If the manifest has no `permissions` array, returns a
 * shallow copy unchanged.
 */
export const stripChromeOnlyPermissions = (manifest) => {
  if (!Array.isArray(manifest.permissions)) {
    return { ...manifest };
  }
  return {
    ...manifest,
    permissions: stripChromeOnly(manifest.permissions),
  };
};
