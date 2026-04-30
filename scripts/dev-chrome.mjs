import { execSync, spawn } from 'child_process';
import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, '..');
const distDir = resolve(root, 'dist');

const log = (msg) => console.log(`[dev:chrome] ${msg}`);

log('Building extension');
execSync('npm run build', { cwd: root, stdio: 'inherit' });

const chromeBinary = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!existsSync(chromeBinary)) {
  console.error(`[dev:chrome] Chrome not found at ${chromeBinary}. Adjust the path or install Chrome.`);
  process.exit(1);
}

log('Launching Chrome via web-ext run (extension auto-loaded as unpacked)');
log('  Edit src/, then web-ext will hot-reload the extension automatically.');
log('  Press Ctrl+C here to stop Chrome.');

const child = spawn(
  'npx',
  [
    'web-ext', 'run',
    '--source-dir', distDir,
    '--target', 'chromium',
    '--chromium-binary', chromeBinary,
    '--keep-profile-changes',
  ],
  { stdio: 'inherit', cwd: root },
);

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
