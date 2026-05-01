// scripts/publish-orchestrator.effect.mjs
//
// EFFECT module: composition root for the marketplace publish flow.
// Driving port: runPublish(env, deps).
//
// Pipeline:
//   parseTargets >> parseMode >> validateConfig >> planRun
//   >> dispatch (parallel via Promise.allSettled)
//   >> aggregateOutcomes >> renderSummary >> writeStepSummary
//
// Adapters are injected via `deps` for testability. Defaults import the
// real adapters lazily so tests that pass full deps never trigger
// network/spawn imports.

import {
  parseTargets,
  parseMode,
  classifyVersionState,
  planRun,
  aggregateOutcomes,
  renderSummary,
} from './decisions.pure.mjs';

const CWS_DASHBOARD_BASE = 'https://chrome.google.com/webstore/devconsole';
const AMO_DASHBOARD_BASE = 'https://addons.mozilla.org/en-US/developers/addon';
const AMO_ADDON_GUID = 'broshow@jeffabailey.com';

const DRY_RUN_PREFIX = '[DRY RUN]';

// ---------------------------------------------------------------------------
// Default adapter loaders (lazy)
// ---------------------------------------------------------------------------

const loadCwsAdapter = async () => import('./cws-adapter.effect.mjs');
const loadAmoAdapter = async () => import('./amo-listed-adapter.effect.mjs');
const loadFsAdapter = async () => import('./fs-adapter.effect.mjs');

const resolveCwsAdapter = (deps) => deps?.cwsAdapter ?? loadCwsAdapter();
const resolveAmoAdapter = (deps) => deps?.amoAdapter ?? loadAmoAdapter();
const resolveFsAdapter = (deps) => deps?.fs ?? loadFsAdapter();

const resolveLog = (deps) => (deps && typeof deps.log === 'function' ? deps.log : () => {});
const resolveLogError = (deps) =>
  deps && typeof deps.logError === 'function' ? deps.logError : () => {};
const resolveNow = (deps) => (deps && typeof deps.now === 'function' ? deps.now : () => Date.now());

// ---------------------------------------------------------------------------
// Config validation
// ---------------------------------------------------------------------------

const buildOutcome = ({ target, version, status, message, errorCode, dashboardUrl, durationSeconds }) => ({
  target,
  status,
  version,
  message,
  errorCode: errorCode ?? null,
  dashboardUrl: dashboardUrl ?? null,
  durationSeconds: durationSeconds ?? 0,
});

const buildCwsDashboardUrl = (extensionId) =>
  extensionId ? `${CWS_DASHBOARD_BASE}/${extensionId}` : CWS_DASHBOARD_BASE;

const buildAmoDashboardUrl = (guid) =>
  `${AMO_DASHBOARD_BASE}/${encodeURIComponent(guid || AMO_ADDON_GUID)}/`;

const cwsCredsFromEnv = (env) => ({
  clientId: env.CWS_CLIENT_ID,
  clientSecret: env.CWS_CLIENT_SECRET,
  refreshToken: env.CWS_REFRESH_TOKEN,
  extensionId: env.CWS_EXTENSION_ID,
});

const amoCredsFromEnv = (env) => ({
  issuer: env.AMO_JWT_ISSUER,
  secret: env.AMO_JWT_SECRET,
});

const isMissingCwsCreds = (env) => {
  const creds = cwsCredsFromEnv(env);
  return !creds.clientId || !creds.clientSecret || !creds.refreshToken || !creds.extensionId;
};

const isMissingAmoCreds = (env) => {
  const creds = amoCredsFromEnv(env);
  return !creds.issuer || !creds.secret;
};

const dryRunMessage = (action) => `${DRY_RUN_PREFIX} ${action}`;

// ---------------------------------------------------------------------------
// CWS step
// ---------------------------------------------------------------------------

