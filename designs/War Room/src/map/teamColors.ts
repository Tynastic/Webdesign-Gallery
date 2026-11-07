import type { Team } from '../../shared/lineup'
import type { Role } from '../../shared/match'
import type { FillMode } from '../state/session'
import { PAPER, mix } from './color'
import type { NationCatalog } from './nations'

/**
 * Land colours of the four map modes:
 *
 * - Vivid: the Call of War colours as in the game; Muted: the same, pulled toward paper.
 * - Teams: who holds the land, by side. Axis land terracotta, Allies land steel blue,
 *   each nation keeping a little of its own colour so neighbours on one team stay apart;
 *   a team nation without a player is paler, a playable nation without a team sand.
 * - Off: plain paper.
 *
 * "Grey out AI nations" turns every nation without a player grey (with a hint of its
 * colour), so the nations that are played stand out.
 */
const AI_GREY = '#d6d2c6'
export const TEAM_BASE: Record<Team, string> = { axis: '#b4573f', allies: '#3e72ac' }

/** Swatches for legends and UI chips, matching what the map paints. */
export const TEAM_SWATCH: Record<Team | 'ai' | 'open', string> = {
  axis: mix(TEAM_BASE.axis, PAPER, 0.3),
  allies: mix(TEAM_BASE.allies, PAPER, 0.3),
  open: mix(PAPER, '#c9b98f', 0.5),
  ai: mix(AI_GREY, PAPER, 0.2),
}

/** A colour as the Muted map shows it. The Teams map also draws nation-coloured markings this way. */
export const muted = (c: string) => mix(c, PAPER, 0.55)
const greyed = (c: string) => mix(mix(c, AI_GREY, 0.78), PAPER, 0.15)

/** Fill per nation index, or null for Off (paper). */
export function landFills(catalog: NationCatalog, roles: Map<string, Role>, mode: FillMode, aiGrey: boolean): string[] | null {
  if (mode === 'off') return null
  return catalog.list.map((n) => {
    const role = roles.get(n.id)
    if (mode === 'teams') {
      if (role?.team) return mix(mix(TEAM_BASE[role.team], n.color, 0.22), PAPER, role.player ? 0.3 : 0.62)
      if (role) return mix(n.color, '#d8c9a0', 0.6)
      return aiGrey ? mix(n.color, AI_GREY, 0.82) : muted(n.color)
    }
    if (aiGrey && !role?.player) return greyed(n.color)
    return mode === 'vivid' ? n.color : muted(n.color)
  })
}
