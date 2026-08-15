import react from '@vitejs/plugin-react'
// Imported from vitest/config, not vite, so the `test` block is typed.
import { defineConfig } from 'vitest/config'

// The dev server proxies /api to the backend so there is no CORS pain locally
// and the refresh cookie behaves the same as it will behind the reverse proxy.
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // A full dashboard render through MSW and jsdom takes a few seconds on a
    // cold worker; the default 5s makes the suite flaky rather than strict.
    testTimeout: 20_000,
  },
})
