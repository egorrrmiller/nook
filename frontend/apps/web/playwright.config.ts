import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'VITE_MOCK=1 pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
    env: { VITE_MOCK: '1' },
  },
});
