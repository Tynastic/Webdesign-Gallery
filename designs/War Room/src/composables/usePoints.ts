import { computed } from 'vue'
import { dailyPoints, isTeam } from '../../shared/schema'
import { planPoints, plannedCost, type PlannedConquest } from '../../shared/points'
import { usePlanner } from '../ui/context'
import { useYMap } from './useY'

/** Live conquest points of the plan: per nation, and for any single province. */
export function usePoints() {
  const { data, catalog, plan } = usePlanner()
  const roster = useYMap(plan.nations)
  const assignments = useYMap(plan.assignments)
  const ownership = useYMap(plan.ownership)
  const meta = useYMap(plan.meta)

  const owners = computed(() => catalog.owners(ownership.value.entries()))
  const team = computed(() => {
    const r = roster.value
    return (nation: string) => isTeam(r.get(nation))
  })

  function conquest(province: number, attacker: string): PlannedConquest {
    const p = data.provinces[province]
    const start = catalog.startOf(province).id
    return { province, attacker, owner: catalog.list[owners.value[province]].id, start, coreNation: p.core ? start : null, kind: p.city }
  }

  const byNation = computed(() => planPoints([...assignments.value].map(([key, a]) => conquest(Number(key), a.nation)), team.value))
  const allowance = computed(() => (meta.value, dailyPoints(plan)))

  return {
    byNation,
    allowance,
    /** What conquering this province would cost the nation (as planned, or hypothetically). */
    costFor: (province: number, attacker: string) => plannedCost(conquest(province, attacker), team.value),
  }
}
