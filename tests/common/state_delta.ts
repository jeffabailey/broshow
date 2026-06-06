// ---------------------------------------------------------------------------
// State-delta port (TypeScript) -- Mandate 8 universe-bound assertion contract
// ---------------------------------------------------------------------------
// Bootstrapped 2026-06-06 during DISTILL of `record-all-tabs` (first DISTILL in
// this project; `[lang-mode] typescript`). Polyglot port of the canonical Python
// `nwave_ai.state_delta`. Apply-if-absent: present now, future DISTILL runs inherit.
//
// Contract (identical across host languages):
//   assertStateDelta(before, after, { universe, expected })
//     - universe: the SET of port-exposed observable names the test promises to
//       track. Names are ALWAYS port-exposed (event types, public read-model
//       fields, exit codes, captured outputs) -- NEVER internal struct fields.
//     - expected: a predicate per universe entry. Any universe slot NOT in
//       expected MUST remain unchanged (fail-closed).
//
// NOTE for `record-all-tabs`: this feature's pure seams (crop-geometry,
// mode-mapping) are pure functions with a single return value and are EXEMPT
// from Mandate 8 (nw-tdd "Pure-function tests with single output"). This port is
// bootstrapped for future state-mutating features in this project. It is fully
// usable today; it just is not load-bearing for this feature's tests.
// ---------------------------------------------------------------------------

export type Predicate = (before: unknown, after: unknown) => true | string;

export interface StateDeltaSpec {
  readonly universe: ReadonlySet<string> | readonly string[];
  readonly expected: Readonly<Record<string, Predicate>>;
}

const eq = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

// --- Predicate factories (mirror the canonical 8) --------------------------

export const unchanged = (): Predicate => (before, after) =>
  eq(before, after) ? true : `expected unchanged, but ${JSON.stringify(before)} -> ${JSON.stringify(after)}`;

export const setTo = (value: unknown): Predicate => (_before, after) =>
  eq(after, value) ? true : `expected set_to ${JSON.stringify(value)}, got ${JSON.stringify(after)}`;

export const appendedWith = (suffix: unknown): Predicate => (before, after) => {
  if (Array.isArray(before) && Array.isArray(after)) {
    const grew = after.length === before.length + 1;
    const last = after[after.length - 1];
    return grew && eq(last, suffix)
      ? true
      : `expected appended_with ${JSON.stringify(suffix)}, got ${JSON.stringify(after)}`;
  }
  return `appended_with requires array slots, got ${JSON.stringify(before)} / ${JSON.stringify(after)}`;
};

export const prependedWith = (prefix: unknown): Predicate => (before, after) => {
  if (Array.isArray(before) && Array.isArray(after)) {
    const grew = after.length === before.length + 1;
    const first = after[0];
    return grew && eq(first, prefix)
      ? true
      : `expected prepended_with ${JSON.stringify(prefix)}, got ${JSON.stringify(after)}`;
  }
  return `prepended_with requires array slots, got ${JSON.stringify(before)} / ${JSON.stringify(after)}`;
};

export const containing = (member: unknown): Predicate => (_before, after) => {
  if (Array.isArray(after)) {
    return after.some((x) => eq(x, member))
      ? true
      : `expected containing ${JSON.stringify(member)}, got ${JSON.stringify(after)}`;
  }
  if (typeof after === 'string' && typeof member === 'string') {
    return after.includes(member)
      ? true
      : `expected string containing ${JSON.stringify(member)}, got ${JSON.stringify(after)}`;
  }
  return `containing requires array or string slot, got ${JSON.stringify(after)}`;
};

export const normalizedTo = (value: unknown): Predicate => setTo(value);

export const idempotentAfter = (): Predicate => unchanged();

export const legacyHealed = (value: unknown): Predicate => setTo(value);

// --- Universe-bound assertion ----------------------------------------------

/**
 * Assert the observable state delta against a declared universe.
 *
 * Fail-closed: every universe slot NOT named in `expected` is held to
 * `unchanged()`. A slot that mutates without an `expected` entry is a violation.
 */
export const assertStateDelta = (
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, unknown>>,
  spec: StateDeltaSpec,
): void => {
  const universe = new Set(spec.universe);
  const failures: string[] = [];

  for (const slot of universe) {
    const predicate = spec.expected[slot] ?? unchanged();
    const verdict = predicate(before[slot], after[slot]);
    if (verdict !== true) {
      failures.push(`  - "${slot}": ${verdict}`);
    }
  }

  // Guard: an expected entry naming a slot outside the universe is a spec bug.
  for (const slot of Object.keys(spec.expected)) {
    if (!universe.has(slot)) {
      failures.push(`  - expected names "${slot}" which is not in the universe`);
    }
  }

  // Guard: internal-field leakage (Mandate 8 -- universe must be port-exposed).
  for (const slot of universe) {
    if (slot.includes('._') || slot.startsWith('_')) {
      failures.push(
        `  - universe slot "${slot}" looks like an internal field (leading underscore); ` +
          `universe entries must be port-exposed observable names`,
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(`assertStateDelta failed:\n${failures.join('\n')}`);
  }
};
