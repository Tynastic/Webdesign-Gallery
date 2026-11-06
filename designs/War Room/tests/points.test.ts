import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CAPITAL_POINTS, NATION_CLASS, PRICES, conquestCost, planPoints, scopePoints, type Kind, type Rules } from '../shared/points'
import type { MapData, NationsFile } from '../src/map/types'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

/** world_nation_class.csv: semicolons, quoted nation lists. */
function parseClassTable() {
  const [, ...lines] = read('../sources/world_nation_class.csv').trim().split(/\r?\n/)
  return lines.map((line) => {
    const cells = line.match(/("[^"]*"|[^;]*)(;|$)/g)!.map((c) => c.replace(/;$/, '').replace(/^"|"$/g, ''))
    return {
      cls: Number(cells[0].match(/\d/)![0]) as keyof typeof PRICES,
      nations: cells[1].split(',').map((n) => n.trim()),
      prices: [Number(cells[2]), Number(cells[3])],
    }
  })
}

describe('point table', () => {
  const table = parseClassTable()

  it('matches world_nation_class.csv', () => {
    expect(table).toHaveLength(3)
    for (const row of table) expect(PRICES[row.cls], `class ${row.cls}`).toEqual(row.prices)
  })

  it('classes as many nations as the CSV lists, all of them on the map with a capital', () => {
    const file = JSON.parse(read('../public/data/nations.json')) as NationsFile
    const data: MapData = JSON.parse(read('../public/data/provinces.json'))
    const shorts = new Map(Object.entries(file).map(([color, n]) => [n.short, { ...n, index: data.colors.indexOf(color) }]))
    for (const row of table) expect(Object.values(NATION_CLASS).filter((c) => c === row.cls), `class ${row.cls}`).toHaveLength(row.nations.length)
    for (const id of Object.keys(NATION_CLASS)) {
      const n = shorts.get(id)
      expect(n, id).toBeDefined()
      // The capital names one of the nation's own provinces.
      expect(data.provinces.filter((p) => p.nation === n!.index && p.name === n!.capital), `${id} capital ${n!.capital}`).toHaveLength(1)
    }
  })
})

describe('conquest cost', () => {
  // Germany and Poland play on one team, France and the USSR on the other; Finland is AI.
  const team: Record<string, string> = { GER: 'axis', POL: 'axis', FRA: 'allies', USSR: 'allies', USA: 'allies' }
  const rules: Rules = {
    classOf: (n) => (n in team ? NATION_CLASS[n] : null),
    mates: (a, b) => a in team && team[a] === team[b],
  }
  const cost = (attacker: string, owner: string, coreNation: string | null, kind: Kind, capital = false) => conquestCost({ attacker, owner, coreNation, kind, capital }, rules)

  it('prices by the holder class and whether it is a province or a city', () => {
    expect(cost('GER', 'USSR', 'USSR', 0)).toMatchObject({ points: 1, category: 'core', ownerClass: 1, half: false })
    expect(cost('USSR', 'GER', 'GER', 1)).toMatchObject({ points: 5, category: 'core', ownerClass: 2 })
    expect(cost('FRA', 'POL', 'POL', 0)).toMatchObject({ points: 3, ownerClass: 3 })
    // Doppelstädte count as cities.
    expect(cost('FRA', 'POL', 'POL', 2).points).toBe(6)
  })

  it('halves non-core land of the holder', () => {
    // French Algiers (non-core city) taken by Germany: class 2 city 5, halved.
    expect(cost('GER', 'FRA', null, 1)).toMatchObject({ points: 2.5, category: 'nonCore', half: true })
    // Polish land the USSR holds is not Soviet core land: class 1 province, halved.
    expect(cost('USA', 'USSR', 'POL', 0)).toMatchObject({ points: 0.5, category: 'nonCore' })
  })

  it('halves retaking your own or a teammate’s core land, priced by the holder', () => {
    expect(cost('POL', 'USSR', 'POL', 1)).toMatchObject({ points: 2, category: 'recapture', ownerClass: 1, half: true })
    expect(cost('GER', 'USSR', 'POL', 1)).toMatchObject({ points: 2, category: 'recapture' })
  })

  it('always prices a capital at 10', () => {
    expect(cost('GER', 'POL', 'POL', 2, true)).toMatchObject({ points: CAPITAL_POINTS, category: 'capital', half: false })
    expect(cost('POL', 'USSR', 'POL', 2, true).points).toBe(10) // also when retaking it
  })

  it('makes land held by AI nations free, capitals included', () => {
    expect(cost('GER', 'FIN', 'FIN', 2, true)).toMatchObject({ points: 0, ownerClass: null })
    expect(cost('GER', 'ITA', 'ITA', 1)).toMatchObject({ points: 0, ownerClass: null }) // playable, but no player
  })

  it('sums planned conquests per nation and prices achieved ones from the original owner', () => {
    const sums = planPoints(
      [
        { province: 1, attacker: 'GER', owner: 'FRA', start: 'FRA', coreNation: 'FRA', kind: 1, capital: false }, // 5
        { province: 2, attacker: 'GER', owner: 'GER', start: 'FRA', coreNation: 'FRA', kind: 0, capital: false }, // done: 2
        { province: 3, attacker: 'GER', owner: 'FIN', start: 'FIN', coreNation: 'FIN', kind: 0, capital: false }, // free
        { province: 4, attacker: 'POL', owner: 'USSR', start: 'USSR', coreNation: 'USSR', kind: 2, capital: true }, // 10
      ],
      rules,
    )
    expect(sums.get('GER')).toMatchObject({ total: 7, open: 5, done: 1, free: 1 })
    expect(sums.get('POL')).toMatchObject({ total: 10, open: 10, done: 0, free: 0 })
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
    ({ province, points, phaseId, done: false, category: 'core', ownerClass: 3, half: false }) as const
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
