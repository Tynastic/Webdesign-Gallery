/**
 * The shared plan: one Yjs document per room. Everything players draw, assign or
 * mark as conquered lives here; the client renders from it and tools only ever
 * write to it. Values are plain JSON objects replaced as a whole on update (last
 * writer wins per object), which keeps rendering diff-friendly.
 *
 * Nations are identified by their short code from nations.json (e.g. "GER").
 * Players sign up here (`players`); which nation each one plays and the teams are
 * the line-up, a separate document only organizers may edit (shared/lineup.ts).
 * A nation without a player is an AI nation.
 *
 * No DOM, no Vue: also loadable by the sync server.
 */
import * as Y from 'yjs'
import { nanoid } from 'nanoid'
import type { LineupSnapshot, Slot } from './lineup'
import { isPlayable } from './points'

export const SCHEMA_VERSION = 3

/** Transaction origin for edits made by this client; the UndoManager tracks only these. */
export const LOCAL_ORIGIN = 'local'

/** SVG pixel coordinates [x, y]. */
export type Point = [number, number]

export type ObjectType = 'arrow' | 'front' | 'zone' | 'unit' | 'objective' | 'text' | 'range'

export type ArrowVariant = 'attack' | 'move'
export type FrontVariant = 'front' | 'defense'
export type ZoneVariant = 'target' | 'danger' | 'hold'
export type UnitType = 'infantry' | 'armor' | 'artillery' | 'antiair' | 'air' | 'naval' | 'mixed'
export type ObjectiveIcon = 'target' | 'flag' | 'star' | 'shield' | 'warning'

export interface PlanObject {
  id: string
  type: ObjectType
  layerId: string
  /** null = applies to every phase. */
  phaseId: string | null
  /** Path vertices for arrow/front/zone; the single anchor for point objects and range centres. */
  points: Point[]
  /** arrow/front/zone/unit/objective sub-kind, see the *Variant types. */
  variant: string
  color: string
  label: string
  /** Arrow body width, in map units (scales with the map like the provinces do). */
  width?: number
  /** Range circle radius, in map units. */
  radius?: number
  /** Unit stack size shown on unit markers. */
  count?: number
  /** Nation id of the creator ('' if unknown / spectator). */
  author: string
  createdAt: number
  locked: boolean
}

/**
 * Per-nation plan settings from schema v2 (marker colour, nickname, team flag).
 * Kept so older plans and exports load; nations are coloured by their Call of War colour now.
 */
export interface PlanNation {
  /** Nation short code, e.g. "GER". */
  id: string
  /** Schema v2: a marker colour. Ignored. */
  color: string
  /** Schema v2: the player's nickname ('' = AI). Migrated into players and the line-up. */
  nickname?: string
  /** Schema v2: on "the" team. Has no meaning since there are two teams. */
  team?: boolean
}

/** Someone taking part in the match. Which nation they play is in the line-up. */
export interface Player {
  id: string
  name: string
  /** The nation they asked for when signing up; null = no preference. */
  wish: string | null
  joinedAt: number
}

export interface Layer {
  id: string
  name: string
  order: number
}

export interface Phase {
  id: string
  name: string
}

/** "Who should conquer this province": keyed by province id. */
export interface Assignment {
  nation: string
  phaseId: string | null
}

/**
 * Colours for generic drawings, as alternatives to the drawer's nation colour:
 * enemy (opposing force) red and friendly forces blue as on military maps, and neutrals.
 */
export const NEUTRAL_COLORS = {
  opfor: '#d23a35',
  friendly: '#2f78cf',
  lightGrey: '#c8c8c2',
  darkGrey: '#4f4f4a',
  white: '#f6f5f0',
  black: '#161613',
} as const
export type NeutralColor = keyof typeof NEUTRAL_COLORS

