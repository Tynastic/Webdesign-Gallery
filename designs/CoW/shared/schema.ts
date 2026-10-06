/**
 * The shared plan: one Yjs document per room. Everything players draw, assign or
 * mark as conquered lives here; the client renders from it and tools only ever
 * write to it. Values are plain JSON objects replaced as a whole on update (last
 * writer wins per object), which keeps rendering diff-friendly.
 *
 * Nations are identified by their short code from nations.json (e.g. "GER").
 * Every player plays a nation, but not every nation has a player: a roster entry
 * with an empty nickname is an AI or unclaimed nation.
 *
 * No DOM, no Vue: also loadable by the sync server.
 */
import * as Y from 'yjs'
import { nanoid } from 'nanoid'

export const SCHEMA_VERSION = 2

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

/** A nation taking part in the plan. */
export interface PlanNation {
  /** Nation short code, e.g. "GER". */
  id: string
  /** The human player's nickname; '' = no player (AI / unclaimed). */
  nickname: string
  /** Bright marker colour for this nation's plans and drawings (the map colour is too muted). */
  color: string
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

export const MARKER_COLORS = ['#ff5a4e', '#3d9bff', '#ffd23f', '#22d3a6', '#ff7fd8', '#ff9a2e', '#a77bff', '#5ee0ff', '#b4f04a', '#f2f2f2']

export interface Plan {
  doc: Y.Doc
  meta: Y.Map<unknown>
  nations: Y.Map<PlanNation>
  layers: Y.Map<Layer>
  phases: Y.Array<Phase>
  objects: Y.Map<PlanObject>
  assignments: Y.Map<Assignment>
  /** Province id -> nation id currently holding it. Only provinces that changed hands since 1942. */
  ownership: Y.Map<string>
}

export function createPlan(doc = new Y.Doc()): Plan {
  return {
    doc,
    meta: doc.getMap('meta'),
    nations: doc.getMap('nations'),
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

/** "Tyo (Germany)" for nations with a player, "Germany" otherwise. */
export function displayName(entry: PlanNation | undefined, nationName: string): string {
  return entry?.nickname ? `${entry.nickname} (${nationName})` : nationName
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
 * Record who holds provinces now. Pass the province's 1942 owner (or null) to
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

// ---------- roster (nations and their players) ----------

/** Add a nation to the plan (no-op if present). An empty nickname means no player. */
export function addNation(plan: Plan, id: string, nickname = '', color?: string) {
  if (plan.nations.has(id)) return
  const used = new Set([...plan.nations.values()].map((n) => n.color))
  tx(plan, () => plan.nations.set(id, { id, nickname: nickname.trim(), color: color ?? MARKER_COLORS.find((c) => !used.has(c)) ?? MARKER_COLORS[0] }))
}

export function updateNation(plan: Plan, id: string, patch: Partial<Omit<PlanNation, 'id'>>) {
  const cur = plan.nations.get(id)
  if (cur) tx(plan, () => plan.nations.set(id, { ...cur, ...patch }))
}

/** Removes a nation from the roster and the conquests planned for it. Ownership is history and stays. */
export function removeNation(plan: Plan, id: string) {
  tx(plan, () => {
    plan.nations.delete(id)
    for (const [key, a] of plan.assignments) if (a.nation === id) plan.assignments.delete(key)
  })
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
  layers: Layer[]
  phases: Phase[]
  objects: PlanObject[]
  assignments: Record<string, Assignment>
  ownership: Record<string, string>
}

export function exportPlan(plan: Plan): PlanSnapshot {
  return {
    app: 'cow-planner',
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    title: String(plan.meta.get('title') ?? ''),
    nations: [...plan.nations.values()],
    layers: [...plan.layers.values()],
    phases: plan.phases.toArray(),
    objects: [...plan.objects.values()],
    assignments: Object.fromEntries(plan.assignments.entries()),
    ownership: Object.fromEntries(plan.ownership.entries()),
  }
}

/** Replaces the whole plan with a snapshot (one undoable transaction). */
export function importPlan(plan: Plan, snap: PlanSnapshot, defaults?: { title?: string; layerName?: string }) {
  if (snap?.app !== 'cow-planner') throw new ImportError('not-a-plan')
  if (snap.version > SCHEMA_VERSION) throw new ImportError('newer-version')
  const v1 = snap.version < 2
  tx(plan, () => {
    plan.nations.clear()
    plan.layers.clear()
    plan.objects.clear()
    plan.assignments.clear()
    plan.ownership.clear()
    plan.phases.delete(0, plan.phases.length)
    plan.meta.set('title', snap.title || defaults?.title || 'Imported plan')
    plan.meta.set('schema', SCHEMA_VERSION)
    if (!v1) snap.nations.forEach((n) => plan.nations.set(n.id, n))
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
}
