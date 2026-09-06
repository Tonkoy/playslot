import { defineConfig, devices } from '@playwright/test';

/**
 * Consumer-facing E2E (spec §25). Runs against a live stack (web + api + seeded
 * Postgres). Point PLAYWRIGHT_BASE_URL at the web app; defaults to the dev port.
 * Browsers install with `npx playwright install chromium`.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3210',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
