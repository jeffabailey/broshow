import { execSync } from 'child_process';
import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { patchManifestForFirefox } from './patch-firefox-manifest.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, '..');
const distDir = resolve(root, 'dist');
const packagesDir = resolve(root, 'packages');
const firefoxStaging = resolve(packagesDir, '.firefox-dist-signed');
const signedDir = resolve(packagesDir, '.signed');

const issuer = process.env.AMO_JWT_ISSUER;
const secret = process.env.AMO_JWT_SECRET;

if (!issuer || !secret) {
  console.error('[sign] AMO_JWT_ISSUER and AMO_JWT_SECRET must be set in the environment.');
  console.error('[sign]   Generate them at https://addons.mozilla.org/en-US/developers/addon/api/key/');
  console.error('[sign]   Then: AMO_JWT_ISSUER=... AMO_JWT_SECRET=... npm run sign');
  process.exit(2);
}

const log = (msg) => console.log(`[sign] ${msg}`);

log('Building extension');
execSync('npm run build', { cwd: root, stdio: 'inherit' });

const manifest = JSON.parse(readFileSync(resolve(distDir, 'manifest.json'), 'utf8'));
const { version } = manifest;
if (!version) {
  console.error('[sign] manifest.json is missing a version field');
  process.exit(1);
}

mkdirSync(packagesDir, { recursive: true });
rmSync(firefoxStaging, { recursive: true, force: true });
rmSync(signedDir, { recursive: true, force: true });
mkdirSync(firefoxStaging, { recursive: true });
mkdirSync(signedDir, { recursive: true });

log('Staging Firefox build with manifest patches');
cpSync(distDir, firefoxStaging, { recursive: true });
const firefoxManifestPath = resolve(firefoxStaging, 'manifest.json');
const patched = patchManifestForFirefox(JSON.parse(readFileSync(firefoxManifestPath, 'utf8')));
writeFileSync(firefoxManifestPath, JSON.stringify(patched, null, 2) + '\n');

log('Submitting to AMO for signing (this can take 30-60 seconds)');
execSync(
  [
    'npx web-ext sign',
    `--source-dir "${firefoxStaging}"`,
    `--artifacts-dir "${signedDir}"`,
    '--channel unlisted',
    `--api-key "${issuer}"`,
    `--api-secret "${secret}"`,
  ].join(' '),
  { stdio: 'inherit', cwd: root },
);

const signedXpi = readdirSync(signedDir).find((f) => f.endsWith('.xpi'));
if (!signedXpi) {
  console.error('[sign] web-ext sign did not produce an .xpi file');
  process.exit(1);
}

const finalPath = resolve(packagesDir, `broshow-firefox-${version}-signed.xpi`);
rmSync(finalPath, { force: true });
renameSync(resolve(signedDir, signedXpi), finalPath);
rmSync(firefoxStaging, { recursive: true, force: true });
rmSync(signedDir, { recursive: true, force: true });

console.log('');
log(`Signed xpi for v${version}: ${finalPath}`);
console.log('');
console.log('Drag and drop this file onto stock Firefox to install.');
