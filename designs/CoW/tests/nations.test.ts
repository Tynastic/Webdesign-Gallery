import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { NationCatalog, connectedTerritory, territoryLabels } from '../src/map/nations'
import type { MapData, NationsFile } from '../src/map/types'

const load = <T>(file: string): T => JSON.parse(readFileSync(new URL(`../public/data/${file}`, import.meta.url), 'utf8'))
const data = load<MapData>('provinces.json')
const catalog = new NationCatalog(data, load<NationsFile>('nations.json'))
const byName = (n: string) => data.provinces.find((p) => p.name === n)!

describe('NationCatalog', () => {
  it('identifies nations by unique short codes', () => {
    expect(catalog.byId.size).toBe(data.colors.length)
    expect(catalog.startOf(byName('Warsaw').id).id).toBe('POL')
  })

  it('applies ownership on top of 1942 owners and ignores unknown nations', () => {
    const warsaw = byName('Warsaw').id
    const owners = catalog.owners([
      [String(warsaw), 'GER'],
      ['5', 'NOPE'],
    ])
    expect(owners[warsaw]).toBe(catalog.byId.get('GER')!.index)
    expect(owners[5]).toBe(data.provinces[5].nation)
  })
})

describe('territories', () => {
  const start = catalog.owners([])

  it('splits nations into connected territories', () => {
    const poland = territoryLabels(data, start).filter((l) => l.nation === catalog.byId.get('POL')!.index)
    expect(poland).toHaveLength(1)
  })

  it('moves conquered land into the conqueror’s territory', () => {
    const polish = connectedTerritory(data, start, byName('Warsaw').id)
    const conquered = catalog.owners(polish.map((id) => [String(id), 'GER'] as [string, string]))
    const labels = territoryLabels(data, conquered)
    expect(labels.some((l) => l.nation === catalog.byId.get('POL')!.index)).toBe(false)
    expect(connectedTerritory(data, conquered, byName('Berlin').id)).toEqual(expect.arrayContaining(polish))
  })
})
