import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { pointInRing, ringArea } from '../scripts/build-map-data'
import type { MapData, NationsFile } from '../src/map/types'

const load = <T>(file: string): T => JSON.parse(readFileSync(new URL(`../public/data/${file}`, import.meta.url), 'utf8'))

describe('ring geometry', () => {
  const square = [0, 0, 10, 0, 10, 10, 0, 10]

  it('computes area regardless of winding', () => {
    expect(ringArea(square)).toBe(100)
    expect(ringArea([0, 0, 0, 10, 10, 10, 10, 0])).toBe(100)
  })

  it('tests point containment', () => {
    expect(pointInRing(5, 5, square)).toBe(true)
    expect(pointInRing(15, 5, square)).toBe(false)
  })
})

describe('generated map data', () => {
  const data = load<MapData>('provinces.json')
  const nations = load<NationsFile>('nations.json')

  it('has every province from the SVG with stable sequential ids', () => {
    expect(data.provinces).toHaveLength(3159)
    data.provinces.forEach((p, i) => expect(p.id).toBe(i))
  })

  it('has symmetric adjacency', () => {
    for (const p of data.provinces)
      for (const n of p.neighbors) expect(data.provinces[n].neighbors, `${p.name} <-> ${data.provinces[n].name}`).toContain(p.id)
  })

  it('names every nation colour', () => {
    for (const c of data.colors) {
      expect(nations[c], c).toBeDefined()
      expect(nations[c].short).not.toBe('?')
    }
  })

  it('tags every shared border with an adjacent province pair', () => {
    expect(data.edges.coast.length).toBeGreaterThan(0)
    for (const e of data.edges.shared) {
      expect(e.a).toBeLessThan(e.b)
      expect(data.provinces[e.a].neighbors).toContain(e.b)
      expect(e.line.length % 2 === 0 && e.line.length >= 4).toBe(true)
    }
  })

  it('pairs labels with the right polygons', () => {
    const byName = (n: string) => data.provinces.find((p) => p.name === n)!
    expect(nations[data.colors[byName('Helsinki').nation]].name).toBe('Finland')
    expect(byName('Berlin').neighbors.map((id) => data.provinces[id].name)).toContain('Magdeburg')
  })
})
