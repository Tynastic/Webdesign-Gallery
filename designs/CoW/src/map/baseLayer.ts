import { CanvasLayer, flatPath, useMapSpace, type View } from './canvasLayer'
import { copiesIn } from './coords'
import type { ProvinceIndex } from './provinceIndex'
import type { MapData } from './types'
import type { FillMode } from '../state/session'

const OCEAN_DEEP = '#7fa6bb'
const OCEAN = '#9dbfd0'
const SHALLOWS = '#bcd6e1'
const PAPER = '#e9e1cc'
/** Grid spacing that divides the world width evenly, so the grid is seamless where the map wraps. */
const GRID_COLUMNS = 14
const GRID_ROW = 1000

/**
 * The base map, styled like a printed war map: graded ocean with a faint grid,
 * a soft shallow-water halo along coasts, land filled by each province's
 * *current* owner, and three tiers of borders (province < nation < coastline).
 * Nation borders are rebuilt whenever provinces change hands.
 */
export class BaseMapLayer extends CanvasLayer {
  private readonly coast: Path2D
  private nationBorders = new Path2D()
  private provinceBorders = new Path2D()
  private owners: Int16Array
  private readonly fills: { vivid: string[]; muted: string[] }
  private fillMode: FillMode = 'muted'
  private borders = true

  constructor(private readonly data: MapData, private readonly index: ProvinceIndex) {
    super('base')
    const join = (lines: number[][]) => lines.reduce((path, l) => flatPath(l, false, path), new Path2D())
    this.coast = join(data.edges.coast)
    this.owners = Int16Array.from(data.provinces, (p) => p.nation)
    this.rebuildBorders()
    this.fills = {
      vivid: data.colors,
      // Muted: pull nation colours toward paper so player markings stand out (figure/ground).
      muted: data.colors.map((c) => mix(c, PAPER, 0.55)),
    }
  }

  /** Current owner (nation index) per province. */
  setOwners(owners: Int16Array) {
    this.owners = owners
    this.rebuildBorders()
    this.redraw()
  }

  private rebuildBorders() {
    const nation = new Path2D(), province = new Path2D()
    for (const e of this.data.edges.shared) flatPath(e.line, false, this.owners[e.a] === this.owners[e.b] ? province : nation)
    this.nationBorders = nation
    this.provinceBorders = province
  }

  setStyle(fillMode: FillMode, borders: boolean) {
    this.fillMode = fillMode
    this.borders = borders
    this.redraw()
  }

  protected render(ctx: CanvasRenderingContext2D, view: View) {
    const { scale } = view
    const px = (n: number) => n / scale // screen px -> map units
    const { width, height } = this.data
    // The map wraps horizontally: every visible world copy is drawn, pass by pass, so the
    // coastal halo of one copy never paints over the land of its neighbour at the seam.
    const copies = copiesIn(view.x0, view.x1, width)
    const each = (fn: (shift: number) => void) => copies.forEach((k) => (useMapSpace(ctx, view, k * width), fn(k * width)))
    useMapSpace(ctx, view)

    // Ocean: vertical grade (no horizontal variation, so copies join seamlessly) plus a faint grid.
    const g = ctx.createLinearGradient(0, 0, 0, height)
    g.addColorStop(0, OCEAN_DEEP)
    g.addColorStop(0.45, OCEAN)
    g.addColorStop(1, OCEAN_DEEP)
    ctx.fillStyle = g
    ctx.fillRect(view.x0, 0, view.x1 - view.x0, height)
    ctx.beginPath()
    const col = width / GRID_COLUMNS
    for (let x = Math.ceil(view.x0 / col) * col; x < view.x1; x += col) ctx.rect(x, 0, 0, height)
    for (let y = GRID_ROW; y < height; y += GRID_ROW) ctx.rect(view.x0, y, view.x1 - view.x0, 0)
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'
    ctx.lineWidth = px(1)
    ctx.stroke()

    // Shallow-water halo: two wide, soft strokes along every coastline.
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = SHALLOWS
    each(() => {
      ctx.globalAlpha = 0.45
      ctx.lineWidth = px(Math.min(16, 5 + scale * 10))
      ctx.stroke(this.coast)
      ctx.globalAlpha = 0.7
      ctx.lineWidth = px(Math.min(7, 2.5 + scale * 4))
      ctx.stroke(this.coast)
    })
    ctx.globalAlpha = 1

    // Land.
    const colors = this.fillMode === 'off' ? null : this.fills[this.fillMode]
    each((shift) => {
      for (let id = 0; id < this.data.provinces.length; id++) {
        if (!this.index.visible(id, view.x0 - shift, view.y0, view.x1 - shift, view.y1)) continue
        ctx.fillStyle = colors ? colors[this.owners[id]] : PAPER
        ctx.fill(this.index.paths[id])
      }
    })
    each(() => this.drawBorders(ctx, scale))
  }

  /** Borders, thinnest first. Province borders fade out when zoomed far out. */
  private drawBorders(ctx: CanvasRenderingContext2D, scale: number) {
    const px = (n: number) => n / scale
    if (this.borders && scale > 0.08) {
      ctx.strokeStyle = `rgba(52,44,30,${Math.min(0.45, (scale - 0.08) * 1.6)})`
      ctx.lineWidth = px(0.8)
      ctx.stroke(this.provinceBorders)
    }
    ctx.strokeStyle = 'rgba(255,250,235,0.35)'
    ctx.lineWidth = px(3.2)
    ctx.stroke(this.nationBorders)
    ctx.strokeStyle = 'rgba(38,30,20,0.85)'
    ctx.lineWidth = px(1.4)
    ctx.setLineDash([px(6), px(2.5)])
    ctx.stroke(this.nationBorders)
    ctx.setLineDash([])
    ctx.strokeStyle = 'rgba(40,58,66,0.75)'
    ctx.lineWidth = px(1)
    ctx.stroke(this.coast)
  }
}

/** Mix two colours ("rgb(...)" or "#rrggbb"), t = share of b. */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = parseColor(a)
  const [r2, g2, b2] = parseColor(b)
  const m = (x: number, y: number) => Math.round(x + (y - x) * t)
  return `rgb(${m(r1, r2)},${m(g1, g2)},${m(b1, b2)})`
}

export function parseColor(c: string): [number, number, number] {
  if (c.startsWith('#')) {
    const n = parseInt(c.slice(1), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const [r, g, b] = c.match(/\d+/g)!.map(Number)
  return [r, g, b]
}
