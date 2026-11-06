/**
 * The coalition's conquest point system (sources/world_nation_class.csv). Every
 * player nation may conquer a daily allowance of points. A province's price
 * depends on the class of the nation holding it and whether it is a province or
 * a city (Doppelstädte count as cities):
 *
 *   class 1 (large):  province 1, city 4
 *   class 2 (medium): province 2, city 5
 *   class 3 (small):  province 3, city 6
 *
 * Taking non-core land of the holder, and retaking your own or a teammate's core
 * land, costs half. A capital always costs 10. Nations without a player are AI
 * nations: their land is always free.
 *
 * No DOM, no Vue: tested directly against the CSV.
 */

export type NationClass = 1 | 2 | 3
/** 0 = province, 1 = city, 2 = Doppelstadt (same as Province.city). */
export type Kind = 0 | 1 | 2
/** Which rule prices the province: a capital, the holder's core land, its non-core land, or a recapture. */
export type Category = 'capital' | 'core' | 'nonCore' | 'recapture'

/** The 30 playable nations by short code (nations.json). Every other nation is always AI. */
export const NATION_CLASS: Record<string, NationClass> = {
  USA: 1, USSR: 1, CHN: 1, BRA: 1,
  CAN: 2, UK: 2, FRA: 2, GER: 2, ITA: 2, ESP: 2, IND: 2, JPN: 2, AUS: 2,
  MEX: 3, VEN: 3, PER: 3, ARG: 3, RSA: 3, EGY: 3, SWE: 3, NED: 3, POL: 3,
  YUG: 3, ROM: 3, TUR: 3, IRN: 3, SIN: 3, TIB: 3, MGL: 3, MAN: 3,
}

/** Playable nations, largest class first, then by code: the order pickers and the line-up use. */
export const PLAYABLE: string[] = Object.keys(NATION_CLASS).sort((a, b) => NATION_CLASS[a] - NATION_CLASS[b] || a.localeCompare(b))
export const isPlayable = (nation: string) => nation in NATION_CLASS

/** Points by holder class: [province, city]. */
export const PRICES: Record<NationClass, [number, number]> = {
  1: [1, 4],
  2: [2, 5],
  3: [3, 6],
}
export const CAPITAL_POINTS = 10

/** What the price depends on besides the province itself: who plays, and who plays together. */
export interface Rules {
  /** Class of a nation that has a player; null for AI nations (no player) and nations without a class. */
  classOf(nation: string): NationClass | null
  /** Both nations have a player and are on the same team. */
  mates(a: string, b: string): boolean
}

export interface CostInput {
  /** Nation that should conquer the province. */
  attacker: string
  /** Nation holding it now. */
  owner: string
  /** Nation whose core land it is (its original owner), or null for non-core land. */
  coreNation: string | null
  kind: Kind
  /** The province is a nation's capital. */
  capital: boolean
}

export interface Cost {
  points: number
  category: Category
  /** null = the holder is an AI nation (or the attacker itself), so the province is free. */
  ownerClass: NationClass | null
  /** Half price (non-core land or a recapture). */
  half: boolean
}

export function conquestCost(c: CostInput, rules: Rules): Cost {
  const recapture = c.coreNation !== null && c.coreNation !== c.owner && (c.coreNation === c.attacker || rules.mates(c.coreNation, c.attacker))
  const category: Category = c.capital ? 'capital' : recapture ? 'recapture' : c.coreNation === c.owner ? 'core' : 'nonCore'
  const ownerClass = c.owner === c.attacker ? null : rules.classOf(c.owner)
  const half = category === 'recapture' || category === 'nonCore'
  let points = 0
  if (ownerClass) points = category === 'capital' ? CAPITAL_POINTS : PRICES[ownerClass][c.kind ? 1 : 0] * (half ? 0.5 : 1)
  return { points, category, ownerClass, half }
}

export interface PlannedConquest {
  province: number
  attacker: string
  /** Current owner. */
  owner: string
  /** Original owner: an achieved conquest is priced as taken from it. */
  start: string
  coreNation: string | null
  kind: Kind
  capital: boolean
  /** Phase (day) it is planned for; null or absent = unscheduled. */
  phaseId?: string | null
}

export interface PointsItem extends Cost {
  province: number
  /** The attacker already holds it. */
  done: boolean
  phaseId: string | null
}

export interface NationPoints {
  /** Points of every planned conquest, achieved or not; this is what the allowance limits. */
  total: number
  /** Points of the conquests still to make. */
  open: number
  /** Achieved conquests. */
  done: number
  /** Planned provinces held by AI nations (0 points). */
  free: number
  items: PointsItem[]
}

/** Prices one planned conquest; an achieved one as taken from its original owner. */
export function plannedCost(c: PlannedConquest, rules: Rules): PointsItem {
  const done = c.owner === c.attacker
  return { ...conquestCost({ ...c, owner: done ? c.start : c.owner }, rules), province: c.province, done, phaseId: c.phaseId ?? null }
}

/** Sums the points of every nation's planned conquests. */
export function planPoints(conquests: Iterable<PlannedConquest>, rules: Rules): Map<string, NationPoints> {
  const out = new Map<string, NationPoints>()
  for (const c of conquests) {
    const item = plannedCost(c, rules)
    let sum = out.get(c.attacker)
    if (!sum) out.set(c.attacker, (sum = { total: 0, open: 0, done: 0, free: 0, items: [] }))
    sum.items.push(item)
    sum.total += item.points
    if (item.done) sum.done++
    else sum.open += item.points
    if (item.ownerClass === null) sum.free++
  }
  return out
}

export interface PhaseScope {
  /** Phases (days) counted, in plan order. */
  phases: string[]
  /** The scope covers the whole plan, so unscheduled conquests count too. */
  all: boolean
}

export interface ScopedPoints {
  /** Points of the conquests in scope; what the limit applies to. */
  used: number
  /** Daily allowance × days in scope; null = no allowance set. */
  limit: number | null
  /** Points above the limit (0 = within it). */
  over: number
  items: PointsItem[]
  /** Points per day in scope, each against the daily allowance. */
  days: { phaseId: string; used: number; over: boolean }[]
  /** Points of unscheduled conquests the scope leaves out. */
  unscheduled: number
}

/**
 * A nation's points for the selected phases. The allowance is per day (= phase), so
 * the limit grows with the number of days counted. Conquests without a phase belong
 * to no day: they only count when the scope covers the whole plan.
 */
export function scopePoints(items: PointsItem[], scope: PhaseScope, allowance: number | null): ScopedPoints {
  const perDay = new Map(scope.phases.map((id) => [id, 0]))
  let used = 0
  let unscheduled = 0
  const inScope: PointsItem[] = []
  for (const item of items) {
    const day = item.phaseId !== null && perDay.has(item.phaseId) ? item.phaseId : null
    if (day === null && !scope.all) {
      if (item.phaseId === null) unscheduled += item.points
      continue
    }
    inScope.push(item)
    used += item.points
    if (day !== null) perDay.set(day, perDay.get(day)! + item.points)
  }
  const limit = allowance === null ? null : allowance * Math.max(1, scope.phases.length)
  return {
    used,
    limit,
    over: limit !== null && used > limit ? used - limit : 0,
    items: inScope,
    days: [...perDay].map(([phaseId, p]) => ({ phaseId, used: p, over: allowance !== null && p > allowance })),
    unscheduled,
  }
}
