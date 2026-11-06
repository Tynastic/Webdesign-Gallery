/**
 * The match line-up: which team each playable nation is on and which player plays it.
 *
 * It lives in its own Yjs document per room ("<room>:lineup") so the server can
 * make it read-only for everyone except the organizers (the room's creator and the
 * admin). Players themselves live in the plan document, where anyone may sign up.
 *
 * One player per nation: a slot holds at most one player id, and assigning a player
 * removes them from any other slot in the same transaction.
 *
 * No DOM, no Vue: also loadable by the sync server.
 */
import * as Y from 'yjs'
import { PLAYABLE, isPlayable } from './points'

export type Team = 'axis' | 'allies'
export const TEAMS: Team[] = ['axis', 'allies']

export interface Slot {
  team: Team | null
  /** Player id (plan.players), or null: an AI nation. */
  player: string | null
}

/** What reading needs from a Y.Map or a Map. */
export interface Lookup<T> {
  get(key: string): T | undefined
}

export const EMPTY_SLOT: Slot = Object.freeze({ team: null, player: null }) as Slot

export interface Lineup {
  doc: Y.Doc
  /** Keyed by nation short code; only playable nations. */
  slots: Y.Map<Slot>
  meta: Y.Map<unknown>
}

/** Same origin as plan edits, so a per-document UndoManager can track this client's own changes. */
const ORIGIN = 'local'

export function createLineup(doc = new Y.Doc()): Lineup {
  return { doc, slots: doc.getMap('slots'), meta: doc.getMap('meta') }
}

const tx = (l: Lineup, fn: () => void) => l.doc.transact(fn, ORIGIN)

function put(l: Lineup, nation: string, slot: Slot) {
  if (slot.team === null && slot.player === null) l.slots.delete(nation)
  else l.slots.set(nation, { team: slot.team, player: slot.player })
}

export const slotOf = (l: Lineup, nation: string): Slot => l.slots.get(nation) ?? EMPTY_SLOT

export function setTeam(l: Lineup, nations: string[], team: Team | null) {
  tx(l, () => {
    for (const n of nations) if (isPlayable(n)) put(l, n, { ...slotOf(l, n), team })
  })
}

/** Gives a nation its player (null = AI). The player leaves any other nation they had. */
export function assignPlayer(l: Lineup, nation: string, player: string | null) {
  if (!isPlayable(nation)) return
  tx(l, () => {
    if (player)
      for (const [other, s] of l.slots) if (other !== nation && s.player === player) put(l, other, { ...s, player: null })
    put(l, nation, { ...slotOf(l, nation), player })
  })
}

/** Takes a player out of the line-up (e.g. when they are removed). */
export function releasePlayer(l: Lineup, player: string) {
  tx(l, () => {
    for (const [n, s] of l.slots) if (s.player === player) put(l, n, { ...s, player: null })
  })
}

/**
 * Which nation a player plays. Two organizers assigning the same player at the same
 * time can leave them in two slots; the first playable nation wins, everywhere alike.
 */
export function nationOf(slots: Lookup<Slot>, player: string | null): string | null {
  if (!player) return null
  return PLAYABLE.find((n) => slots.get(n)?.player === player) ?? null
}

export type LineupSnapshot = Record<string, Slot>

export const exportLineup = (l: Lineup): LineupSnapshot => Object.fromEntries([...l.slots].filter(([n]) => isPlayable(n)))

/** Replaces the whole line-up (one transaction). */
export function importLineup(l: Lineup, snap: LineupSnapshot) {
  tx(l, () => {
    l.slots.clear()
    for (const [n, s] of Object.entries(snap ?? {}))
      if (isPlayable(n) && s) put(l, n, { team: s.team === 'axis' || s.team === 'allies' ? s.team : null, player: typeof s.player === 'string' ? s.player : null })
  })
}
