// ---------------------------------------------------------------------------
// no-network.ts — Playwright fixture/helper for the zero-network KPI gate
// ---------------------------------------------------------------------------
// Source of truth for the policy: docs/feature/browser-tab-recorder/devops/
//   kpi-instrumentation.md   (KPI: Network requests made = 0 — HARD GATE)
//   wave-decisions.md         (D10)
//
// Contract
// --------
// Every acceptance spec MUST call `attachNetworkRecorder(context)` once during
// setup and call `assertZeroExternalNetwork(context)` in `afterEach` (or
// `afterAll` for slow specs). Any request whose URL has scheme `http:` or
// `https:` is a violation. `chrome-extension://`, `blob:`, `data:`, and
// `about:blank` are allowed.
//
// Why a fixture and not a global hook?
// ------------------------------------
// Per-spec opt-in keeps the policy surface visible in each spec file (someone
// reading walking-skeleton.spec.ts sees the no-network assertion and learns
// about the KPI). A globalSetup hides it.
//
// This module is TEST INFRASTRUCTURE, not production code. No `__SCAFFOLD__`
// marker. Imports only @playwright/test types and the Node `URL` global.
// ---------------------------------------------------------------------------

import type { BrowserContext, Page, Request } from '@playwright/test';

/** Schemes that are permitted at runtime. Anything else is a KPI violation. */
const ALLOWED_SCHEMES = new Set<string>([
  'chrome-extension:',
  'blob:',
  'data:',
  'about:',
  // file:// is allowed because tests load fixture HTML from disk
  'file:',
  // chrome:// is allowed (chrome internals — never user content)
  'chrome:',
  // devtools:// is allowed when running headed with DevTools
  'devtools:',
]);

/** A captured request, kept small for assertion failure messages. */
export type CapturedRequest = {
  readonly url: string;
  readonly method: string;
  readonly resourceType: string;
  readonly originPage: string;
};

/** State held per BrowserContext. Keyed by context to avoid cross-test leakage. */
const recorders = new WeakMap<BrowserContext, CapturedRequest[]>();

const isExternalUrl = (url: string): boolean => {
  try {
    const u = new URL(url);
    if (ALLOWED_SCHEMES.has(u.protocol)) return false;
    // Anything starting with http(s) is by definition external
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    // Unparseable URLs are not external network calls
    return false;
  }
};

const recordRequest = (
  bucket: CapturedRequest[],
  page: Page,
  request: Request,
): void => {
  const url = request.url();
  if (!isExternalUrl(url)) return;
  bucket.push({
    url,
    method: request.method(),
    resourceType: request.resourceType(),
    originPage: page.url(),
  });
};

/**
 * Attach a request listener to every existing and future page in `context`.
 * Returns the captured-request bucket (the same one
 * `assertZeroExternalNetwork` reads from).
 *
 * Idempotent per context.
 */
export const attachNetworkRecorder = (
  context: BrowserContext,
): CapturedRequest[] => {
  const existing = recorders.get(context);
  if (existing) return existing;

  const bucket: CapturedRequest[] = [];
  recorders.set(context, bucket);

  // Pages already open at attach time
  for (const page of context.pages()) {
    page.on('request', (req) => recordRequest(bucket, page, req));
  }

  // Pages opened after attach time
  context.on('page', (page) => {
    page.on('request', (req) => recordRequest(bucket, page, req));
  });

  return bucket;
};

/**
 * Assert no external network request was observed since `attachNetworkRecorder`
 * was called on this context. Throws (fails the test) on violation with a
 * detailed listing.
 */
export const assertZeroExternalNetwork = (context: BrowserContext): void => {
  const bucket = recorders.get(context);
  if (!bucket) {
    throw new Error(
      'no-network.ts: assertZeroExternalNetwork called before attachNetworkRecorder. ' +
        'Call attachNetworkRecorder(context) in test setup.',
    );
  }
  if (bucket.length === 0) return;

  const lines = bucket
    .map(
      (r, i) =>
        `  ${i + 1}. ${r.method} ${r.url} (${r.resourceType}) from ${r.originPage}`,
    )
    .join('\n');
  throw new Error(
    `Zero-network KPI violation: ${bucket.length} external request(s) observed:\n${lines}\n` +
      'BroShow must make zero outbound HTTP/HTTPS requests. ' +
      'See docs/feature/browser-tab-recorder/devops/kpi-instrumentation.md.',
  );
};

/**
 * Clear the captured-request bucket for `context` without removing listeners.
 * Useful between tests in the same context if you want fresh state per test.
 */
export const resetNetworkRecorder = (context: BrowserContext): void => {
  const bucket = recorders.get(context);
  if (bucket) bucket.length = 0;
};
