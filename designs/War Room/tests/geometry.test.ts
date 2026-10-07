import { describe, expect, it } from 'vitest'
import type { Point } from '../shared/schema'
import { arrowPolygon, midpoint, smoothLine } from '../src/render/arrowGeometry'
import { chainSegments } from '../scripts/build-map-data'

describe('smoothLine', () => {
  it('passes through every control point', () => {
    const pts: Point[] = [[0, 0], [100, 50], [200, 0], [300, 80]]
    const line = smoothLine(pts)
    for (const p of pts) expect(line.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-9)).toBe(true)
  })

  it('leaves two-point lines straight', () => {
    expect(smoothLine([[0, 0], [10, 0]])).toEqual([[0, 0], [10, 0]])
  })
})

describe('arrowPolygon', () => {
  const poly = arrowPolygon([[0, 0], [200, 0]], 20)

  it('ends in a tip at the last control point', () => {
    expect(poly).toContainEqual([200, 0])
  })

  it('has a head wider than the body', () => {
    const ys = poly.map((p) => Math.abs(p[1]))
    expect(Math.max(...ys)).toBeCloseTo(23, 5) // head half-width = 1.15 * width
    expect(Math.abs(poly[0][1])).toBeCloseTo(6, 5) // tail half-width = 0.6 * width / 2
  })

  it('degrades gracefully for degenerate input', () => {
    expect(arrowPolygon([[5, 5], [5, 5]], 10)).toEqual([])
  })
})

describe('midpoint', () => {
  it('finds the middle of a polyline by length', () => {
    expect(midpoint([[0, 0], [10, 0], [10, 10]])).toEqual([10, 0])
  })
})

describe('chainSegments', () => {
  it('joins touching segments into one polyline', () => {
    const lines = chainSegments([
      [1, 0, 2, 0],
      [0, 0, 1, 0],
      [2, 0, 3, 0],
    ])
    expect(lines).toHaveLength(1)
    expect(lines[0]).toEqual([0, 0, 1, 0, 2, 0, 3, 0])
  })

  it('keeps disjoint segments apart', () => {
    expect(chainSegments([[0, 0, 1, 0], [5, 5, 6, 6]])).toHaveLength(2)
  })
})
