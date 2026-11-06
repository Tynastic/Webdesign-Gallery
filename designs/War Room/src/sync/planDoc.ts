import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import { ref, type Ref } from 'vue'
import { IndexeddbPersistence } from 'y-indexeddb'
import { Awareness } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { createLineup, type Lineup } from '../../shared/lineup'
import { LOCAL_ORIGIN, createPlan, ensureDefaults, type Plan } from '../../shared/schema'
import { t } from '../i18n'
import { MatchState } from './match'
import { Presence } from './presence'
import { canOrganizeRoom, credentials } from './rooms'

/** 'denied': the server refused us after loading (room deleted, password changed). */
export type ConnectionStatus = 'local' | 'connecting' | 'connected' | 'offline' | 'denied'

export interface PlanHandle {
  plan: Plan
  /** Teams and player allotment: a separate document only organizers may change. */
  lineup: Lineup
  undo: Y.UndoManager
  lineupUndo: Y.UndoManager
  /** Who plays what, recomputed whenever the line-up, players or colours change. */
  match: MatchState
  presence: Presence
  /** 'local' for the offline-only plan, otherwise the room id. */
  room: string
  status: Ref<ConnectionStatus>
  /** This viewer may edit the line-up (room creator or admin; always in the offline plan). */
  canOrganize: Ref<boolean>
  /** Resolves once the plan is loaded (from the server, or the local cache when offline). */
  ready: Promise<void>
  destroy(): void
}

export class AuthError extends Error {}

const SYNC_TIMEOUT = 6000

/**
 * Opens a plan. Every plan is cached in IndexedDB (instant start, works offline);
 * rooms additionally sync live through the Hocuspocus server. Edits made while
 * offline merge automatically when the connection returns (CRDT).
 *
 * A room is two documents on one websocket: the plan, and its line-up, which the
 * server makes read-only for everyone but the organizers.
 */
export function openPlan(room: string, opts: { password?: string; title?: string } = {}): PlanHandle {
  const plan = createPlan()
  const lineup = createLineup()
  const caches = [new IndexeddbPersistence(`cow-planner:${room}`, plan.doc), new IndexeddbPersistence(`cow-planner:${room}:lineup`, lineup.doc)]
  // Undo only this client's own edits, never a teammate's.
  const undo = new Y.UndoManager([plan.nations, plan.players, plan.layers, plan.phases, plan.objects, plan.assignments, plan.ownership, plan.meta], {
    trackedOrigins: new Set([LOCAL_ORIGIN]),
    captureTimeout: 400,
  })
  const lineupUndo = new Y.UndoManager([lineup.slots], { trackedOrigins: new Set([LOCAL_ORIGIN]), captureTimeout: 400 })
  const status = ref<ConnectionStatus>(room === 'local' ? 'local' : 'connecting')
  // Optimistic until the server answers: the organizer credentials this browser holds.
  const canOrganize = ref(room === 'local' || canOrganizeRoom(room))

  let socket: HocuspocusProviderWebsocket | null = null
  const providers: HocuspocusProvider[] = []
  let awareness: Awareness
  let serverReady: Promise<void> = Promise.resolve()
  let loaded = false

  if (room === 'local') awareness = new Awareness(plan.doc)
  else {
    let resolvePlan!: () => void, rejectPlan!: (e: Error) => void, resolveLineup!: () => void
    const planSynced = new Promise<void>((res, rej) => ((resolvePlan = res), (rejectPlan = rej)))
    const lineupSynced = new Promise<void>((res) => (resolveLineup = res))
    serverReady = Promise.all([planSynced, lineupSynced]).then(() => {})
    const token = credentials(room, opts.password)
    const deny = () => {
      status.value = 'denied'
      providers.forEach((p) => p.destroy())
    }
    socket = new HocuspocusProviderWebsocket({ url: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/collab` })
    const planProvider = new HocuspocusProvider({
      websocketProvider: socket,
      name: room,
      document: plan.doc,
      token,
      onStatus: ({ status: s }) => {
        if (status.value !== 'denied') status.value = s === 'connected' ? 'connected' : s === 'connecting' ? 'connecting' : 'offline'
      },
      onSynced: () => resolvePlan(),
      onStateless: ({ payload }) => {
        // The server announces a deleted room before closing our connection.
        if (payload.includes('"room-deleted"')) deny()
      },
      onAuthenticationFailed: ({ reason }) => {
        // Lost access while working: stop retrying and tell the user.
        if (loaded) deny()
        else rejectPlan(new AuthError(reason || 'Access denied'))
      },
    })
    const lineupProvider = new HocuspocusProvider({
      websocketProvider: socket,
      name: `${room}:lineup`,
      document: lineup.doc,
      token,
      // Presence lives on the plan document only.
      awareness: null,
      onAuthenticated: ({ scope }) => (canOrganize.value = scope === 'read-write'),
      onSynced: () => resolveLineup(),
      onAuthenticationFailed: () => resolveLineup(),
    })
    providers.push(planProvider, lineupProvider)
    providers.forEach((p) => p.attach())
    awareness = planProvider.awareness!
    // Offline or slow server: fall back to the cached copy instead of blocking the user.
    setTimeout(() => {
      if (status.value === 'connecting') status.value = 'offline'
      resolvePlan()
      resolveLineup()
    }, SYNC_TIMEOUT)
  }

  const ready = Promise.all([...caches.map((c) => c.whenSynced), serverReady]).then(() => {
    ensureDefaults(plan, { title: opts.title || t('plan.untitled'), layerName: t('layer.general') })
    undo.clear() // loading and defaults are not undoable user actions
    lineupUndo.clear()
    loaded = true
  })

  const match = new MatchState(plan, lineup)
  return {
    plan,
    lineup,
    undo,
    lineupUndo,
    match,
    presence: new Presence(awareness),
    room,
    status,
    canOrganize,
    ready,
    destroy() {
      providers.forEach((p) => p.destroy())
      socket?.destroy()
      caches.forEach((c) => c.destroy())
      undo.destroy()
      lineupUndo.destroy()
      match.destroy()
    },
  }
}
