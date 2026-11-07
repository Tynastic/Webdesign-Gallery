/**
 * What is in a room, for the admin's room management: players, seated players,
 * planned conquests, drawings and conquered provinces. Read from the live
 * document when the room is open, else from storage; cached per room until it
 * changes, so listing hundreds of rooms stays cheap.
 */
import * as Y from 'yjs'
import { documentSize, loadDocument } from './db.ts'

export interface RoomContent {
  players: number
  /** Players the line-up gives a nation. */
  seated: number
  planned: number
  drawings: number
  conquered: number
  /** Stored size of the plan and its line-up, in bytes. */
  bytes: number
}

/** Nothing anyone would miss: no players, no plans, no drawings, no conquests. */
export const isEmpty = (c: RoomContent) => !c.players && !c.planned && !c.drawings && !c.conquered

let liveDoc: (name: string) => Y.Doc | undefined = () => undefined
/** Hook so open rooms are counted from memory (stored copies lag behind by a few seconds). */
export const setLiveDocs = (fn: (name: string) => Y.Doc | undefined) => (liveDoc = fn)

const cache = new Map<string, { key: string; content: RoomContent }>()

function read(name: string): { doc: Y.Doc; bytes: number; live: boolean } {
  const live = liveDoc(name)
  if (live) return { doc: live, bytes: documentSize(name), live: true }
  const stored = loadDocument(name)
  const doc = new Y.Doc()
  if (stored) Y.applyUpdate(doc, stored)
  return { doc, bytes: stored?.length ?? 0, live: false }
}

/** `version` changes whenever the room does (its last update time); live rooms are never cached. */
export function roomContent(id: string, version: number): RoomContent {
  const key = String(version)
  const hit = cache.get(id)
  if (hit && hit.key === key && !liveDoc(id)) return hit.content
  const plan = read(id)
  const lineup = read(`${id}:lineup`)
  const slots = lineup.doc.getMap<{ player: string | null }>('slots')
  const content: RoomContent = {
    players: plan.doc.getMap('players').size,
    seated: [...slots.values()].filter((s) => s?.player).length,
    planned: plan.doc.getMap('assignments').size,
    drawings: plan.doc.getMap('objects').size,
    conquered: plan.doc.getMap('ownership').size,
    bytes: plan.bytes + lineup.bytes,
  }
  for (const d of [plan, lineup]) if (!d.live) d.doc.destroy()
  cache.set(id, { key, content })
  return content
}

export const forgetRoomContent = (id: string) => cache.delete(id)
