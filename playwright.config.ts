import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  testDir: path.resolve(__dirname, 'tests/acceptance'),
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  retries: 0,
  workers: 1, // Extensions require serial execution

  use: {
    // Extension testing requires headed Chromium with specific flags.
    // Playwright's default browser context does NOT support extensions;
    // each test must use chromium.launchPersistentContext() directly.
    // The "use" block here provides shared config only.
    headless: false,
    viewport: { width: 1280, height: 720 },
  },

  projects: [
    {
      name: 'chromium-extension',
      use: {
        browserName: 'chromium',
      },
    },
  ],
});
