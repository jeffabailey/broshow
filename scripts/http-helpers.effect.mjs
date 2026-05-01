// scripts/http-helpers.effect.mjs
//
// EFFECT module: tiny shared HTTP utilities used by adapter modules.
// Extracted from cws-adapter and amo-listed-adapter to eliminate duplication.
//
// `safeJson` is effectful (reads response body asynchronously); it lives
// here, not in decisions.pure.mjs, to preserve the pure/effect boundary.

/**
 * Resolves a fetch implementation from injected deps or the global,
 * throwing a labelled error if neither is available.
 *
 * @param {{ fetch?: typeof fetch }|undefined} deps
 * @param {string} adapterLabel  module name for the error message
 * @returns {typeof fetch}
 */
export function resolveFetch(deps, adapterLabel) {
  const fn = (deps && deps.fetch) || globalThis.fetch;
  if (typeof fn !== 'function') {
    throw new Error(`${adapterLabel}: no fetch available (pass deps.fetch or run on Node 18+)`);
  }
  return fn;
}

/**
 * Reads a Response body as JSON, returning {} when the body is empty
 * or fails to parse. Never throws.
 *
 * @param {Response} response
 * @returns {Promise<Object>}
 */
export async function safeJson(response) {
  try {
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}
