import { defineConfig, devices } from '@playwright/test';

// Parallel wave-1 agents each own a Vite port (contracts §11.1), so the port is overridable:
// `NOOK_E2E_PORT=5174 pnpm e2e`. Default stays 5173 for a plain checkout.
const PORT = Number(process.env.NOOK_E2E_PORT ?? 5173);

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `VITE_MOCK=1 pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
    env: { VITE_MOCK: '1' },
  },
});
