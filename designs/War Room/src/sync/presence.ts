import type { Awareness } from 'y-protocols/awareness'
import type { Point } from '../../shared/schema'
import type { ToolId } from '../state/session'

/** What each connected client shares about itself (ephemeral, never stored). */
export interface PresenceState {
  user: { name: string; nation: string | null; color: string }
  cursor: Point | null
  tool: ToolId
  ping: { x: number; y: number; at: number } | null
  /** Map view (canonical centre + zoom), for teammates who follow this player. */
  view: { x: number; y: number; z: number } | null
}

export interface Peer {
  clientId: number
  state: PresenceState
}

export interface PingEvent {
  clientId: number
  user: PresenceState['user']
  x: number
  y: number
  self: boolean
}

const CURSOR_INTERVAL = 50
const PING_TTL = 8000

/**
 * Presence on top of the Yjs awareness protocol: who is here, where their
 * cursor is, which tool they use, and pings. Works without a server too (the
 * awareness then only contains this client), so local mode renders pings alike.
 */
export class Presence {
  private lastCursorSent = 0
  private pendingCursor: Point | null | undefined
  private cursorTimer = 0
  private seenPings = new Map<number, number>()
  private pingListeners = new Set<(p: PingEvent) => void>()

  constructor(readonly awareness: Awareness) {
    awareness.on('change', () => this.detectPings())
  }

  get clientId() {
    return this.awareness.clientID
  }

  setUser(user: PresenceState['user']) {
    this.awareness.setLocalStateField('user', user)
  }

  setView(view: PresenceState['view']) {
    this.awareness.setLocalStateField('view', view)
  }

  setTool(tool: ToolId) {
    this.awareness.setLocalStateField('tool', tool)
  }

  /** Throttled: at most one cursor update per 50 ms reaches the network. */
  setCursor(p: Point | null) {
    this.pendingCursor = p
    const wait = CURSOR_INTERVAL - (performance.now() - this.lastCursorSent)
    if (wait <= 0) return this.flushCursor()
    if (!this.cursorTimer) this.cursorTimer = window.setTimeout(() => this.flushCursor(), wait)
  }

  private flushCursor() {
    this.cursorTimer = 0
    if (this.pendingCursor === undefined) return
    this.lastCursorSent = performance.now()
    this.awareness.setLocalStateField('cursor', this.pendingCursor && [Math.round(this.pendingCursor[0]), Math.round(this.pendingCursor[1])])
    this.pendingCursor = undefined
  }

  ping(p: Point) {
    const ping = { x: Math.round(p[0]), y: Math.round(p[1]), at: Date.now() }
    this.awareness.setLocalStateField('ping', ping)
  }

  onPing(fn: (p: PingEvent) => void): () => void {
    this.pingListeners.add(fn)
    return () => this.pingListeners.delete(fn)
  }

  /** Everyone else currently connected. */
  peers(): Peer[] {
    const out: Peer[] = []
    this.awareness.getStates().forEach((state, clientId) => {
      if (clientId !== this.clientId && (state as Partial<PresenceState>).user) out.push({ clientId, state: state as PresenceState })
    })
    return out
  }

  onChange(fn: () => void): () => void {
    this.awareness.on('change', fn)
    return () => this.awareness.off('change', fn)
  }

  private detectPings() {
    const now = Date.now()
    this.awareness.getStates().forEach((state, clientId) => {
      const s = state as Partial<PresenceState>
      const ping = s.ping
      if (!ping || !s.user || now - ping.at > PING_TTL || this.seenPings.get(clientId) === ping.at) return
      this.seenPings.set(clientId, ping.at)
      const event = { clientId, user: s.user, x: ping.x, y: ping.y, self: clientId === this.clientId }
      this.pingListeners.forEach((fn) => fn(event))
    })
  }
}
