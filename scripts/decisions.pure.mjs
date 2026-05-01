// scripts/decisions.pure.mjs
//
// PURE module: all decision logic for marketplace publishing.
// No I/O imports allowed. No fetch. No process.env reads.
//
// Composition pipeline (consumed by publish-orchestrator.effect.mjs):
//   parseTargets >> parseMode >> planRun >> [adapters] >> aggregateOutcomes >> renderSummary

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_TARGETS = Object.freeze(['cws', 'amo-listed']);
const VALID_MODES = Object.freeze(['publish', 'upload-only', 'dry-run']);

const TARGET_ALIASES = Object.freeze({
  both: ['cws', 'amo-listed'],
  'cws,amo-listed': ['cws', 'amo-listed'],
  'amo-listed,cws': ['cws', 'amo-listed'],
  'cws-only': ['cws'],
  cws: ['cws'],
  'amo-listed-only': ['amo-listed'],
  'amo-listed': ['amo-listed'],
  none: [],
});

const SECRET_FIELD_PATTERNS = [
  /^authorization$/i,
  /^cookie$/i,
  /^set-cookie$/i,
  /^x-api-key$/i,
  /access[_-]?token$/i,
  /refresh[_-]?token$/i,
  /id[_-]?token$/i,
  /client[_-]?secret$/i,
  /^.*_secret$/i,
  /^.*_token$/i,
  /^secret$/i,
  /^token$/i,
];

const REDACTED = '[REDACTED]';

// ---------------------------------------------------------------------------
// Parsing functions
// ---------------------------------------------------------------------------

const isString = (value) => typeof value === 'string';

/**
 * @param {string} raw - workflow input.
 * @returns {readonly ('cws'|'amo-listed')[]}
 */
export function parseTargets(raw) {
  if (!isString(raw)) {
    throw new Error(`parseTargets: expected string, got ${raw}`);
  }
  const trimmed = raw.trim();
  if (trimmed === '') {
    throw new Error('parseTargets: empty input');
  }
  // Try direct alias match first.
  if (Object.prototype.hasOwnProperty.call(TARGET_ALIASES, trimmed)) {
    return Object.freeze([...TARGET_ALIASES[trimmed]]);
  }
  // Comma-separated list with whitespace tolerance.
  const tokens = trimmed.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
  for (const token of tokens) {
    if (!VALID_TARGETS.includes(token)) {
      throw new Error(`parseTargets: unknown target "${token}". Valid: ${VALID_TARGETS.join(', ')}`);
    }
  }
  // Preserve canonical order: cws before amo-listed.
  const result = VALID_TARGETS.filter((t) => tokens.includes(t));
  return Object.freeze(result);
}

/**
 * @param {{ dryRun?: boolean, cwsPublish?: string, mode?: string }} input
 * @returns {'publish'|'upload-only'|'dry-run'}
 */
export function parseMode(input) {
  if (input && isString(input.mode)) {
    if (!VALID_MODES.includes(input.mode)) {
      throw new Error(`parseMode: invalid mode "${input.mode}". Valid: ${VALID_MODES.join(', ')}`);
    }
    return input.mode;
  }
  if (input && input.dryRun === true) {
    return 'dry-run';
  }
  if (input && input.cwsPublish === 'upload-only') {
    return 'upload-only';
  }
  return 'publish';
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * @param {string} requestedVersion
 * @param {Set<string>} existingVersions
 * @param {string|null|undefined} draftVersion
 * @returns {'available'|'partial-upload'|'already-published'}
 */
export function classifyVersionState(requestedVersion, existingVersions, draftVersion) {
  if (existingVersions && existingVersions.has(requestedVersion)) {
    return 'already-published';
  }
  if (draftVersion && draftVersion === requestedVersion) {
    return 'partial-upload';
  }
  return 'available';
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

/**
 * Builds a list of {target, mode} steps for the orchestrator to execute.
 * Coerces upload-only -> publish for amo-listed (AMO has no upload-only equivalent).
 *
 * @param {readonly ('cws'|'amo-listed')[]} targets
 * @param {'publish'|'upload-only'|'dry-run'} mode
 * @returns {readonly {target: 'cws'|'amo-listed', mode: 'publish'|'upload-only'|'dry-run'}[]}
 */
export function planRun(targets, mode) {
  return Object.freeze(
    targets.map((target) => {
      const stepMode = mode === 'upload-only' && target === 'amo-listed' ? 'publish' : mode;
      return Object.freeze({ target, mode: stepMode });
    })
  );
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

const isFailureStatus = (s) => s === 'failure' || s === 'would-fail';
const isAlreadyPublishedStatus = (s) => s === 'already-published';
const isDryRunStatus = (s) => s === 'would-succeed' || s === 'would-fail';

/**
 * @param {readonly Object[]} outcomes
 * @returns {Object}
 */
export function aggregateOutcomes(outcomes) {
  const list = outcomes ?? [];
  const anyFailure = list.some((o) => isFailureStatus(o.status));
  const anyDryRun = list.some((o) => isDryRunStatus(o.status));
  const allAlreadyPublished = list.length > 0 && list.every((o) => isAlreadyPublishedStatus(o.status));

  let exitCode = 0;
  if (anyFailure) {
    exitCode = 1;
  } else if (allAlreadyPublished && !anyDryRun) {
    exitCode = 1;
  }

  const failedTargets = list.filter((o) => isFailureStatus(o.status));
  const recoveryHint = failedTargets.length === 0 ? null : buildRecoveryHint(failedTargets);

  return {
    outcomes: list,
    exitCode,
    recoveryHint,
    memoryRulePreserved: true,
  };
}

const buildRecoveryHint = (failedOutcomes) => {
  const targets = failedOutcomes.map((o) => o.target).join(',');
  const lines = [
    `Re-dispatch with: targets=${targets}, mode=publish`,
  ];
  const errorCodes = new Set(failedOutcomes.map((o) => o.errorCode).filter(Boolean));
  if (errorCodes.has('auth_expired')) {
    lines.push('Auth expired: regenerate credentials.');
    if (failedOutcomes.some((o) => o.target === 'cws' && o.errorCode === 'auth_expired')) {
      lines.push('For CWS, run: node scripts/cws-bootstrap.mjs');
    }
    if (failedOutcomes.some((o) => o.target === 'amo-listed' && o.errorCode === 'auth_expired')) {
      lines.push('For AMO, regenerate AMO_JWT_SECRET in repo settings.');
    }
  }
  if (errorCodes.has('rate_limited')) {
    lines.push('Rate limited: wait at least 60 minutes before re-dispatch.');
  }
  if (errorCodes.has('version_conflict')) {
    lines.push('Version conflict: bump tag (git tag vX.Y.Z; git push origin vX.Y.Z) and re-dispatch.');
  }
  lines.push('See docs/release.md#recovery');
  return lines.join('\n');
};

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * @param {Object} aggregateResult
 * @returns {string}
 */
export function renderSummary(aggregateResult) {
  const result = aggregateResult ?? { outcomes: [], exitCode: 0, recoveryHint: null };
  const outcomes = result.outcomes ?? [];
  const isDryRun = outcomes.some((o) => isDryRunStatus(o.status));
  const versionLabel = outcomes.length > 0 ? outcomes[0].version : '';

  const titleSuffix = isDryRun ? ' (DRY-RUN)' : '';
  const dryRunBanner = isDryRun ? '\n[DRY RUN] no writes performed\n' : '';

  const tableHeader = [
    '| Target | Version | Status | Message | Dashboard |',
    '|--------|---------|--------|---------|-----------|',
  ].join('\n');

  const tableRows = outcomes.map((o) => {
    const dashboard = o.dashboardUrl ?? '-';
    const message = (o.message ?? '').replace(/\|/g, '\\|');
    return `| ${o.target} | ${o.version} | ${o.status} | ${message} | ${dashboard} |`;
  }).join('\n');

  const recoverySection = result.recoveryHint
    ? `\n\n## Recovery\n\n${result.recoveryHint}\n`
    : '';

  return [
    `# BroShow Marketplace Publish — ${versionLabel}${titleSuffix}`,
    dryRunBanner,
    '## Per-target outcomes',
    '',
    tableHeader,
    tableRows,
    recoverySection,
  ].filter((s) => s !== '').join('\n');
}

// ---------------------------------------------------------------------------
// Sanitization
// ---------------------------------------------------------------------------

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const isSecretFieldName = (name) => {
  if (typeof name !== 'string') return false;
  return SECRET_FIELD_PATTERNS.some((re) => re.test(name));
};

/**
 * Recursively redacts secret-named fields and known-secret headers.
 * Pure function: no I/O, deterministic.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
export function sanitizeForLog(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item));
  }
  if (isPlainObject(value)) {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (isSecretFieldName(key)) {
        out[key] = REDACTED;
      } else {
        out[key] = sanitizeForLog(val);
      }
    }
    return out;
  }
  return value;
}