export interface Plan {
  doc: Y.Doc
  meta: Y.Map<unknown>
  nations: Y.Map<PlanNation>
  players: Y.Map<Player>
  layers: Y.Map<Layer>
  phases: Y.Array<Phase>
  objects: Y.Map<PlanObject>
  assignments: Y.Map<Assignment>
  /** Province id -> nation id currently holding it. Only provinces that changed hands since the start. */
  ownership: Y.Map<string>
}

export function createPlan(doc = new Y.Doc()): Plan {
  return {
    doc,
    meta: doc.getMap('meta'),
    nations: doc.getMap('nations'),
    players: doc.getMap('players'),
    layers: doc.getMap('layers'),
    phases: doc.getArray('phases'),
    objects: doc.getMap('objects'),
    assignments: doc.getMap('assignments'),
    ownership: doc.getMap('ownership'),
  }
}

const tx = (plan: Plan, fn: () => void) => plan.doc.transact(fn, LOCAL_ORIGIN)
export const newId = () => nanoid(12)

/**
 * Fill an empty plan with defaults and upgrade older local data; call once stored state has loaded.
 * Default names come from the caller so they can be in the creator's language.
 */
export function ensureDefaults(plan: Plan, defaults: { title?: string; layerName?: string } = {}) {
  tx(plan, () => {
    if (plan.layers.size === 0) plan.layers.set('general', { id: 'general', name: defaults.layerName ?? 'General', order: 0 })
    if (!plan.meta.get('title')) plan.meta.set('title', defaults.title ?? 'Untitled plan')
    if (plan.meta.get('schema') !== SCHEMA_VERSION) {
      // v1 assigned provinces to free-form players; those have no nation and cannot be migrated.
      for (const [key, a] of plan.assignments) if (!(a as Partial<Assignment>).nation) plan.assignments.delete(key)
      plan.meta.set('schema', SCHEMA_VERSION)
    }
  })
}

// ---------- objects ----------

export function addObject(plan: Plan, obj: Omit<PlanObject, 'id' | 'createdAt' | 'locked'>): string {
  const id = newId()
  tx(plan, () => plan.objects.set(id, { ...obj, id, createdAt: Date.now(), locked: false }))
  return id
}

export function updateObject(plan: Plan, id: string, patch: Partial<PlanObject>) {
  const cur = plan.objects.get(id)
  if (cur) tx(plan, () => plan.objects.set(id, { ...cur, ...patch, id }))
}

export function deleteObjects(plan: Plan, ids: string[]) {
  tx(plan, () => ids.forEach((id) => plan.objects.delete(id)))
}

// ---------- assignments (planned conquests) ----------

/** Assign provinces to a nation, or clear them with nation = null. */
export function assignProvinces(plan: Plan, provinceIds: number[], nation: string | null, phaseId: string | null) {
  tx(plan, () => {
    for (const id of provinceIds) {
      if (nation === null) plan.assignments.delete(String(id))
      else plan.assignments.set(String(id), { nation, phaseId })
    }
  })
}

// ---------- ownership (actual conquests) ----------

/**
 * Record who holds provinces now. Pass the province's original owner (or null) to
 * restore it: the map only stores provinces that changed hands.
 */
export function setOwners(plan: Plan, changes: { province: number; nation: string | null; original: string }[]) {
  tx(plan, () => {
    for (const c of changes) {
      if (c.nation === null || c.nation === c.original) plan.ownership.delete(String(c.province))
      else plan.ownership.set(String(c.province), c.nation)
    }
  })
}

// ---------- players ----------

export const cleanName = (name: string) => name.trim().replace(/\s+/g, ' ').slice(0, 24)

/** Signs a player up; returns the id. The line-up decides which nation they play. */
export function addPlayer(plan: Plan, name: string, wish: string | null = null): string {
  const id = newId()
  tx(plan, () => plan.players.set(id, { id, name: cleanName(name), wish: wish && isPlayable(wish) ? wish : null, joinedAt: Date.now() }))
  return id
}

export function updatePlayer(plan: Plan, id: string, patch: Partial<Omit<Player, 'id'>>) {
  const cur = plan.players.get(id)
  if (!cur) return
  const next = { ...cur, ...patch, id }
  next.name = cleanName(next.name) || cur.name
  tx(plan, () => plan.players.set(id, next))
}

