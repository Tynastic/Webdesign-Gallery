/**
 * Horizontal wrap-around: the map is a cylinder (Alaska ↔ Chukotka). Pure helpers,
 * no Leaflet, so they run anywhere (tests, server).
 */
import type { Point } from '../../shared/schema'

/** x folded into the canonical world [0, width). */
export const wrapX = (x: number, width: number) => ((x % width) + width) % width

/** The copy of x (x + k·width) closest to a reference x, e.g. the current view centre. */
export const nearestCopy = (x: number, ref: number, width: number) => x + Math.round((ref - x) / width) * width

/**
 * Shift a shape by whole world widths so its first point lies in [0, width).
 * Shapes crossing the seam keep continuous coordinates (e.g. x = 13500 → 13700).
 */
export function canonicalPoints(points: Point[], width: number): Point[] {
  if (!points.length) return points
  const shift = Math.floor(points[0][0] / width) * width
  return shift ? points.map(([x, y]) => [x - shift, y] as Point) : points
}

/** World copies k (offset k·width) that intersect the x-range [x0, x1]. */
export function copiesIn(x0: number, x1: number, width: number): number[] {
  const out: number[] = []
  for (let k = Math.floor(x0 / width); k <= Math.floor(x1 / width); k++) out.push(k)
  return out
}
