import { resolveMatch, type Match } from '../../shared/match'
import type { Lineup } from '../../shared/lineup'
import type { Plan } from '../../shared/schema'

/**
 * The live match (who plays which nation, on which team, in which colour): recomputed
 * when the line-up or the players change. The map listens with
 * onChange; Vue reads it through useMatch().
 */
export class MatchState {
  current: Match
  private listeners = new Set<(m: Match) => void>()
  private baseColor: (nation: string) => string | undefined = () => undefined
  private readonly update = () => {
    this.current = resolveMatch(this.lineup.slots, this.plan.players, this.baseColor)
    this.listeners.forEach((fn) => fn(this.current))
  }

  /** The nations' colours, once the map data has loaded. */
  setColors(fn: (nation: string) => string | undefined) {
    this.baseColor = fn
    this.update()
  }

  constructor(
    private readonly plan: Plan,
    private readonly lineup: Lineup,
  ) {
    this.current = resolveMatch(new Map(), new Map())
    this.update()
    lineup.slots.observe(this.update)
    plan.players.observe(this.update)
  }

  onChange(fn: (m: Match) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  destroy() {
    this.lineup.slots.unobserve(this.update)
    this.plan.players.unobserve(this.update)
    this.listeners.clear()
  }
}