/** Removes a player record; callers also release them from the line-up. */
export function removePlayer(plan: Plan, id: string) {
  tx(plan, () => plan.players.delete(id))
}

/**
 * Schema v2 kept players as nicknames on roster nations. Turns those into players
 * and line-up slots (teams were a single yes/no flag, so they start unassigned).
 */
export function legacyLineup(nations: Iterable<PlanNation>): { players: Player[]; slots: LineupSnapshot } {
  const players: Player[] = []
  const slots: LineupSnapshot = {}
  for (const n of nations) {
    const name = cleanName(n.nickname ?? '')
    if (!name || !isPlayable(n.id)) continue
    const p: Player = { id: newId(), name, wish: n.id, joinedAt: Date.now() }
    players.push(p)
    slots[n.id] = { team: null, player: p.id } satisfies Slot
  }
  return { players, slots }
}

// ---------- layers ----------

export function addLayer(plan: Plan, name: string): string {
  const id = newId()
  const order = Math.max(-1, ...[...plan.layers.values()].map((l) => l.order)) + 1
  tx(plan, () => plan.layers.set(id, { id, name, order }))
  return id
}

export function renameLayer(plan: Plan, id: string, name: string) {
  const cur = plan.layers.get(id)
  if (cur) tx(plan, () => plan.layers.set(id, { ...cur, name }))
}

/** Deletes a layer together with its objects. The last layer cannot be removed. */
export function removeLayer(plan: Plan, id: string) {
  if (plan.layers.size <= 1) return
  tx(plan, () => {
    plan.layers.delete(id)
    for (const [oid, o] of plan.objects) if (o.layerId === id) plan.objects.delete(oid)
  })
}

// ---------- phases ----------

export function addPhase(plan: Plan, name: string): string {
  const id = newId()
  tx(plan, () => plan.phases.push([{ id, name }]))
  return id
}

export function renamePhase(plan: Plan, id: string, name: string) {
  const i = plan.phases.toArray().findIndex((p) => p.id === id)
  if (i >= 0)
    tx(plan, () => {
      plan.phases.delete(i)
      plan.phases.insert(i, [{ id, name }])
    })
}

/** Deletes a phase; its objects and assignments become phase-independent. */
export function removePhase(plan: Plan, id: string) {
  const i = plan.phases.toArray().findIndex((p) => p.id === id)
  if (i < 0) return
  tx(plan, () => {
    plan.phases.delete(i)
    for (const [oid, o] of plan.objects) if (o.phaseId === id) plan.objects.set(oid, { ...o, phaseId: null })
    for (const [key, a] of plan.assignments) if (a.phaseId === id) plan.assignments.set(key, { ...a, phaseId: null })
  })
}

export type PhaseVisibility = 'full' | 'dim' | 'hidden'

/**
 * Phases play out in order: with a phase active, its items show fully, items of
 * earlier phases stay visible but faded (they already happened), later ones hide.
 */
export function phaseVisibility(itemPhase: string | null, activePhase: string | null, phaseOrder: string[]): PhaseVisibility {
  if (activePhase === null || itemPhase === null) return 'full'
  const item = phaseOrder.indexOf(itemPhase)
  const active = phaseOrder.indexOf(activePhase)
  if (item === active || item < 0) return 'full'
  return item < active ? 'dim' : 'hidden'
}

// ---------- distance calibration ----------

/** Plan-wide correction factor for estimated distances (1 = uncalibrated). */
export const distanceFactor = (plan: Plan): number => {
  const f = Number(plan.meta.get('distanceFactor'))
  return Number.isFinite(f) && f > 0 ? f : 1
}

export function setDistanceFactor(plan: Plan, factor: number) {
  tx(plan, () => (factor === 1 ? plan.meta.delete('distanceFactor') : plan.meta.set('distanceFactor', factor)))
}

