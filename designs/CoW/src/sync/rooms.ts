/** Room API client, routing helpers and the per-browser list of recently opened rooms. */

export interface RoomInfo {
  exists: boolean
  protected: boolean
  title: string
}

export interface RecentRoom {
  id: string
  title: string
  openedAt: number
}

export type LegalPageId = 'impressum' | 'datenschutz'
export type Route = { kind: 'lobby' } | { kind: 'local' } | { kind: 'room'; id: string } | { kind: 'legal'; page: LegalPageId }

const ROOM_ID = /^[A-Za-z0-9_-]{6,32}$/

export function parseRoute(path = location.pathname): Route {
  const m = path.match(/^\/r\/([^/]+)\/?$/)
  if (m && ROOM_ID.test(m[1])) return { kind: 'room', id: m[1] }
  if (/^\/local\/?$/.test(path)) return { kind: 'local' }
  const legal = path.match(/^\/(impressum|datenschutz)\/?$/)
  if (legal) return { kind: 'legal', page: legal[1] as LegalPageId }
  return { kind: 'lobby' }
}

/** Accepts a full share link or a bare room id. */
export function roomIdFromInput(input: string): string | null {
  const s = input.trim()
  if (ROOM_ID.test(s)) return s
  try {
    const r = parseRoute(new URL(s, location.origin).pathname)
    return r.kind === 'room' ? r.id : null
  } catch {
    return null
  }
}

export const roomUrl = (id: string) => `${location.origin}/r/${id}`

/** Creates a room; the owner token (needed to delete it) is kept in this browser. */
export async function createRoom(title: string, password: string): Promise<string> {
  const res = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, password }),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`)
  const { id, ownerToken } = await res.json()
  try {
    localStorage.setItem(OWNER_KEY(id), ownerToken)
  } catch {
    /* without storage the room simply can't be deleted from this browser */
  }
  return id
}

const OWNER_KEY = (id: string) => `cow-planner.owner.${id}`

export function ownerToken(id: string): string | null {
  try {
    return localStorage.getItem(OWNER_KEY(id))
  } catch {
    return null
  }
}

/** Deletes a room for everyone (owner only). */
export async function deleteRoom(id: string): Promise<void> {
  const res = await fetch(`/api/rooms/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${ownerToken(id) ?? ''}` } })
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`)
  forgetRoom(id)
  try {
    localStorage.removeItem(OWNER_KEY(id))
  } catch {
    /* ignore */
  }
}

/** null when the server cannot be reached (offline: the cached copy can still be opened). */
export async function getRoom(id: string): Promise<RoomInfo | null> {
  try {
    const res = await fetch(`/api/rooms/${encodeURIComponent(id)}`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

const RECENT_KEY = 'cow-planner.recent'
const PW_KEY = (id: string) => `cow-planner.pw.${id}`

export function recentRooms(): RecentRoom[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
  } catch {
    return []
  }
}

export function rememberRoom(id: string, title: string) {
  try {
    const list = [{ id, title, openedAt: Date.now() }, ...recentRooms().filter((r) => r.id !== id)].slice(0, 8)
    localStorage.setItem(RECENT_KEY, JSON.stringify(list))
  } catch {
    /* storage unavailable */
  }
}

export function forgetRoom(id: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recentRooms().filter((r) => r.id !== id)))
    sessionStorage.removeItem(PW_KEY(id))
  } catch {
    /* storage unavailable */
  }
}

/** Room passwords are kept for the browser session only, never in long-term storage. */
export function storedPassword(id: string): string {
  try {
    return sessionStorage.getItem(PW_KEY(id)) ?? ''
  } catch {
    return ''
  }
}

export function storePassword(id: string, pw: string) {
  try {
    if (pw) sessionStorage.setItem(PW_KEY(id), pw)
    else sessionStorage.removeItem(PW_KEY(id))
  } catch {
    /* storage unavailable */
  }
}
