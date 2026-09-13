import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import { VitePWA } from 'vite-plugin-pwa';

const API = process.env.NOOK_API_URL ?? 'http://localhost:5000';
const COLLAB = process.env.NOOK_COLLAB_URL ?? 'http://localhost:1234';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true, routesDirectory: './src/routes' }),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Nook',
        short_name: 'Nook',
        description: 'Personal self-hosted Notion',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        // App shell only. API, realtime and collab are never cached (no offline mode yet).
        navigateFallbackDenylist: [/^\/api/, /^\/hub/, /^\/collab/, /^\/internal/, /^\/scalar/],
        runtimeCaching: [],
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: API, changeOrigin: false },
      '/hub': { target: API, ws: true, changeOrigin: false },
      '/collab': {
        target: COLLAB,
        ws: true,
        changeOrigin: false,
        rewrite: (path) => path.replace(/^\/collab/, '') || '/',
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
  },
});
