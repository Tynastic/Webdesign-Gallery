/**
 * Who is who in a match: for every playable nation its class, team, player and
 * colour, resolved from the line-up (teams, allotment) and the players who signed
 * up. Also the point rules that follow from it.
 *
 * Colours: every nation has one colour, its Call of War colour. It is its player's
 * colour (avatar, cursor, chips) and the colour of its planned conquests and, by
 * default, its drawings (the Teams map shows those muted). Neutral colours exist
 * only for generic drawings.
 *
 * No DOM, no Vue.
 */
import { EMPTY_SLOT, type Lookup, type Slot, type Team } from './lineup'
import { NATION_CLASS, PLAYABLE, type NationClass, type Rules } from './points'
import type { Player } from './schema'

export interface Role {
  nation: string
  cls: NationClass
  team: Team | null
  /** null = AI nation. */
  player: Player | null
  /** The nation's Call of War colour: its player's, its planned conquests', its drawings' by default. */
  color: string
}

export interface Match {
  /** Every playable nation, in PLAYABLE order. */
  roles: Map<string, Role>
  /** Player id -> nation they play. */
  nationOf: Map<string, string>
  rules: Rules
  /** Colour of any nation, playable or not. */
  colorOf(nation: string): string
}

const FALLBACK = '#9a9a84'

export function resolveMatch(slots: Lookup<Slot>, players: Lookup<Player>, baseColor: (nation: string) => string | undefined = () => undefined): Match {
  const colorOf = (n: string) => baseColor(n) ?? FALLBACK
  const roles = new Map<string, Role>()
  const nationOf = new Map<string, string>()
  for (const nation of PLAYABLE) {
    const slot = slots.get(nation) ?? EMPTY_SLOT
    let player = slot.player ? (players.get(slot.player) ?? null) : null
    // One nation per player: a concurrent double assignment keeps the first.
    if (player && nationOf.has(player.id)) player = null
    if (player) nationOf.set(player.id, nation)
    roles.set(nation, { nation, cls: NATION_CLASS[nation], team: slot.team, player, color: colorOf(nation) })
  }
  const rules: Rules = {
    classOf: (n) => {
      const r = roles.get(n)
      return r?.player ? r.cls : null
    },
    mates: (a, b) => {
      const ra = roles.get(a), rb = roles.get(b)
      return !!ra?.player && !!rb?.player && ra.team !== null && ra.team === rb.team
    },
  }
  return { roles, nationOf, rules, colorOf }
}

/** "Tyo (Germany)" for nations with a player, "Germany" otherwise. */
export function roleName(role: Role | undefined, nationName: string): string {
  return role?.player ? `${role.player.name} (${nationName})` : nationName
}
