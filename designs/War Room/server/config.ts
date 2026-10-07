/** Server configuration from environment variables (see DEPLOY.md). */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const int = (name: string, fallback: number) => {
  const v = Number(process.env[name])
  return Number.isFinite(v) && v > 0 ? v : fallback
}

function readVersion(): string {
  try {
    return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
  } catch {
    return 'dev'
  }
}

export const config = {
  root,
  port: int('PORT', 1234),
  dataDir: resolve(process.env.DATA_DIR ?? join(root, 'server', 'data')),
  distDir: join(root, 'dist'),
  /** Operator-editable legal pages (Impressum, Datenschutz). */
  legalDir: resolve(process.env.LEGAL_DIR ?? join(root, 'server', 'legal')),
  /** Behind a reverse proxy (Caddy): take the client IP from X-Forwarded-For. */
  trustProxy: process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true',
  /** Enables the /api/admin/* endpoints (feedback, errors, room stats). Unset = disabled. */
  adminToken: process.env.ADMIN_TOKEN ?? '',
  /** Rooms without any activity for this many days are deleted. */
  roomTtlDays: int('ROOM_TTL_DAYS', 90),
  limits: {
    roomsPerHour: int('LIMIT_ROOMS_PER_HOUR', 10),
    feedbackPerHour: int('LIMIT_FEEDBACK_PER_HOUR', 10),
    errorsPerHour: int('LIMIT_ERRORS_PER_HOUR', 30),
    connectionsPerIp: int('LIMIT_CONNECTIONS_PER_IP', 20),
    /** Largest single websocket message (a sync update). */
    maxMessageBytes: int('LIMIT_MESSAGE_BYTES', 2 * 1024 * 1024),
    /** Plans above this size are no longer stored (logged loudly). A normal plan is a few hundred KB. */
    maxDocumentBytes: int('LIMIT_DOCUMENT_BYTES', 20 * 1024 * 1024),
    maxBodyBytes: 16 * 1024,
  },
  version: readVersion(),
}
