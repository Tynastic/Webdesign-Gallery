import { flatPath } from './canvasLayer'
import type { MapData } from './types'

const CELL = 256

/**
 * Province geometry shared by every canvas layer: cached Path2D shapes, bounding
 * boxes, and a uniform grid for fast point → province hit-testing.
 */
export class ProvinceIndex {
  readonly paths: Path2D[]
  readonly bboxes: Float32Array // x0, y0, x1, y1 per province
  private readonly grid = new Map<number, number[]>()
  private readonly cols: number

  constructor(private readonly data: MapData) {
    this.cols = Math.ceil(data.width / CELL)
    this.paths = data.provinces.map((p) => flatPath(p.ring, true))
    this.bboxes = new Float32Array(data.provinces.length * 4)
    data.provinces.forEach((p, id) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      for (let i = 0; i < p.ring.length; i += 2) {
        x0 = Math.min(x0, p.ring[i]); x1 = Math.max(x1, p.ring[i])
        y0 = Math.min(y0, p.ring[i + 1]); y1 = Math.max(y1, p.ring[i + 1])
      }
      this.bboxes.set([x0, y0, x1, y1], id * 4)
      for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
        for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++) {
          const key = cy * this.cols + cx
          const list = this.grid.get(key)
          if (list) list.push(id)
          else this.grid.set(key, [id])
        }
    })
  }

  /** Province under an SVG-space point (any world copy), or null over sea. */
  hit(x: number, y: number): number | null {
    x = ((x % this.data.width) + this.data.width) % this.data.width
    for (const id of this.grid.get(Math.floor(y / CELL) * this.cols + Math.floor(x / CELL)) ?? []) {
      const b = id * 4
      if (x < this.bboxes[b] || x > this.bboxes[b + 2] || y < this.bboxes[b + 1] || y > this.bboxes[b + 3]) continue
      if (pointInRing(x, y, this.data.provinces[id].ring)) return id
    }
    return null
  }

  /** Whether a province's bbox intersects the given SVG-space rectangle. */
  visible(id: number, x0: number, y0: number, x1: number, y1: number): boolean {
    const b = id * 4
    return this.bboxes[b + 2] >= x0 && this.bboxes[b] <= x1 && this.bboxes[b + 3] >= y0 && this.bboxes[b + 1] <= y1
  }

  centerOf(id: number): [number, number] {
    const b = id * 4
    return [(this.bboxes[b] + this.bboxes[b + 2]) / 2, (this.bboxes[b + 1] + this.bboxes[b + 3]) / 2]
  }
}

export function pointInRing(x: number, y: number, r: number[]): boolean {
  let inside = false
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
