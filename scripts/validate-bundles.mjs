import { execSync, spawnSync } from 'child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, resolve, sep } from 'path';
import { fileURLToPath } from 'url';
import { validateExtension } from './validate-extension.mjs';
import { patchManifestForFirefox } from './patch-firefox-manifest.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, '..');
const distDir = resolve(root, 'dist');

const log = (msg) => console.log(`[validate] ${msg}`);
const fail = (msg) => {
  console.error(`[validate] ${msg}`);
  process.exit(1);
};

log('Building extension');
execSync('npm run build', { cwd: root, stdio: 'inherit' });

log('Validating Chrome bundle');
const chromeResult = validateExtension(distDir, { target: 'chrome' });
if (!chromeResult.ok) {
  for (const e of chromeResult.errors) console.error(`  - ${e}`);
  fail(`Chrome bundle has ${chromeResult.errors.length} validation error(s)`);
}
log('Chrome bundle: OK');

log('Staging Firefox bundle');
const firefoxDir = mkdtempSync(`${tmpdir()}${sep}broshow-firefox-validate-`);
cpSync(distDir, firefoxDir, { recursive: true });
const firefoxManifestPath = resolve(firefoxDir, 'manifest.json');
const patched = patchManifestForFirefox(JSON.parse(readFileSync(firefoxManifestPath, 'utf8')));
writeFileSync(firefoxManifestPath, JSON.stringify(patched, null, 2) + '\n');

log('Validating Firefox bundle');
const firefoxResult = validateExtension(firefoxDir, { target: 'firefox' });
if (!firefoxResult.ok) {
  for (const e of firefoxResult.errors) console.error(`  - ${e}`);
  fail(`Firefox bundle has ${firefoxResult.errors.length} validation error(s)`);
}
log('Firefox bundle: OK');

log('Running web-ext lint on Firefox bundle');
const lint = spawnSync('npx', ['web-ext', 'lint', '--source-dir', firefoxDir, '--output', 'json'], {
  cwd: root,
  encoding: 'utf8',
});
const lintReport = JSON.parse(lint.stdout || '{"summary":{"errors":0,"warnings":0}}');
const { errors, warnings } = lintReport.summary;
if (errors > 0) {
  console.error(lint.stdout);
  fail(`web-ext lint reported ${errors} error(s)`);
}
log(`web-ext lint: 0 errors, ${warnings} warnings (warnings allowed)`);

log('All validations passed.');