/** Points every nation may conquer per day; null = no limit set. */
export const dailyPoints = (plan: Plan): number | null => {
  const n = Number(plan.meta.get('dailyPoints'))
  return Number.isFinite(n) && n > 0 ? n : null
}

export function setDailyPoints(plan: Plan, points: number | null) {
  tx(plan, () => (points && points > 0 ? plan.meta.set('dailyPoints', points) : plan.meta.delete('dailyPoints')))
}

// ---------- import / export ----------

/** Errors thrown by importPlan; the UI maps them to translated messages. */
export class ImportError extends Error {
  constructor(readonly code: 'not-a-plan' | 'newer-version') {
    super(code)
  }
}

export interface PlanSnapshot {
  /** File identifier; kept as 'cow-planner' (the app's former name) so older exports stay importable. */
  app: 'cow-planner'
  version: number
  exportedAt: string
  title: string
  nations: PlanNation[]
  /** Since v3. */
  players?: Player[]
  /** Since v3: the line-up at export time (only organizers can apply it on import). */
  lineup?: LineupSnapshot
  layers: Layer[]
  phases: Phase[]
  objects: PlanObject[]
  assignments: Record<string, Assignment>
  ownership: Record<string, string>
  /** Optional: absent in files from before the point system. */
  dailyPoints?: number
}

export function exportPlan(plan: Plan, lineup?: LineupSnapshot): PlanSnapshot {
  return {
    app: 'cow-planner',
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    title: String(plan.meta.get('title') ?? ''),
    nations: [...plan.nations.values()],
    players: [...plan.players.values()],
    lineup,
    layers: [...plan.layers.values()],
    phases: plan.phases.toArray(),
    objects: [...plan.objects.values()],
    assignments: Object.fromEntries(plan.assignments.entries()),
    ownership: Object.fromEntries(plan.ownership.entries()),
    dailyPoints: dailyPoints(plan) ?? undefined,
  }
}

/**
 * Replaces the whole plan with a snapshot (one undoable transaction). Returns the
 * line-up the file carries (v2 files: derived from their nicknames) for the caller
 * to apply when allowed.
 */
export function importPlan(plan: Plan, snap: PlanSnapshot, defaults?: { title?: string; layerName?: string }): LineupSnapshot | null {
  if (snap?.app !== 'cow-planner') throw new ImportError('not-a-plan')
  if (snap.version > SCHEMA_VERSION) throw new ImportError('newer-version')
  const v1 = snap.version < 2
  const legacy = !v1 && snap.version < 3 ? legacyLineup(snap.nations ?? []) : null
  tx(plan, () => {
    plan.nations.clear()
    plan.players.clear()
    plan.layers.clear()
    plan.objects.clear()
    plan.assignments.clear()
    plan.ownership.clear()
    plan.phases.delete(0, plan.phases.length)
    plan.meta.set('title', snap.title || defaults?.title || 'Imported plan')
    plan.meta.set('schema', SCHEMA_VERSION)
    setDailyPoints(plan, snap.dailyPoints ?? null)
    if (!v1) snap.nations.forEach((n) => plan.nations.set(n.id, { id: n.id, color: n.color }))
    for (const p of legacy?.players ?? snap.players ?? [])
      if (p?.id && p.name) plan.players.set(p.id, { id: p.id, name: cleanName(p.name), wish: p.wish ?? null, joinedAt: p.joinedAt ?? Date.now() })
    snap.layers.forEach((l) => plan.layers.set(l.id, l))
    plan.phases.push(snap.phases)
    snap.objects.forEach((o) => plan.objects.set(o.id, v1 ? { ...o, author: '' } : o))
    // v1 files assigned provinces to free-form players without nations; only drawings carry over.
    if (!v1) {
      Object.entries(snap.assignments).forEach(([k, a]) => plan.assignments.set(k, a))
      Object.entries(snap.ownership ?? {}).forEach(([k, n]) => plan.ownership.set(k, n))
    }
  })
  ensureDefaults(plan, defaults)
  return legacy?.slots ?? snap.lineup ?? null
}
