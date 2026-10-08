import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { COSTS, NATION_CLASS, conquestCost, planPoints, scopePoints, type Category, type Kind } from '../shared/points'
import type { MapData, NationsFile } from '../src/map/types'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

/** world_nation_class.csv: semicolons, quoted nation lists, decimal commas. */
function parseClassTable() {
  const [, ...lines] = read('../sources/world_nation_class.csv').trim().split(/\r?\n/)
  return lines.map((line) => {
    const cells = line.match(/("[^"]*"|[^;]*)(;|$)/g)!.map((c) => c.replace(/;$/, '').replace(/^"|"$/g, ''))
    const nums = cells.slice(2, 11).map((c) => Number(c.replace(',', '.')))
    return {
      cls: Number(cells[0].replace('Klasse ', '')) as keyof typeof COSTS,
      nations: cells[1].split(',').map((n) => n.trim()),
      enemyCore: nums.slice(0, 3),
      enemyNonCore: nums.slice(3, 6),
      teamCore: nums.slice(6, 9),
    }
  })
}

describe('point table', () => {
  const table = parseClassTable()

  it('matches world_nation_class.csv', () => {
    expect(table).toHaveLength(6)
    for (const row of table)
      for (const cat of ['enemyCore', 'enemyNonCore', 'teamCore'] as Category[]) expect(COSTS[row.cls][cat], `class ${row.cls} ${cat}`).toEqual(row[cat])
  })

  it('classes as many nations as the CSV lists, all of them on the map', () => {
    const shorts = new Set(Object.values(JSON.parse(read('../public/data/nations.json')) as NationsFile).map((n) => n.short))
    for (const row of table) expect(Object.values(NATION_CLASS).filter((c) => c === row.cls), `class ${row.cls}`).toHaveLength(row.nations.length)
    for (const id of Object.keys(NATION_CLASS)) expect(shorts, id).toContain(id)
  })
})

describe('conquest cost', () => {
  const team = new Set(['GER', 'POL'])
  const isTeam = (n: string) => team.has(n)
  const cost = (attacker: string, owner: string, coreNation: string | null, kind: Kind, teamFn = isTeam) => conquestCost({ attacker, owner, coreNation, kind, isTeam: teamFn })

  it('prices by the owner class, the kind of land and the province kind', () => {
    // Germany takes Warsaw from an enemy Poland: class 5, enemy core, Doppelstadt.
    expect(cost('GER', 'POL', 'POL', 2, () => false)).toMatchObject({ points: 9, category: 'enemyCore', ownerClass: 5 })
    // Poland retakes Warsaw from Germany: class 4, own core.
    expect(cost('POL', 'GER', 'POL', 2)).toMatchObject({ points: 5, category: 'teamCore', ownerClass: 4 })
    // Taking French Algiers (non-core city).
    expect(cost('ITA', 'FRA', null, 1)).toMatchObject({ points: 2, category: 'enemyNonCore' })
    // A teammate's core land held by the enemy counts as team core.
    expect(cost('GER', 'USSR', 'POL', 0)).toMatchObject({ points: 0.5, category: 'teamCore', ownerClass: 1 })
    // Enemy-held core land of a third nation is non-core for the holder.
    expect(cost('GER', 'USSR', 'FIN', 0)).toMatchObject({ points: 1, category: 'enemyNonCore' })
  })

  it('makes nations without a class free', () => {
    expect(cost('GER', 'FIN', 'FIN', 2)).toMatchObject({ points: 0, ownerClass: null })
  })

  it('sums planned conquests per nation and prices achieved ones from the original owner', () => {
    const sums = planPoints(
      [
        { province: 1, attacker: 'GER', owner: 'FRA', start: 'FRA', coreNation: 'FRA', kind: 1 }, // 6
        { province: 2, attacker: 'GER', owner: 'GER', start: 'FRA', coreNation: 'FRA', kind: 0 }, // done: 2
        { province: 3, attacker: 'GER', owner: 'FIN', start: 'FIN', coreNation: 'FIN', kind: 0 }, // free
        { province: 4, attacker: 'POL', owner: 'USSR', start: 'USSR', coreNation: 'USSR', kind: 2 }, // 4
      ],
      isTeam,
    )
    expect(sums.get('GER')).toMatchObject({ total: 8, open: 6, done: 1, free: 1 })
    expect(sums.get('POL')).toMatchObject({ total: 4, open: 4, done: 0, free: 0 })
  })
})

describe('cities and core land in the map data', () => {
  const data: MapData = JSON.parse(read('../public/data/provinces.json'))
  const byName = (n: string) => data.provinces.find((p) => p.name === n)!

  it('gives every resource province its production', () => {
    for (const p of data.provinces) expect(p.amount > 0, p.name).toBe(p.res !== null)
    expect(data.provinces.filter((p) => p.res).length).toBe(1059)
  })

  it('derives cities, Doppelstädte and non-core land', () => {
    expect(byName('Berlin')).toMatchObject({ city: 2, core: true, res: 'oil', amount: 6000 })
    expect(byName('Frankfurt')).toMatchObject({ city: 1, core: true })
    expect(byName('Eisenach')).toMatchObject({ city: 0, core: true })
    expect(byName('Algiers')).toMatchObject({ city: 1, core: false })
    expect(byName('Batavia')).toMatchObject({ city: 2, core: false })
    expect(byName('Dresden')).toMatchObject({ city: 0, core: true, res: null })
  })
})

describe('points per phase (day)', () => {
  const item = (province: number, points: number, phaseId: string | null) =>
    ({ province, points, phaseId, done: false, category: 'enemyCore', ownerClass: 5 }) as const
  const items = [item(1, 4, 'd1'), item(2, 3, 'd1'), item(3, 9, 'd2'), item(4, 2, null)]

  it('one day counts only its conquests against the daily allowance', () => {
    const p = scopePoints(items, { phases: ['d1'], all: false }, 6)
    expect(p.used).toBe(7)
    expect(p.limit).toBe(6)
    expect(p.over).toBe(1)
    expect(p.items.map((i) => i.province)).toEqual([1, 2])
    expect(p.unscheduled).toBe(2)
  })

  it('several days multiply the allowance and flag each day on its own', () => {
    const p = scopePoints(items, { phases: ['d1', 'd2'], all: false }, 8)
    expect(p.used).toBe(16)
    expect(p.limit).toBe(16)
    expect(p.over).toBe(0)
    expect(p.days).toEqual([
      { phaseId: 'd1', used: 7, over: false },
      { phaseId: 'd2', used: 9, over: true },
    ])
  })

  it('the whole plan includes conquests without a phase', () => {
    const p = scopePoints(items, { phases: ['d1', 'd2'], all: true }, null)
    expect(p.used).toBe(18)
    expect(p.limit).toBeNull()
    expect(p.unscheduled).toBe(0)
    // Without phases the plan is a single day.
    expect(scopePoints(items, { phases: [], all: true }, 10).limit).toBe(10)
  })
})
