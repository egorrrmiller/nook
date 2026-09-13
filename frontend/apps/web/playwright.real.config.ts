import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end against the REAL stack (API + collab + Vite dev proxy) — no mocks, no webServer.
 * Start the services first (see frontend/README.md), then: pnpm e2e:real
 */
export default defineConfig({
  testDir: './e2e-real',
  timeout: 90_000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.NOOK_E2E_BASE ?? 'http://127.0.0.1:5174',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
