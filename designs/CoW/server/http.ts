/**
 * HTTP side of the server: room API, feedback/error intake, admin read-outs,
 * legal pages, health check and the static client (precompressed, cached).
 */
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { timingSafeEqual } from 'node:crypto'
import { nanoid } from 'nanoid'
import { config } from './config.ts'
import * as store from './db.ts'
import { clientIp, limiters } from './limits.ts'

/** Hook so the sync layer can disconnect clients of a deleted room. */
let onRoomDeleted: (id: string) => void = () => {}
export const setRoomDeletedHandler = (fn: (id: string) => void) => (onRoomDeleted = fn)

const ROOM_ID = /^[A-Za-z0-9_-]{6,32}$/

// ---------- helpers ----------

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  // Room links are capabilities: never leak them to other sites via the Referer header.
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
}
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // Vue style bindings and Leaflet set inline styles
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

function send(res: ServerResponse, status: number, body: string, type: string, extra: Record<string, string> = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': type, 'Cache-Control': 'no-store', ...extra })
  res.end(body)
}

const json = (res: ServerResponse, status: number, body: unknown) => send(res, status, JSON.stringify(body), 'application/json')

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((ok, fail) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > config.limits.maxBodyBytes) {
        fail(new Error('too large'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')))
    req.on('error', fail)
  })
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  try {
    const value = JSON.parse(await readBody(req))
    return value && typeof value === 'object' ? value : null
  } catch {
    return null
  }
}

const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)

function bearer(req: IncomingMessage): string {
  const h = req.headers.authorization ?? ''
  return h.startsWith('Bearer ') ? h.slice(7).trim() : ''
}

function isAdmin(req: IncomingMessage): boolean {
  const token = bearer(req)
  if (!config.adminToken || !token) return false
  const a = Buffer.from(token), b = Buffer.from(config.adminToken)
  return a.length === b.length && timingSafeEqual(a, b)
}

// ---------- API ----------

async function handleApi(req: IncomingMessage, res: ServerResponse, path: string, url: URL): Promise<boolean> {
  const method = req.method ?? 'GET'
  const ip = clientIp(req)

  if (path === '/healthz') {
    json(res, 200, { ok: true, version: config.version })
    return true
  }

  if (path === '/api/rooms' && method === 'POST') {
    if (!limiters.rooms.take(ip)) return json(res, 429, { error: 'Too many rooms created, try again later.' }), true
    const body = await readJson(req)
    if (!body) return json(res, 400, { error: 'Invalid request' }), true
    const title = str(body.title, 80) || 'Untitled plan'
    const password = String(body.password ?? '')
    if (password.length > 128) return json(res, 400, { error: 'Password too long' }), true
    const id = nanoid(14)
    const ownerToken = store.createRoom(id, title, password)
    console.log(`[room] created ${id}${password ? ' (password)' : ''}`)
    json(res, 201, { id, ownerToken })
    return true
  }

  const room = path.match(/^\/api\/rooms\/([^/]+)$/)
  if (room) {
    const id = room[1]
    if (!ROOM_ID.test(id)) return json(res, 404, { exists: false }), true
    const row = store.findRoom(id)
    if (method === 'GET') {
      json(res, row ? 200 : 404, { exists: !!row, protected: !!row?.password_hash, title: row?.title ?? '' })
      return true
    }
    if (method === 'DELETE') {
      if (!row) return json(res, 404, { error: 'Not found' }), true
      if (!store.checkToken(bearer(req), row.owner_hash)) return json(res, 403, { error: 'Only the room creator can delete it.' }), true
      store.deleteRoom(id)
      onRoomDeleted(id)
      console.log(`[room] deleted ${id} by owner`)
      json(res, 200, { ok: true })
      return true
    }
  }

  if (path === '/api/feedback' && method === 'POST') {
    if (!limiters.feedback.take(ip)) return json(res, 429, { error: 'Too much feedback, try again later.' }), true
    const body = await readJson(req)
    const message = str(body?.message, 4000)
    if (!body || !message) return json(res, 400, { error: 'Empty feedback' }), true
    store.saveFeedback({
      kind: ['bug', 'idea', 'other'].includes(String(body.kind)) ? String(body.kind) : 'other',
      message,
      contact: str(body.contact, 200),
      room: str(body.room, 32),
      path: str(body.path, 200),
      locale: str(body.locale, 8),
      userAgent: str(req.headers['user-agent'], 300),
      appVersion: str(body.appVersion, 40),
    })
    console.log('[feedback] received')
    json(res, 201, { ok: true })
    return true
  }

  if (path === '/api/client-errors' && method === 'POST') {
    if (!limiters.errors.take(ip)) return json(res, 429, {}), true
    const body = await readJson(req)
    if (body?.message)
      store.saveClientError({
        message: str(body.message, 500),
        stack: str(body.stack, 4000),
        path: str(body.path, 200),
        userAgent: str(req.headers['user-agent'], 300),
        appVersion: str(body.appVersion, 40),
      })
    json(res, 204, {})
    return true
  }

  const legal = path.match(/^\/api\/legal\/(impressum|datenschutz)$/)
  if (legal && method === 'GET') {
    const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'de'
    const file = [join(config.legalDir, `${legal[1]}.${lang}.html`), join(config.legalDir, `${legal[1]}.de.html`)].find((f) => existsSync(f))
    if (!file) return json(res, 404, { error: 'Not configured' }), true
    send(res, 200, readFileSync(file, 'utf8'), 'text/html; charset=utf-8', { 'Cache-Control': 'no-cache' })
    return true
  }

  const admin = path.match(/^\/api\/admin\/(feedback|errors|stats)$/)
  if (admin && method === 'GET') {
    if (!isAdmin(req)) return json(res, 403, { error: 'Forbidden' }), true
    const limit = Math.min(1000, Number(url.searchParams.get('limit')) || 200)
    json(res, 200, admin[1] === 'feedback' ? store.listFeedback(limit) : admin[1] === 'errors' ? store.listClientErrors(limit) : store.stats())
    return true
  }

  if (path.startsWith('/api/')) {
    json(res, 404, { error: 'Not found' })
    return true
  }
  return false
}

