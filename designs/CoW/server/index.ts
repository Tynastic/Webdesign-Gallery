/**
 * War Room sync server (Call of War planner).
 *
 *   ws   /collab                 Hocuspocus (Yjs) sync + awareness for every room
 *   POST /api/rooms              create a room { title, password? } -> { id, ownerToken }
 *   GET  /api/rooms/:id          { exists, protected, title }
 *   DELETE /api/rooms/:id        owner only (Authorization: Bearer <ownerToken>)
 *   POST /api/feedback           tester feedback; POST /api/client-errors: crash reports
 *   GET  /api/admin/*            feedback, errors, stats (Authorization: Bearer $ADMIN_TOKEN)
 *   GET  /healthz, /robots.txt, /api/legal/:page, and the built client (dist/)
 *
 * Runs directly on Node ≥ 22.18 (native TypeScript stripping), no build step.
 */
import { Database } from '@hocuspocus/extension-database'
import { Server } from '@hocuspocus/server'
import { existsSync } from 'node:fs'
import { config } from './config.ts'
import { db, deleteRoom, findRoom, loadDocument, staleRoomIds, storeDocument, checkPassword } from './db.ts'
import { handleRequest, setRoomDeletedHandler } from './http.ts'
import { clientIp, limiters } from './limits.ts'

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
        if (!findRoom(documentName)) return
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

  async onAuthenticate({ documentName, token }) {
    const room = findRoom(documentName)
    if (!room) throw new Error('Room not found')
    if (room.password_hash && !checkPassword(token ?? '', room.password_hash)) throw new Error('Wrong password')
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
  server.hocuspocus.documents.get(id)?.broadcastStateless(JSON.stringify({ type: 'room-deleted' }))
  server.hocuspocus.closeConnections(id)
}
setRoomDeletedHandler(evict)

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
