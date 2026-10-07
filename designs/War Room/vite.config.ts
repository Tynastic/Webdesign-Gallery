/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const SERVER = `localhost:${process.env.SERVER_PORT ?? 1234}`

/** "0.4.0+a4cdf26": package version plus git commit, shown in Help and sent with feedback. */
function appVersion() {
  const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
  if (process.env.APP_COMMIT) return `${version}+${process.env.APP_COMMIT.slice(0, 7)}` // Docker builds have no .git
  try {
    return `${version}+${execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()}`
  } catch {
    return version
  }
}

export default defineConfig({
  plugins: [vue()],
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  server: {
    port: 5173,
    // The sync server handles the room API and the Yjs websocket; in production it also serves dist/.
    proxy: {
      '/api': `http://${SERVER}`,
      '/collab': { target: `ws://${SERVER}`, ws: true },
    },
  },
  // The planner chunk (Leaflet, Yjs, map code) is loaded lazily after the lobby; it is one cohesive unit.
  build: { chunkSizeWarningLimit: 600 },
  test: { include: ['tests/**/*.test.ts'] },
})
