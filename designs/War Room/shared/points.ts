/**
 * The coalition's conquest point system (world_nation_class.csv). Every player
 * nation may conquer a daily allowance of points. A province's price depends on
 * the class of the nation holding it, whether it is that nation's core land, the
 * attacker's or a teammate's core land, and whether it is a province, city or
 * Doppelstadt. Nations without a class (AI minors) cost nothing.
 *
 * No DOM, no Vue: tested directly against the CSV.
 */

export type NationClass = 1 | 2 | 3 | 4 | 5 | 6
/** 0 = province, 1 = city, 2 = Doppelstadt (same as Province.city). */
export type Kind = 0 | 1 | 2
export type Category = 'enemyCore' | 'enemyNonCore' | 'teamCore'

/** Player nations by short code (nations.json). */
export const NATION_CLASS: Record<string, NationClass> = {
  USA: 1, USSR: 1,
  CHN: 2, BRA: 2,
  IND: 3, AUS: 3, CAN: 3,
  GER: 4, FRA: 4, ESP: 4, UK: 4, JPN: 4, ITA: 4,
  SWE: 5, RSA: 5, POL: 5, ROM: 5, YUG: 5, TUR: 5, ARG: 5, MEX: 5,
  NED: 6, EGY: 6, IRN: 6, VEN: 6, PER: 6, TIB: 6, SIN: 6, MGL: 6, MAN: 6,
}

/** Points by owner class and category: [province, city, Doppelstadt]. */
export const COSTS: Record<NationClass, Record<Category, [number, number, number]>> = {
  1: { enemyCore: [0.5, 2, 4], enemyNonCore: [1, 1.5, 2], teamCore: [0.5, 1.5, 3.5] },
  2: { enemyCore: [1, 3, 5], enemyNonCore: [1, 1.5, 2], teamCore: [1, 2, 4] },
  3: { enemyCore: [1.5, 6, 8], enemyNonCore: [1.5, 2, 3.5], teamCore: [1.5, 2.5, 4.5] },
  4: { enemyCore: [2, 6, 8], enemyNonCore: [1.5, 2, 3.5], teamCore: [1.5, 3, 5] },
  5: { enemyCore: [3, 7, 9], enemyNonCore: [2, 3, 5], teamCore: [2, 3.5, 5.5] },
  6: { enemyCore: [4.5, 8, 10], enemyNonCore: [2, 3, 5], teamCore: [2.5, 4, 6] },
}

export interface CostInput {
  /** Nation that should conquer the province. */
  attacker: string
  /** Nation holding it now. */
  owner: string
  /** Nation whose core land it is (its original owner), or null for non-core land. */
  coreNation: string | null
  kind: Kind
  /** Is this nation on the coalition's team? */
  isTeam: (nation: string) => boolean
}

export interface Cost {
  points: number
  category: Category
  /** null = the owner has no class, so the province is free. */
  ownerClass: NationClass | null
}

export function conquestCost({ attacker, owner, coreNation, kind, isTeam }: CostInput): Cost {
  const category: Category =
    coreNation !== null && (coreNation === attacker || (isTeam(coreNation) && isTeam(attacker)))
      ? 'teamCore'
      : coreNation !== null && coreNation === owner
        ? 'enemyCore'
        : 'enemyNonCore'
  const ownerClass = owner === attacker ? null : (NATION_CLASS[owner] ?? null)
  return { points: ownerClass ? COSTS[ownerClass][category][kind] : 0, category, ownerClass }
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
  /** Planned provinces whose owner has no class (0 points). */
  free: number
  items: PointsItem[]
}

/** Prices one planned conquest; an achieved one as taken from its original owner. */
export function plannedCost(c: PlannedConquest, isTeam: (nation: string) => boolean): PointsItem {
  const done = c.owner === c.attacker
  return { ...conquestCost({ ...c, owner: done ? c.start : c.owner, isTeam }), province: c.province, done, phaseId: c.phaseId ?? null }
}

/** Sums the points of every nation's planned conquests. */
export function planPoints(conquests: Iterable<PlannedConquest>, isTeam: (nation: string) => boolean): Map<string, NationPoints> {
  const out = new Map<string, NationPoints>()
  for (const c of conquests) {
    const item = plannedCost(c, isTeam)
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
