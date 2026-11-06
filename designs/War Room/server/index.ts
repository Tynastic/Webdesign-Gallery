/**
 * War Room sync server (Call of War planner).
 *
 *   ws   /collab                 Hocuspocus (Yjs) sync + awareness for every room
 *   GET  /api/rooms              every room { id, title, protected, createdAt, updatedAt, online } for the lobby
 *   POST /api/rooms              create a room { title, password? } -> { id, ownerToken }
 *   GET  /api/rooms/:id          { exists, protected, title }
 *   DELETE /api/rooms/:id        owner or admin (Authorization: Bearer <ownerToken | admin session>)
 *   POST /api/admin/login        { password } -> { token, expires } (ADMIN_PASSWORD)
 *   GET  /api/admin/session      { enabled, valid } for the token in Authorization
 *   GET  /api/admin/rooms        admin: every room with its content (players, plans, drawings, size)
 *   POST /api/admin/rooms/delete admin: { ids } -> { deleted }
 *   POST /api/client-errors      crash reports
 *   GET  /api/admin/*            errors, stats (Authorization: Bearer $ADMIN_TOKEN or an admin session)
 *
 * Every room has two documents: "<id>" (the plan; anyone with access edits it) and
 * "<id>:lineup" (teams and player allotment; read-only except for organizers).
 *   GET  /healthz, /robots.txt, /api/legal/:page, and the built client (dist/)
 *
 * Runs directly on Node ≥ 22.18 (native TypeScript stripping), no build step.
 */
import { Database } from '@hocuspocus/extension-database'
import { Server } from '@hocuspocus/server'
import { existsSync } from 'node:fs'
import { parseCredentials, parseDocumentName, roomAccess } from './auth.ts'
import { config } from './config.ts'
import { db, deleteRoom, findRoom, loadDocument, staleRoomIds, storeDocument } from './db.ts'
import { handleRequest, setOnlineCounter, setRoomDeletedHandler } from './http.ts'
import { clientIp, limiters } from './limits.ts'
import { forgetRoomContent, setLiveDocs } from './roomStats.ts'

const server = new Server({
  port: config.port,
  quiet: true,
  // Hocuspocus' own signal handling stores all open documents before exiting.
  stopOnSignals: true,
  websocketOptions: { maxPayload: config.limits.maxMessageBytes },
  extensions: [
    new Database({
      fetch: async ({ documentName }) => loadDocument(documentName),
      store: async ({ documentName, state }) => {
        // A room deleted while clients were connected must not come back on unload.
        const doc = parseDocumentName(documentName)
        if (!doc || !findRoom(doc.room)) return
        if (state.length > config.limits.maxDocumentBytes) {
          console.error(`[doc] ${documentName} is ${(state.length / 1e6).toFixed(1)} MB, over the limit: not stored`)
          return
        }
        storeDocument(documentName, state)
      },
    }),
  ],

  async onUpgrade({ request, socket }) {
    // Cap concurrent websocket connections per client IP.
    const ip = clientIp(request)
    if (!limiters.connections.acquire(ip)) {
      socket.write('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n')
      socket.destroy()
      throw null // falsy: tells Hocuspocus to stop without treating it as an error
    }
    socket.once('close', () => limiters.connections.release(ip))
  },

  async onAuthenticate({ documentName, token, connectionConfig }) {
    const doc = parseDocumentName(documentName)
    const room = doc && findRoom(doc.room)
    if (!room) throw new Error('Room not found')
    const access = roomAccess(room, parseCredentials(token))
    if (access === 'denied') throw new Error('Wrong password')
    // The line-up is the organizers' job: everyone else reads it only. Hocuspocus drops their updates.
    if (doc.part === 'lineup' && access !== 'organizer') connectionConfig.readOnly = true
  },

  async onRequest({ request, response }) {
    // Rejecting with a falsy value tells Hocuspocus the response has been handled.
    if (await handleRequest(request, response)) throw null
  },
})

/**
 * Tell connected clients the room is gone (they show a notice instead of silently
 * retrying), then drop their connections. closeConnections alone only ends the
 * document session on a still-open socket, which clients cannot distinguish.
 */
function evict(id: string) {
  forgetRoomContent(id)
  for (const name of [id, `${id}:lineup`]) {
    server.hocuspocus.documents.get(name)?.broadcastStateless(JSON.stringify({ type: 'room-deleted' }))
    server.hocuspocus.closeConnections(name)
  }
}
setRoomDeletedHandler(evict)
setOnlineCounter((id) => server.hocuspocus.documents.get(id)?.getConnectionsCount() ?? 0)
setLiveDocs((name) => server.hocuspocus.documents.get(name))

/** Delete rooms nobody has touched for ROOM_TTL_DAYS (daily, and at start-up). */
function cleanup() {
  const stale = staleRoomIds(config.roomTtlDays)
  for (const id of stale) {
    deleteRoom(id)
    evict(id)
  }
  if (stale.length) console.log(`[cleanup] removed ${stale.length} room(s) inactive for ${config.roomTtlDays}+ days`)
}
cleanup()
setInterval(cleanup, 86_400_000).unref()

process.on('exit', () => db.close())

server.listen().then(() => {
  console.log(
    `War Room ${config.version} on http://localhost:${config.port}  (data: ${config.dataDir}${existsSync(config.distDir) ? ', serving dist/' : ''}${config.trustProxy ? ', behind proxy' : ''})`,
  )
})
