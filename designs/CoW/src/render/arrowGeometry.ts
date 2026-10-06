import type { Point } from '../../shared/schema'

/** Catmull-Rom spline through the control points, sampled into a polyline. */
export function smoothLine(points: Point[], samplesPerSpan = 12): Point[] {
  if (points.length < 3) return points.slice()
  const out: Point[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)]
    for (let s = 0; s < samplesPerSpan; s++) {
      const t = s / samplesPerSpan, t2 = t * t, t3 = t2 * t
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])])
    }
  }
  out.push(points[points.length - 1])
  return out
}

/**
 * Outline of a war-map style arrow: a body that widens from tail to head along
 * the smoothed path, ending in a broad arrowhead. All values in map units.
 */
export function arrowPolygon(points: Point[], width: number): Point[] {
  const line = dedupe(smoothLine(points))
  if (line.length < 2) return []
  const cum = [0]
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + dist(line[i - 1], line[i]))
  const total = cum[cum.length - 1]
  const headLen = Math.min(width * 2.2, total * 0.5)
  const bodyEnd = total - headLen

  // Body centreline up to the head base.
  const body: Point[] = []
  for (let i = 0; i < line.length && cum[i] < bodyEnd; i++) body.push(line[i])
  const base = pointAt(line, cum, bodyEnd)
  body.push(base)
  const tip = line[line.length - 1]

  const left: Point[] = [], right: Point[] = []
  body.forEach((p, i) => {
    const prev = body[Math.max(0, i - 1)], next = body[Math.min(body.length - 1, i + 1)]
    let [nx, ny] = normal(prev, next)
    if (i === body.length - 1) [nx, ny] = normal(base, tip) // square the joint with the head
    const along = bodyEnd > 0 ? cumAlong(body, i) / bodyEnd : 1
    const half = (width / 2) * (0.6 + 0.4 * along)
    left.push([p[0] + nx * half, p[1] + ny * half])
    right.push([p[0] - nx * half, p[1] - ny * half])
  })
  const [hx, hy] = normal(base, tip)
  const headHalf = width * 1.15
  return [...left, [base[0] + hx * headHalf, base[1] + hy * headHalf], tip, [base[0] - hx * headHalf, base[1] - hy * headHalf], ...right.reverse()]
}

const dist = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1])

function dedupe(line: Point[]): Point[] {
  return line.filter((p, i) => i === 0 || dist(p, line[i - 1]) > 1e-6)
}

function normal(a: Point, b: Point): [number, number] {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const len = Math.hypot(dx, dy) || 1
  return [-dy / len, dx / len]
}

function pointAt(line: Point[], cum: number[], d: number): Point {
  for (let i = 1; i < line.length; i++)
    if (cum[i] >= d) {
      const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1)
      return [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t]
    }
  return line[line.length - 1]
}

function cumAlong(pts: Point[], i: number): number {
  let d = 0
  for (let k = 1; k <= i; k++) d += dist(pts[k - 1], pts[k])
  return d
}

/** Midpoint along a polyline, for label placement. */
export function midpoint(line: Point[]): Point {
  const cum = [0]
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + dist(line[i - 1], line[i]))
  return pointAt(line, cum, cum[cum.length - 1] / 2)
}
