import { describe, expect, it } from 'vitest'
import { assignPlayer, createLineup, exportLineup, importLineup, nationOf, releasePlayer, setTeam } from '../shared/lineup'
import { resolveMatch } from '../shared/match'
import { PLAYABLE } from '../shared/points'
import { addPlayer, createPlan, legacyLineup } from '../shared/schema'

describe('line-up', () => {
  it('puts only playable nations on teams', () => {
    const l = createLineup()
    setTeam(l, ['GER', 'ITA', 'FIN'], 'axis')
    expect(exportLineup(l)).toEqual({ GER: { team: 'axis', player: null }, ITA: { team: 'axis', player: null } })
    setTeam(l, ['ITA'], null)
    expect([...l.slots.keys()]).toEqual(['GER'])
  })

  it('seats one player per nation and one nation per player', () => {
    const l = createLineup()
    assignPlayer(l, 'GER', 'p1')
    assignPlayer(l, 'ITA', 'p1') // moves, never duplicates
    expect(nationOf(l.slots, 'p1')).toBe('ITA')
    expect(l.slots.get('GER')).toBeUndefined()
    assignPlayer(l, 'ITA', 'p2') // replaces
    expect(nationOf(l.slots, 'p1')).toBeNull()
    setTeam(l, ['ITA'], 'axis')
    releasePlayer(l, 'p2')
    expect(l.slots.get('ITA')).toEqual({ team: 'axis', player: null })
  })

  it('imports only valid slots', () => {
    const l = createLineup()
    importLineup(l, { GER: { team: 'axis', player: 'p1' }, FIN: { team: 'axis', player: 'x' }, USA: { team: 'red' as never, player: 7 as never } })
    expect(exportLineup(l)).toEqual({ GER: { team: 'axis', player: 'p1' } })
  })

  it('converts v2 nicknames of playable nations', () => {
    const { players, slots } = legacyLineup([
      { id: 'GER', nickname: ' Tyo ', color: '#f00' },
      { id: 'ITA', nickname: '', color: '#0f0' },
      { id: 'FIN', nickname: 'x', color: '#00f' },
    ])
    expect(players).toMatchObject([{ name: 'Tyo', wish: 'GER' }])
    expect(slots).toEqual({ GER: { team: null, player: players[0].id } })
  })
})

describe('match roles', () => {
  function setup() {
    const plan = createPlan()
    const l = createLineup()
    const tyo = addPlayer(plan, 'Tyo')
    const ann = addPlayer(plan, 'Ann')
    setTeam(l, ['GER', 'ITA'], 'axis')
    setTeam(l, ['USA', 'POL'], 'allies')
    assignPlayer(l, 'GER', tyo)
    assignPlayer(l, 'ITA', ann)
    return { plan, l, tyo, ann }
  }

  it('lists every playable nation with team, player and class', () => {
    const { plan, l, tyo } = setup()
    const m = resolveMatch(l.slots, plan.players)
    expect(m.roles.size).toBe(PLAYABLE.length)
    expect(m.roles.get('GER')).toMatchObject({ team: 'axis', cls: 2, player: { name: 'Tyo' } })
    expect(m.roles.get('USA')).toMatchObject({ team: 'allies', cls: 1, player: null })
    expect(m.nationOf.get(tyo)).toBe('GER')
  })

  it('colours every nation, playable or not, in its own colour', () => {
    const { plan, l } = setup()
    const colours = (n: string) => ({ GER: '#c49a8f', FIN: '#d9bc85' })[n]
    const m = resolveMatch(l.slots, plan.players, colours)
    expect(m.roles.get('GER')!.color).toBe('#c49a8f')
    expect(m.colorOf('FIN')).toBe('#d9bc85') // AI nations too
    expect(m.colorOf('XYZ')).toBe('#9a9a84') // unknown: a neutral fallback
  })

  it('treats nations without a player as AI: no class, no mates', () => {
    const { plan, l } = setup()
    const { rules } = resolveMatch(l.slots, plan.players)
    expect(rules.classOf('GER')).toBe(2)
    expect(rules.classOf('USA')).toBeNull() // no player
    expect(rules.classOf('FIN')).toBeNull() // never playable
    expect(rules.mates('GER', 'ITA')).toBe(true)
    expect(rules.mates('GER', 'POL')).toBe(false)
  })

  it('ignores players who were removed or seated twice', () => {
    const { plan, l, tyo, ann } = setup()
    plan.players.delete(ann)
    // Two organizers seating the same player at once can leave them in two slots.
    l.slots.set('USA', { team: 'allies', player: tyo })
    const m = resolveMatch(l.slots, plan.players)
    expect(m.roles.get('ITA')!.player).toBeNull()
    // The first nation in PLAYABLE order keeps the player (class 1 USA before class 2 Germany).
    expect(m.nationOf.get(tyo)).toBe('USA')
    expect(m.roles.get('GER')!.player).toBeNull()
  })
})