const runCwsStep = async (mode, version, env, deps, now) => {
  const startMs = now();
  const cwsCreds = cwsCredsFromEnv(env);
  const dashboardUrl = buildCwsDashboardUrl(cwsCreds.extensionId);
  const target = 'cws';

  if (isMissingCwsCreds(env)) {
    return buildOutcome({
      target,
      version,
      status: mode === 'dry-run' ? 'would-fail' : 'failure',
      message: `${mode === 'dry-run' ? DRY_RUN_PREFIX + ' ' : ''}Missing CWS credentials (CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN, CWS_EXTENSION_ID required).`,
      errorCode: 'config_missing',
      dashboardUrl,
      durationSeconds: (now() - startMs) / 1000,
    });
  }

  const cws = await resolveCwsAdapter(deps);
  const adapterDeps = { fetch: deps?.fetch };

  // Step 1: exchange refresh token.
  const tokenResult = await cws.exchangeCwsRefreshToken(cwsCreds, adapterDeps);
  if (!tokenResult.ok) {
    const messagePrefix = mode === 'dry-run' ? `${DRY_RUN_PREFIX} ` : '';
    return buildOutcome({
      target,
      version,
      status: mode === 'dry-run' ? 'would-fail' : 'failure',
      message: `${messagePrefix}OAuth refresh failed: ${tokenResult.error.message}`,
      errorCode: tokenResult.error.code,
      dashboardUrl,
      durationSeconds: (now() - startMs) / 1000,
    });
  }
  const accessToken = tokenResult.value.accessToken;

  // Step 2: probe item state to classify available/already-published/partial.
  const probeResult = await cws.probeCwsItemState(cwsCreds, accessToken, adapterDeps);
  if (!probeResult.ok) {
    const messagePrefix = mode === 'dry-run' ? `${DRY_RUN_PREFIX} ` : '';
    return buildOutcome({
      target,
      version,
      status: mode === 'dry-run' ? 'would-fail' : 'failure',
      message: `${messagePrefix}CWS probe failed: ${probeResult.error.message}`,
      errorCode: probeResult.error.code,
      dashboardUrl,
      durationSeconds: (now() - startMs) / 1000,
    });
  }
  const itemState = probeResult.value;
  const existingVersions = new Set();
  if (itemState.publishedVersion) existingVersions.add(itemState.publishedVersion);
  const versionState = classifyVersionState(version, existingVersions, itemState.draftVersion);

  if (versionState === 'already-published') {
    if (mode === 'dry-run') {
      return buildOutcome({
        target,
        version,
        status: 'would-fail',
        message: dryRunMessage(`Version ${version} already published to CWS; publish would fail.`),
        errorCode: 'version_conflict',
        dashboardUrl,
        durationSeconds: (now() - startMs) / 1000,
      });
    }
    return buildOutcome({
      target,
      version,
      status: 'already-published',
      message: `Version ${version} already published to CWS.`,
      dashboardUrl,
      durationSeconds: (now() - startMs) / 1000,
    });
  }

  if (mode === 'dry-run') {
    return buildOutcome({
      target,
      version,
      status: 'would-succeed',
      message: dryRunMessage(`Would upload+publish ${version} to CWS (state=${versionState}).`),
      dashboardUrl,
      durationSeconds: (now() - startMs) / 1000,
    });
  }

  // Step 3: upload zip.
  const zipPath = locateChromeZip(env, version);
  const uploadResult = await cws.uploadCwsItem(cwsCreds, accessToken, zipPath, adapterDeps);
  if (!uploadResult.ok) {
    return buildOutcome({
      target,
      version,
      status: 'failure',
      message: `CWS upload failed: ${uploadResult.error.message}`,
      errorCode: uploadResult.error.code,
      dashboardUrl,
      durationSeconds: (now() - startMs) / 1000,
    });
  }

  // Step 4: publish (or skip if upload-only).
  if (mode === 'upload-only') {
    return buildOutcome({
      target,
      version,
      status: 'success',
      message: `Uploaded ${version} to CWS (publish skipped per upload-only mode).`,
      dashboardUrl,
      durationSeconds: (now() - startMs) / 1000,
    });
  }

  const publishTarget = env.CWS_PUBLISH === 'trustedTesters' ? 'trustedTesters' : 'default';
  const publishResult = await cws.publishCwsItem(cwsCreds, accessToken, publishTarget, adapterDeps);
  if (!publishResult.ok) {
    return buildOutcome({
      target,
      version,
      status: 'failure',
      message: `CWS publish failed: ${publishResult.error.message}`,
      errorCode: publishResult.error.code,
      dashboardUrl,
      durationSeconds: (now() - startMs) / 1000,
    });
  }

  return buildOutcome({
    target,
    version,
    status: 'success',
    message: `Published ${version} to CWS (target=${publishTarget}).`,
    dashboardUrl,
    durationSeconds: (now() - startMs) / 1000,
  });
};

// ---------------------------------------------------------------------------
// AMO step
// ---------------------------------------------------------------------------

