import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const collectIconPaths = (icons) => {
  if (!icons) return [];
  if (typeof icons === 'string') return [icons];
  if (typeof icons === 'object') return Object.values(icons).filter((v) => typeof v === 'string');
  return [];
};

const collectManifestFileRefs = (manifest) => {
  const refs = [];

  if (manifest.background?.service_worker) refs.push(manifest.background.service_worker);
  if (Array.isArray(manifest.background?.scripts)) refs.push(...manifest.background.scripts);

  if (manifest.action?.default_popup) refs.push(manifest.action.default_popup);
  refs.push(...collectIconPaths(manifest.action?.default_icon));

  if (manifest.options_ui?.page) refs.push(manifest.options_ui.page);
  if (manifest.options_page) refs.push(manifest.options_page);
  if (manifest.devtools_page) refs.push(manifest.devtools_page);
  if (manifest.side_panel?.default_path) refs.push(manifest.side_panel.default_path);

  refs.push(...collectIconPaths(manifest.icons));

  if (Array.isArray(manifest.content_scripts)) {
    for (const cs of manifest.content_scripts) {
      if (Array.isArray(cs.js)) refs.push(...cs.js);
      if (Array.isArray(cs.css)) refs.push(...cs.css);
    }
  }

  if (Array.isArray(manifest.web_accessible_resources)) {
    for (const war of manifest.web_accessible_resources) {
      if (Array.isArray(war.resources)) refs.push(...war.resources);
    }
  }

  if (Array.isArray(manifest.sandbox?.pages)) refs.push(...manifest.sandbox.pages);

  return refs;
};

const REQUIRED_TOP_LEVEL = ['name', 'version', 'manifest_version'];

export const validateExtension = (extensionPath, { target = 'chrome' } = {}) => {
  const errors = [];
  const warnings = [];
  const manifestPath = resolve(extensionPath, 'manifest.json');

  if (!existsSync(manifestPath)) {
    return { ok: false, errors: [`manifest.json not found at ${manifestPath}`], warnings: [] };
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    return {
      ok: false,
      errors: [`manifest.json is not valid JSON: ${e.message}`],
      warnings: [],
    };
  }

  for (const field of REQUIRED_TOP_LEVEL) {
    if (manifest[field] === undefined || manifest[field] === '') {
      errors.push(`manifest missing required field: ${field}`);
    }
  }

  if (manifest.manifest_version !== 3) {
    errors.push(`manifest_version must be 3 (got ${JSON.stringify(manifest.manifest_version)})`);
  }

  if (typeof manifest.version === 'string' && !/^\d+(\.\d+){0,3}$/.test(manifest.version)) {
    errors.push(`manifest version must be 1-4 dot-separated integers (got "${manifest.version}")`);
  }

  if (target === 'firefox') {
    const geckoId = manifest.browser_specific_settings?.gecko?.id;
    if (!geckoId) {
      errors.push(
        'firefox build is missing browser_specific_settings.gecko.id (without it Firefox reports the xpi as corrupt)',
      );
    }
    const scripts = manifest.background?.scripts;
    if (!Array.isArray(scripts) || scripts.length === 0) {
      errors.push(
        'firefox build is missing background.scripts fallback (Firefox MV3 install requires it alongside service_worker)',
      );
    }
  }

  const refs = collectManifestFileRefs(manifest);
  for (const ref of refs) {
    const target = resolve(extensionPath, ref);
    if (!existsSync(target)) {
      errors.push(`manifest references missing file: ${ref}`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
};

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const [, , extensionPath, target = 'chrome'] = process.argv;
  if (!extensionPath) {
    console.error('Usage: node scripts/validate-extension.mjs <extension-dir> [chrome|firefox]');
    process.exit(2);
  }
  const absPath = resolve(extensionPath);
  const result = validateExtension(absPath, { target });
  if (!result.ok) {
    console.error(`[validate] FAIL (${target}) — ${absPath}`);
    for (const e of result.errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`[validate] OK (${target}) — ${absPath}`);
}
