// ---------------------------------------------------------------------------
// strip-chrome-only-permissions.mjs (RED scaffold -- DELIVER wave)
// ---------------------------------------------------------------------------
// Removes Chromium-only permissions ("tabCapture", "offscreen") from the
// Firefox-patched manifest. These permissions are meaningless on Firefox
// (the corresponding APIs do not exist) and triggering them produces install
// warnings without any user-visible benefit.
//
// Contract (pinned by tests/unit/manifest-patch-firefox-permissions.test.ts):
//   - Firefox manifest MUST NOT contain "tabCapture" or "offscreen" in
//     `permissions`.
//   - "storage" and "downloads" MUST be retained (still required on Firefox).
//   - Chromium manifest MUST be untouched (regression guard for AC-FF-08).
//
// Software-crafter integrates this into patch-firefox-manifest.mjs (or wires
// it as a separate script) during DELIVER.
// ---------------------------------------------------------------------------

export const __SCAFFOLD__ = true;

const CHROME_ONLY_PERMISSIONS = ['tabCapture', 'offscreen'];

/**
 * Pure function: take a manifest object and return a new manifest with
 * Chromium-only permissions removed. Does not mutate input.
 */
export const stripChromeOnlyPermissions = (_manifest) => {
  throw new Error(
    'Not yet implemented -- RED scaffold (stripChromeOnlyPermissions)',
  );
};

export { CHROME_ONLY_PERMISSIONS };
