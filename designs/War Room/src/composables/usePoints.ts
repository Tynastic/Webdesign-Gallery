import { computed } from 'vue'
import { dailyPoints, isTeam, setOwners } from '../../shared/schema'
import { planPoints, plannedCost, scopePoints, type PhaseScope, type PlannedConquest } from '../../shared/points'
import { session } from '../state/session'
import { usePlanner } from '../ui/context'
import { useYArray, useYMap } from './useY'

/** Live conquest points of the plan: per nation, per selected phases (days), and for any single province. */
export function usePoints() {
  const { data, catalog, plan, undo } = usePlanner()
  const roster = useYMap(plan.nations)
  const assignments = useYMap(plan.assignments)
  const ownership = useYMap(plan.ownership)
  const phases = useYArray(plan.phases)
  const meta = useYMap(plan.meta)

  const owners = computed(() => catalog.owners(ownership.value.entries()))
  const team = computed(() => {
    const r = roster.value
    return (nation: string) => isTeam(r.get(nation))
  })

  function conquest(province: number, attacker: string, phaseId: string | null = null): PlannedConquest {
    const p = data.provinces[province]
    const start = catalog.startOf(province).id
    return { province, attacker, owner: catalog.list[owners.value[province]].id, start, coreNation: p.core ? start : null, kind: p.city, phaseId }
  }

  const byNation = computed(() => planPoints([...assignments.value].map(([key, a]) => conquest(Number(key), a.nation, a.phaseId)), team.value))
  const allowance = computed(() => (meta.value, dailyPoints(plan)))

  /** The days the counter covers: the phases picked in the Points panel, or all of them. */
  const scope = computed<PhaseScope>(() => {
    const ids = phases.value.map((p) => p.id)
    const picked = ids.filter((id) => session.pointsPhases.includes(id))
    const all = !picked.length || picked.length === ids.length
    return { phases: all ? ids : picked, all }
  })

  /** Each nation's points within the scope, against allowance × days. */
  const scoped = computed(() => new Map([...byNation.value].map(([id, p]) => [id, scopePoints(p.items, scope.value, allowance.value)])))

  /** Record planned conquests as achieved (the planned nation now holds them), or undo that. */
  function markTaken(provinces: number[], taken: boolean) {
    const changes = provinces.flatMap((id) => {
      const a = plan.assignments.get(String(id))
      if (!a) return []
      const original = catalog.startOf(id).id
      const holds = catalog.list[owners.value[id]].id === a.nation
      if (taken === holds) return []
      return [{ province: id, nation: taken ? a.nation : null, original }]
    })
    if (!changes.length) return 0
    undo.stopCapturing()
    setOwners(plan, changes)
    undo.stopCapturing()
    return changes.length
  }

  return {
    byNation,
    allowance,
    scope,
    scoped,
    markTaken,
    /** What conquering this province would cost the nation (as planned, or hypothetically). */
    costFor: (province: number, attacker: string) => plannedCost(conquest(province, attacker), team.value),
  }
}
