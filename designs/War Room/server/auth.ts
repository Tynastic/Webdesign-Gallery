/**
 * Who may do what in a room.
 *
 * - Anyone with the room password (or any room without one) may open and edit the plan.
 * - Organizers (the room's creator, holding its owner token, and the admin) may
 *   also edit the line-up, open the room without its password, and delete it.
 *
 * The admin logs in with ADMIN_PASSWORD and gets a signed session token. It is
 * stateless (HMAC over its expiry), so it survives restarts, and changing the
 * password invalidates every session.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { config } from './config.ts'
import { checkPassword, checkToken, type RoomRow } from './db.ts'

const SESSION_DAYS = 30

/** Each room has two documents: the plan ("<id>") and the line-up ("<id>:lineup"). */
export function parseDocumentName(name: string): { room: string; part: 'plan' | 'lineup' } | null {
  const [room, part, ...rest] = name.split(':')
  if (rest.length || !room) return null
  if (part === undefined) return { room, part: 'plan' }
  return part === 'lineup' ? { room, part: 'lineup' } : null
}

const sha256 = (s: string) => createHash('sha256').update(s).digest()
const sessionKey = () => sha256(`war-room-admin-session|${config.adminPassword}`)
const sign = (payload: string) => createHmac('sha256', sessionKey()).update(payload).digest('base64url')

export const adminEnabled = () => config.adminPassword.length > 0

/** Constant-time password comparison (both sides hashed first, so lengths always match). */
export function checkAdminPassword(pw: string): boolean {
  return adminEnabled() && timingSafeEqual(sha256(pw), sha256(config.adminPassword))
}

export function createAdminSession(now = Date.now()): { token: string; expires: number } {
  const expires = now + SESSION_DAYS * 86_400_000
  return { token: `${expires}.${sign(`admin.${expires}`)}`, expires }
}

export function checkAdminSession(token: string, now = Date.now()): boolean {
  if (!adminEnabled() || !token) return false
  const [exp, sig] = token.split('.')
  const expires = Number(exp)
  if (!Number.isFinite(expires) || expires < now || !sig) return false
  const expected = Buffer.from(sign(`admin.${expires}`))
  const actual = Buffer.from(sig)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

/** What a client sends as its Hocuspocus token: JSON credentials, or (older clients) the bare room password. */
export interface Credentials {
  pw: string
  owner: string
  admin: string
}

export function parseCredentials(token: string | undefined): Credentials {
  const raw = token ?? ''
  if (raw.startsWith('{'))
    try {
      const c = JSON.parse(raw)
      return { pw: String(c.pw ?? ''), owner: String(c.owner ?? ''), admin: String(c.admin ?? '') }
    } catch {
      /* not JSON after all: treat as a password */
    }
  return { pw: raw, owner: '', admin: '' }
}

export type Access = 'denied' | 'member' | 'organizer'

export function roomAccess(room: RoomRow, c: Credentials): Access {
  if (checkAdminSession(c.admin) || checkToken(c.owner, room.owner_hash)) return 'organizer'
  if (!room.password_hash) return 'member'
  return c.pw && checkPassword(c.pw, room.password_hash) ? 'member' : 'denied'
}