// ---------- static client ----------

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

/** Serves dist/: precompressed .br/.gz variants when accepted, ETag revalidation, SPA fallback for client routes. */
function serveStatic(req: IncomingMessage, res: ServerResponse, path: string): boolean {
  if (!existsSync(config.distDir)) return false
  let rel: string
  try {
    rel = decodeURIComponent(path)
  } catch {
    return false
  }
  let file = normalize(join(config.distDir, rel))
  if (!file.startsWith(config.distDir)) return false // path traversal
  const isFile = existsSync(file) && statSync(file).isFile()
  if (!isFile) {
    if (extname(rel)) return false // a missing asset is a real 404, not the app
    file = join(config.distDir, 'index.html')
  }

  const accept = String(req.headers['accept-encoding'] ?? '')
  let encoding = ''
  let served = file
  if (/\bbr\b/.test(accept) && existsSync(`${file}.br`)) [served, encoding] = [`${file}.br`, 'br']
  else if (/\bgzip\b/.test(accept) && existsSync(`${file}.gz`)) [served, encoding] = [`${file}.gz`, 'gzip']

  const st = statSync(served)
  const etag = `"${st.size.toString(36)}-${st.mtimeMs.toString(36)}${encoding ? `-${encoding}` : ''}"`
  const immutable = file.startsWith(join(config.distDir, 'assets'))
  const headers: Record<string, string> = {
    ...SECURITY_HEADERS,
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    ETag: etag,
    Vary: 'Accept-Encoding',
  }
  if (encoding) headers['Content-Encoding'] = encoding
  if (file.endsWith('index.html')) {
    headers['Content-Security-Policy'] = CSP
    // Rooms are private links: keep them out of search engines.
    if (path.startsWith('/r/')) headers['X-Robots-Tag'] = 'noindex, nofollow'
  }
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers)
    res.end()
    return true
  }
  headers['Content-Length'] = String(st.size)
  res.writeHead(200, headers)
  if (req.method === 'HEAD') res.end()
  else createReadStream(served).pipe(res)
  return true
}

/** Returns true when the request was answered (otherwise Hocuspocus answers it). Never throws. */
export async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname
    if (path === '/robots.txt') {
      send(res, 200, 'User-agent: *\nDisallow: /r/\nDisallow: /api/\n', 'text/plain; charset=utf-8', { 'Cache-Control': 'public, max-age=86400' })
      return true
    }
    if (await handleApi(req, res, path, url)) return true
    if ((req.method === 'GET' || req.method === 'HEAD') && serveStatic(req, res, path)) return true
    send(res, 404, 'Not found', 'text/plain; charset=utf-8')
    return true
  } catch (err) {
    console.error('[http] error', err)
    if (!res.headersSent) send(res, 500, 'Internal error', 'text/plain; charset=utf-8')
    else res.end()
    return true
  }
}
