import { execSync, spawn } from 'child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { patchManifestForFirefox } from './patch-firefox-manifest.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, '..');
const distDir = resolve(root, 'dist');
const stagingDir = resolve(root, '.firefox-dev');

const log = (msg) => console.log(`[dev:firefox] ${msg}`);

log('Building extension');
execSync('npm run build', { cwd: root, stdio: 'inherit' });

log('Staging Firefox build with manifest patches');
rmSync(stagingDir, { recursive: true, force: true });
mkdirSync(stagingDir, { recursive: true });
cpSync(distDir, stagingDir, { recursive: true });
const manifestPath = resolve(stagingDir, 'manifest.json');
const patched = patchManifestForFirefox(JSON.parse(readFileSync(manifestPath, 'utf8')));
writeFileSync(manifestPath, JSON.stringify(patched, null, 2) + '\n');

const firefoxBinary = '/Applications/Firefox.app/Contents/MacOS/firefox';
if (!existsSync(firefoxBinary)) {
  console.error(`[dev:firefox] Firefox not found at ${firefoxBinary}. Adjust the path or install Firefox.`);
  process.exit(1);
}

log('Launching Firefox via web-ext run (extension auto-installed as temporary add-on)');
log('  Edit src/, then web-ext will hot-reload the extension automatically.');
log('  Press Ctrl+C here to stop Firefox.');

const child = spawn(
  'npx',
  [
    'web-ext', 'run',
    '--source-dir', stagingDir,
    '--target', 'firefox-desktop',
    '--firefox-binary', firefoxBinary,
    '--keep-profile-changes',
  ],
  { stdio: 'inherit', cwd: root },
);

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