const runAmoStep = async (mode, version, env, deps, now) => {
  const startMs = now();
  const amoCreds = amoCredsFromEnv(env);
  const dashboardUrl = buildAmoDashboardUrl(AMO_ADDON_GUID);
  const target = 'amo-listed';

  if (isMissingAmoCreds(env)) {
    return buildOutcome({
      target,
      version,
      status: mode === 'dry-run' ? 'would-fail' : 'failure',
      message: `${mode === 'dry-run' ? DRY_RUN_PREFIX + ' ' : ''}Missing AMO credentials (AMO_JWT_ISSUER, AMO_JWT_SECRET required).`,
      errorCode: 'config_missing',
      dashboardUrl,
      durationSeconds: (now() - startMs) / 1000,
    });
  }

  const amo = await resolveAmoAdapter(deps);
  const adapterDeps = { fetch: deps?.fetch, spawn: deps?.spawn };

  // Step 1: probe listed versions.
  const probeResult = await amo.probeAmoListedVersions(amoCreds, AMO_ADDON_GUID, adapterDeps);
  if (!probeResult.ok) {
    const messagePrefix = mode === 'dry-run' ? `${DRY_RUN_PREFIX} ` : '';
    return buildOutcome({
      target,
      version,
      status: mode === 'dry-run' ? 'would-fail' : 'failure',
      message: `${messagePrefix}AMO probe failed: ${probeResult.error.message}`,
      errorCode: probeResult.error.code,
      dashboardUrl,
      durationSeconds: (now() - startMs) / 1000,
    });
  }
  const existingVersions = probeResult.value;
  const versionState = classifyVersionState(version, existingVersions, null);

  if (versionState === 'already-published') {
    if (mode === 'dry-run') {
      return buildOutcome({
        target,
        version,
        status: 'would-fail',
        message: dryRunMessage(`Version ${version} already on AMO listed channel; submit would fail.`),
        errorCode: 'version_conflict',
        dashboardUrl,
        durationSeconds: (now() - startMs) / 1000,
      });
    }
    return buildOutcome({
      target,
      version,
      status: 'already-published',
      message: `Version ${version} already on AMO listed channel.`,
      dashboardUrl,
      durationSeconds: (now() - startMs) / 1000,
    });
  }

  if (mode === 'dry-run') {
    return buildOutcome({
      target,
      version,
      status: 'would-succeed',
      message: dryRunMessage(`Would submit ${version} to AMO listed channel (state=${versionState}).`),
      dashboardUrl,
      durationSeconds: (now() - startMs) / 1000,
    });
  }

  // Step 2: submit via web-ext sign.
  const xpiPath = locateFirefoxXpi(env, version);
  const submitResult = await amo.submitAmoListed(amoCreds, xpiPath, version, adapterDeps);
  if (!submitResult.ok) {
    return buildOutcome({
      target,
      version,
      status: 'failure',
      message: `AMO submit failed: ${submitResult.error.message}`,
      errorCode: submitResult.error.code,
      dashboardUrl,
      durationSeconds: (now() - startMs) / 1000,
    });
  }

  return buildOutcome({
    target,
    version,
    status: 'success',
    message: `Submitted ${version} to AMO listed channel (submissionId=${submitResult.value.submissionId ?? 'unknown'}).`,
    dashboardUrl,
    durationSeconds: (now() - startMs) / 1000,
  });
};

// ---------------------------------------------------------------------------
// Artifact path resolution
// ---------------------------------------------------------------------------

const locateChromeZip = (env, version) => {
  if (env.CHROME_ZIP_PATH) return env.CHROME_ZIP_PATH;
  const dir = env.ARTIFACT_DIR || '.';
  return `${dir}/broshow-chrome-${version}.zip`;
};

const locateFirefoxXpi = (env, version) => {
  if (env.FIREFOX_XPI_PATH) return env.FIREFOX_XPI_PATH;
  const dir = env.ARTIFACT_DIR || '.';
  return `${dir}/broshow-firefox-${version}.xpi`;
};

// ---------------------------------------------------------------------------
// Step dispatch
// ---------------------------------------------------------------------------

