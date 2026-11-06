/**
 * The admin user: logs in once in the lobby with ADMIN_PASSWORD and can then open
 * every room without its password, organize any line-up and delete rooms. The
 * session token is kept in this browser until it expires (30 days) or the admin logs out.
 */
import { ref } from 'vue'

const KEY = 'cow-planner.admin'

interface StoredSession {
  token: string
  expires: number
}

function read(): StoredSession | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as StoredSession | null
    return s && s.token && s.expires > Date.now() ? s : null
  } catch {
    return null
  }
}

/** Reactive: whether this browser holds an (unexpired) admin session. */
export const isAdmin = ref(read() !== null)

export const adminToken = (): string => read()?.token ?? ''

export async function adminLogin(password: string): Promise<void> {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`)
  const session = (await res.json()) as StoredSession
  try {
    localStorage.setItem(KEY, JSON.stringify(session))
  } catch {
    /* without storage the login only lasts until reload */
  }
  isAdmin.value = true
}

export function adminLogout() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
  isAdmin.value = false
}

/** Whether the server offers an admin login, and whether our session is still valid there (null = server unreachable). */
export async function adminStatus(): Promise<{ enabled: boolean; valid: boolean } | null> {
  try {
    const res = await fetch('/api/admin/session', { headers: { Authorization: `Bearer ${adminToken()}` } })
    if (!res.ok) return null
    const s = await res.json()
    if (!s.valid && isAdmin.value) adminLogout()
    return s
  } catch {
    return null
  }
}

/** A room as the admin's room management lists it. */
export interface AdminRoom {
  id: string
  title: string
  protected: boolean
  createdAt: number
  /** Last change to the plan or its line-up. */
  updatedAt: number
  online: number
  players: number
  seated: number
  planned: number
  drawings: number
  conquered: number
  bytes: number
  /** No players, plans, drawings or conquests. */
  empty: boolean
}

async function adminFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${adminToken()}` } })
  if (res.status === 403) adminLogout()
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`)
  return res.json()
}

export const adminRooms = (): Promise<{ ttlDays: number; rooms: AdminRoom[] }> => adminFetch('/api/admin/rooms')

export const adminDeleteRooms = (ids: string[]): Promise<{ deleted: number }> =>
  adminFetch('/api/admin/rooms/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })
