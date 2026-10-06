import { HocuspocusProvider } from '@hocuspocus/provider'
import { ref, type Ref } from 'vue'
import { IndexeddbPersistence } from 'y-indexeddb'
import { Awareness } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { LOCAL_ORIGIN, createPlan, ensureDefaults, type Plan } from '../../shared/schema'
import { t } from '../i18n'
import { Presence } from './presence'

/** 'denied': the server refused us after loading (room deleted, password changed). */
export type ConnectionStatus = 'local' | 'connecting' | 'connected' | 'offline' | 'denied'

export interface PlanHandle {
  plan: Plan
  undo: Y.UndoManager
  presence: Presence
  /** 'local' for the offline-only plan, otherwise the room id. */
  room: string
  status: Ref<ConnectionStatus>
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
 */
export function openPlan(room: string, opts: { password?: string; title?: string } = {}): PlanHandle {
  const plan = createPlan()
  const cache = new IndexeddbPersistence(`cow-planner:${room}`, plan.doc)
  // Undo only this client's own edits, never a teammate's.
  const undo = new Y.UndoManager([plan.nations, plan.layers, plan.phases, plan.objects, plan.assignments, plan.ownership, plan.meta], {
    trackedOrigins: new Set([LOCAL_ORIGIN]),
    captureTimeout: 400,
  })
  const status = ref<ConnectionStatus>(room === 'local' ? 'local' : 'connecting')

  let provider: HocuspocusProvider | null = null
  let awareness: Awareness
  let serverReady: Promise<void> = Promise.resolve()
  let loaded = false

  if (room === 'local') awareness = new Awareness(plan.doc)
  else {
    let resolveSync!: () => void, rejectSync!: (e: Error) => void
    serverReady = new Promise((res, rej) => ((resolveSync = res), (rejectSync = rej)))
    provider = new HocuspocusProvider({
      url: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/collab`,
      name: room,
      document: plan.doc,
      token: opts.password ?? '',
      onStatus: ({ status: s }) => {
        if (status.value !== 'denied') status.value = s === 'connected' ? 'connected' : s === 'connecting' ? 'connecting' : 'offline'
      },
      onSynced: () => resolveSync(),
      onStateless: ({ payload }) => {
        // The server announces a deleted room before closing our connection.
        if (payload.includes('"room-deleted"')) {
          status.value = 'denied'
          provider?.destroy()
        }
      },
      onAuthenticationFailed: ({ reason }) => {
        if (loaded) {
          // Lost access while working: stop retrying and tell the user.
          status.value = 'denied'
          provider?.destroy()
        } else rejectSync(new AuthError(reason || 'Access denied'))
      },
    })
    awareness = provider.awareness!
    // Offline or slow server: fall back to the cached copy instead of blocking the user.
    setTimeout(() => {
      if (status.value === 'connecting') status.value = 'offline'
      resolveSync()
    }, SYNC_TIMEOUT)
  }

  const ready = Promise.all([cache.whenSynced, serverReady]).then(() => {
    ensureDefaults(plan, { title: opts.title || t('plan.untitled'), layerName: t('layer.general') })
    undo.clear() // loading and defaults are not undoable user actions
    loaded = true
  })

  return {
    plan,
    undo,
    presence: new Presence(awareness),
    room,
    status,
    ready,
    destroy() {
      provider?.destroy()
      cache.destroy()
      undo.destroy()
    },
  }
}
