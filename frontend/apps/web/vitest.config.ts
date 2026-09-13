import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/vite';

export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: false, routesDirectory: './src/routes' }),
    react(),
  ],
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    env: { VITE_MOCK: '1' },
    server: {
      deps: { inline: ['@nook/ui', '@nook/editor', '@nook/plugin-sdk', '@nook/api-client'] },
    },
  },
});
