import { computed, onScopeDispose, shallowRef } from 'vue'
import { TEAMS, type Team } from '../../shared/lineup'
import { roleName, type Role } from '../../shared/match'
import { PLAYABLE } from '../../shared/points'
import { session } from '../state/session'
import { usePlanner, type PlannerContext } from '../ui/context'

/**
 * The live match for Vue: roles per playable nation, and the derived lists the
 * panels share (teams, the order nation pickers use, my own role).
 */
export function useMatch(ctx?: Pick<PlannerContext, 'handle' | 'catalog'>) {
  // The planner itself provides the context, so it passes it in instead of injecting it.
  const { handle, catalog } = ctx ?? usePlanner()
  const match = shallowRef(handle.match.current)
  onScopeDispose(handle.match.onChange((m) => (match.value = m)))

  const roles = computed(() => match.value.roles)
  const role = (nation: string | null | undefined): Role | undefined => (nation ? roles.value.get(nation) : undefined)
  const nationName = (nation: string) => catalog.byId.get(nation)?.name ?? nation
  /** "Tyo (Germany)" or "Germany". */
  const label = (nation: string) => roleName(role(nation), nationName(nation))

  const myRole = computed(() => role(session.me))
  const myTeam = computed<Team | null>(() => myRole.value?.team ?? null)

  /** Playable nations per team, and the unassigned ones (null). */
  const byTeam = computed(() => {
    const out = new Map<Team | null, Role[]>([...TEAMS, null].map((t) => [t, []]))
    for (const n of PLAYABLE) {
      const r = roles.value.get(n)!
      out.get(r.team)!.push(r)
    }
    return out
  })

  /**
   * Nations that have a player, in the order the conquest tool's chips and number
   * keys use: my team first, then the other team, then unassigned.
   */
  const playerNations = computed(() => {
    const order: (Team | null)[] = myTeam.value === 'allies' ? ['allies', 'axis', null] : ['axis', 'allies', null]
    return order.flatMap((t) => byTeam.value.get(t)!.filter((r) => r.player))
  })

  const playersTotal = computed(() => PLAYABLE.filter((n) => roles.value.get(n)!.player).length)

  return { match, roles, role, label, nationName, myRole, myTeam, byTeam, playerNations, playersTotal }
}
