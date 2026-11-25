import { defineConfig, devices } from '@playwright/test';

const base = `http://127.0.0.1:${process.env.KALAN_PREVIEW_PORT ?? 4317}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: base, viewport: { width: 1440, height: 900 } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: 'npm run build:mock && npm run preview',
    url: base,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
