/** SQLite storage (node:sqlite, no native modules): rooms, Yjs documents, feedback, client errors. */
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { config } from './config.ts'

mkdirSync(config.dataDir, { recursive: true })
export const db = new DatabaseSync(join(config.dataDir, 'cow-planner.sqlite'))

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    password_hash TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS documents (
    name TEXT PRIMARY KEY,
    data BLOB NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at INTEGER NOT NULL,
    kind TEXT NOT NULL,
    message TEXT NOT NULL,
    contact TEXT,
    room TEXT,
    path TEXT,
    locale TEXT,
    user_agent TEXT,
    app_version TEXT
  );
  CREATE TABLE IF NOT EXISTS client_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at INTEGER NOT NULL,
    message TEXT NOT NULL,
    stack TEXT,
    path TEXT,
    user_agent TEXT,
    app_version TEXT
  );
`)

// Migrations for databases created by earlier versions.
const roomColumns = (db.prepare('PRAGMA table_info(rooms)').all() as { name: string }[]).map((c) => c.name)
if (!roomColumns.includes('owner_hash')) db.exec('ALTER TABLE rooms ADD COLUMN owner_hash TEXT')

const q = {
  insertRoom: db.prepare('INSERT INTO rooms (id, title, password_hash, owner_hash, created_at) VALUES (?, ?, ?, ?, ?)'),
  getRoom: db.prepare('SELECT id, title, password_hash, owner_hash, created_at FROM rooms WHERE id = ?'),
  deleteRoom: db.prepare('DELETE FROM rooms WHERE id = ?'),
  getDoc: db.prepare('SELECT data FROM documents WHERE name = ?'),
  putDoc: db.prepare(
    'INSERT INTO documents (name, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at',
  ),
  deleteDoc: db.prepare('DELETE FROM documents WHERE name = ?'),
  staleRooms: db.prepare(`
    SELECT r.id FROM rooms r LEFT JOIN documents d ON d.name = r.id
    WHERE COALESCE(d.updated_at, r.created_at) < ?`),
  insertFeedback: db.prepare(
    'INSERT INTO feedback (created_at, kind, message, contact, room, path, locale, user_agent, app_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ),
  listFeedback: db.prepare('SELECT * FROM feedback ORDER BY id DESC LIMIT ?'),
  insertError: db.prepare('INSERT INTO client_errors (created_at, message, stack, path, user_agent, app_version) VALUES (?, ?, ?, ?, ?, ?)'),
  trimErrors: db.prepare('DELETE FROM client_errors WHERE id <= (SELECT MAX(id) - 5000 FROM client_errors)'),
  listErrors: db.prepare('SELECT * FROM client_errors ORDER BY id DESC LIMIT ?'),
  stats: db.prepare(`
    SELECT (SELECT COUNT(*) FROM rooms) AS rooms,
           (SELECT COUNT(*) FROM documents) AS documents,
           (SELECT COALESCE(SUM(LENGTH(data)), 0) FROM documents) AS document_bytes,
           (SELECT COUNT(*) FROM feedback) AS feedback,
           (SELECT COUNT(*) FROM client_errors) AS client_errors`),
}

export interface RoomRow {
  id: string
  title: string
  password_hash: string | null
  owner_hash: string | null
  created_at: number
}

// ---------- secrets ----------

export function hashPassword(pw: string): string {
  const salt = randomBytes(16)
  return `${salt.toString('hex')}:${scryptSync(pw, salt, 32).toString('hex')}`
}

export function checkPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  const expected = Buffer.from(hash, 'hex')
  const actual = scryptSync(pw, Buffer.from(salt, 'hex'), expected.length)
  return timingSafeEqual(actual, expected)
}

/** Owner tokens are random, so a fast hash is enough; only the hash is stored. */
const sha256 = (s: string) => createHash('sha256').update(s).digest()

export function checkToken(token: string, storedHex: string | null): boolean {
  if (!storedHex || !token) return false
  return timingSafeEqual(sha256(token), Buffer.from(storedHex, 'hex'))
}

// ---------- rooms ----------

export const findRoom = (id: string) => q.getRoom.get(id) as RoomRow | undefined

/** Creates a room; returns the owner token (shown to the creator once, needed to delete the room). */
export function createRoom(id: string, title: string, password: string): string {
  const ownerToken = randomBytes(24).toString('base64url')
  q.insertRoom.run(id, title, password ? hashPassword(password) : null, sha256(ownerToken).toString('hex'), Date.now())
  return ownerToken
}

export function deleteRoom(id: string) {
  q.deleteRoom.run(id)
  q.deleteDoc.run(id)
}

/** Rooms with no edits (or never opened) for `days` days. */
export function staleRoomIds(days: number): string[] {
  return (q.staleRooms.all(Date.now() - days * 86_400_000) as { id: string }[]).map((r) => r.id)
}

// ---------- documents ----------

export function loadDocument(name: string): Uint8Array | null {
  const row = q.getDoc.get(name) as { data: Uint8Array } | undefined
  return row ? new Uint8Array(row.data) : null
}

export function storeDocument(name: string, state: Uint8Array) {
  q.putDoc.run(name, state, Date.now())
}

// ---------- feedback & errors ----------

export interface FeedbackInput {
  kind: string
  message: string
  contact: string
  room: string
  path: string
  locale: string
  userAgent: string
  appVersion: string
}

export function saveFeedback(f: FeedbackInput) {
  q.insertFeedback.run(Date.now(), f.kind, f.message, f.contact || null, f.room || null, f.path, f.locale, f.userAgent, f.appVersion)
}

export function saveClientError(e: { message: string; stack: string; path: string; userAgent: string; appVersion: string }) {
  q.insertError.run(Date.now(), e.message, e.stack || null, e.path, e.userAgent, e.appVersion)
  q.trimErrors.run()
}

export const listFeedback = (limit = 200) => q.listFeedback.all(limit)
export const listClientErrors = (limit = 200) => q.listErrors.all(limit)
export const stats = () => q.stats.get()