const dispatchStep = async (step, version, env, deps, now) => {
  if (step.target === 'cws') return runCwsStep(step.mode, version, env, deps, now);
  if (step.target === 'amo-listed') return runAmoStep(step.mode, version, env, deps, now);
  // Should be unreachable given parseTargets enforcement.
  return buildOutcome({
    target: step.target,
    version,
    status: 'failure',
    message: `Unknown target: ${step.target}`,
    errorCode: 'unknown_target',
  });
};

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * @param {Record<string,string>} env
 * @param {Object} [deps]
 * @returns {Promise<{exitCode: 0|1, outcomes: ReadonlyArray<Object>, summaryMarkdown: string, recoveryHint: string|null, memoryRulePreserved: boolean}>}
 */
export async function runPublish(env, deps) {
  const now = resolveNow(deps);
  const log = resolveLog(deps);
  const logError = resolveLogError(deps);

  // Step 1 & 2: parse inputs (pure).
  let targets;
  let mode;
  try {
    targets = parseTargets(env.TARGETS || 'cws,amo-listed');
    mode = parseMode({ mode: env.MODE, cwsPublish: env.CWS_PUBLISH });
  } catch (err) {
    logError('runPublish: input parse error:', err.message);
    const errorOutcome = buildOutcome({
      target: 'cws',
      version: '',
      status: 'failure',
      message: `Configuration error: ${err.message}`,
      errorCode: 'config_invalid',
    });
    const result = aggregateOutcomes([errorOutcome]);
    const summaryMarkdown = renderSummary(result);
    await safeWriteSummary(deps, summaryMarkdown, env.SUMMARY_PATH);
    return {
      exitCode: 1,
      outcomes: result.outcomes,
      summaryMarkdown,
      recoveryHint: result.recoveryHint,
      memoryRulePreserved: result.memoryRulePreserved,
    };
  }

  if (targets.length === 0) {
    log('runPublish: no targets selected; nothing to do.');
    return {
      exitCode: 0,
      outcomes: [],
      summaryMarkdown: '',
      recoveryHint: null,
      memoryRulePreserved: true,
    };
  }

  // Step 3: read manifest version from disk.
  const fs = await resolveFsAdapter(deps);
  let version;
  try {
    version = env.MANIFEST_PATH ? await fs.readManifestVersion(env.MANIFEST_PATH) : '';
    if (!version) {
      throw new Error('manifest version is empty');
    }
  } catch (err) {
    logError('runPublish: manifest read error:', err.message);
    const errorOutcome = buildOutcome({
      target: targets[0],
      version: '',
      status: 'failure',
      message: `Manifest read failed: ${err.message}`,
      errorCode: 'manifest_invalid',
    });
    const result = aggregateOutcomes([errorOutcome]);
    const summaryMarkdown = renderSummary(result);
    await safeWriteSummary(deps, summaryMarkdown, env.SUMMARY_PATH);
    return {
      exitCode: 1,
      outcomes: result.outcomes,
      summaryMarkdown,
      recoveryHint: result.recoveryHint,
      memoryRulePreserved: result.memoryRulePreserved,
    };
  }

  // Step 4: plan execution (pure).
  const steps = planRun(targets, mode);

  // Step 5: dispatch in parallel (effects).
  const settled = await Promise.allSettled(
    steps.map((step) => dispatchStep(step, version, env, deps, now))
  );
  const outcomes = settled.map((settlement, idx) => {
    if (settlement.status === 'fulfilled') return settlement.value;
    const step = steps[idx];
    const reasonMessage = settlement.reason?.message ?? String(settlement.reason);
    logError(`runPublish: step for ${step.target} threw:`, reasonMessage);
    return buildOutcome({
      target: step.target,
      version,
      status: step.mode === 'dry-run' ? 'would-fail' : 'failure',
      message: `Unexpected error: ${reasonMessage}`,
      errorCode: 'unknown_http',
    });
  });

  // Step 6: aggregate (pure).
  const aggregate = aggregateOutcomes(outcomes);

  // Step 7: render and write summary (effects at edge).
  const summaryMarkdown = renderSummary(aggregate);
  await safeWriteSummary(deps, summaryMarkdown, env.SUMMARY_PATH);

  return {
    exitCode: aggregate.exitCode,
    outcomes: aggregate.outcomes,
    summaryMarkdown,
    recoveryHint: aggregate.recoveryHint,
    memoryRulePreserved: aggregate.memoryRulePreserved,
  };
}

const safeWriteSummary = async (deps, markdown, summaryPath) => {
  try {
    const fs = await resolveFsAdapter(deps);
    await fs.writeStepSummary(markdown, summaryPath);
  } catch (err) {
    const logError = resolveLogError(deps);
    logError('runPublish: writeStepSummary error:', err?.message ?? String(err));
  }
};
