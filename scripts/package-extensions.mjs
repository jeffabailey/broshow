import { execSync } from 'child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { patchManifestForFirefox } from './patch-firefox-manifest.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, '..');
const distDir = resolve(root, 'dist');
const packagesDir = resolve(root, 'packages');
const firefoxStaging = resolve(packagesDir, '.firefox-dist');

const log = (msg) => console.log(`[package] ${msg}`);

log('Building extension');
execSync('npm run build', { cwd: root, stdio: 'inherit' });

const manifest = JSON.parse(readFileSync(resolve(distDir, 'manifest.json'), 'utf8'));
const { version } = manifest;
if (!version) {
  console.error('[package] manifest.json is missing a version field');
  process.exit(1);
}

mkdirSync(packagesDir, { recursive: true });
const chromeZip = resolve(packagesDir, `broshow-chrome-${version}.zip`);
const firefoxXpi = resolve(packagesDir, `broshow-firefox-${version}.xpi`);

rmSync(chromeZip, { force: true });
rmSync(firefoxXpi, { force: true });
rmSync(firefoxStaging, { recursive: true, force: true });

log(`Packaging Chrome zip: ${chromeZip}`);
execSync(`zip -qr "${chromeZip}" .`, { cwd: distDir, stdio: 'inherit' });

log('Staging Firefox build with manifest patches');
mkdirSync(firefoxStaging, { recursive: true });
cpSync(distDir, firefoxStaging, { recursive: true });
const firefoxManifestPath = resolve(firefoxStaging, 'manifest.json');
const patched = patchManifestForFirefox(JSON.parse(readFileSync(firefoxManifestPath, 'utf8')));
writeFileSync(firefoxManifestPath, JSON.stringify(patched, null, 2) + '\n');

log(`Packaging Firefox xpi: ${firefoxXpi}`);
execSync(`zip -qr "${firefoxXpi}" .`, { cwd: firefoxStaging, stdio: 'inherit' });

rmSync(firefoxStaging, { recursive: true, force: true });

console.log('');
log(`Built bundles for v${version}:`);
console.log(`  Chrome:  ${chromeZip}`);
console.log(`  Firefox: ${firefoxXpi}`);
console.log('');
console.log('Manual install:');
console.log('  Chrome:  chrome://extensions -> Load unpacked -> point at dist/, or drag the .zip onto the page (after enabling Developer mode)');
console.log('  Firefox: about:debugging#/runtime/this-firefox -> "Load Temporary Add-on" -> select packages/.../manifest.json');
console.log('           (stock Firefox refuses unsigned .xpi installs; use Developer Edition or about:debugging)');
