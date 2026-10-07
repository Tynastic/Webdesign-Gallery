import { defineConfig } from '@playwright/test'

/**
 * Local: starts web + sync servers (or reuses a running `npm run dev`).
 * Against a production build: E2E_BASE_URL=http://host:port (build with VITE_E2E=1 to expose the test hook).
 */
const external = process.env.E2E_BASE_URL

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { baseURL: external ?? 'http://localhost:5173', viewport: { width: 1440, height: 860 } },
  webServer: external ? undefined : { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 60_000 },
})
