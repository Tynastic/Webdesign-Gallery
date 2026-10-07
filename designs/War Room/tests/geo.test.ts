import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Point } from '../shared/schema'
import { formatDuration, formatKm, kmToRadius, latitudeAt, pathKm, radiusToKm } from '../src/map/geo'
import type { MapData } from '../src/map/types'

const data: MapData = JSON.parse(readFileSync(new URL('../public/data/provinces.json', import.meta.url), 'utf8'))
const at = (name: string) => data.provinces.find((p) => p.name === name)!.label as Point

/** Great-circle distance in km between [lat, lon] pairs. */
function haversine(a: [number, number], b: [number, number]) {
  const r = Math.PI / 180
  const h = Math.sin(((b[0] - a[0]) * r) / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(((b[1] - a[1]) * r) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

describe('map distances', () => {
  it('places the equator and high latitudes plausibly', () => {
    expect((latitudeAt(4236) * 180) / Math.PI).toBeCloseTo(0, 5)
    expect((latitudeAt(at('Helsinki')[1]) * 180) / Math.PI).toBeGreaterThan(55)
  })

  // Labels sit at province centres, not exactly on the cities, and the game map is stylised:
  // estimates within ±35% of the real great-circle distance are the realistic target.
  it.each([
    ['Berlin', 'Moscow', [52.52, 13.4], [55.76, 37.62]],
    ['London', 'Berlin', [51.51, -0.13], [52.52, 13.4]],
    ['Cairo', 'Lagos', [30.04, 31.24], [6.52, 3.38]],
    ['Tokyo', 'Singapore', [35.68, 139.69], [1.35, 103.82]],
    ['Buenos Aires', 'Lima', [-34.6, -58.38], [-12.05, -77.04]],
  ] as [string, string, [number, number], [number, number]][])('%s – %s is roughly right', (a, b, ca, cb) => {
    const ratio = pathKm([at(a), at(b)]) / haversine(ca, cb)
    expect(ratio).toBeGreaterThan(0.65)
    expect(ratio).toBeLessThan(1.35)
  })

  it('applies the calibration factor and converts radii both ways', () => {
    const line: Point[] = [[1000, 3000], [1500, 3000]]
    expect(pathKm(line, 2)).toBeCloseTo(pathKm(line) * 2, 6)
    expect(kmToRadius(radiusToKm(300, 2000, 1.1), 2000, 1.1)).toBeCloseTo(300, 6)
  })

  it('formats distances and travel times', () => {
    expect(formatKm(1234.4, 'de')).toBe('1.230 km')
    expect(formatKm(7.26, 'en')).toBe('7.3 km')
    expect(formatDuration(55, 22)).toBe('2 h 30 min')
    expect(formatDuration(2000, 20)).toBe('4 d 4 h')
  })
})
