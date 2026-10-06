import type L from 'leaflet'
import { addObject, type PlanObject, type Point } from '../../shared/schema'
import { canonicalPoints, nearestCopy } from '../map/coords'
import { buildLayers } from '../render/objectRenderer'
import type { Tool, ToolContext } from './types'

type PathType = 'arrow' | 'front' | 'zone'

const MIN_POINTS: Record<PathType, number> = { arrow: 2, front: 2, zone: 3 }

/**
 * Click-to-place drawing for arrows, fronts and zones. Shows a live, exact
 * preview of the final shape; double-click or Enter finishes, Backspace removes
 * the last point, Esc cancels. Dragging still pans the map.
 */
export class PathTool implements Tool {
  readonly cursor = 'crosshair'
  readonly objectsInteractive = false
  private points: Point[] = []
  private cursorPt: Point | null = null

  constructor(readonly id: PathType, private readonly ctx: ToolContext) {}

  activate() {
    this.ctx.map.doubleClickZoom.disable()
    this.reset()
  }

  deactivate() {
    this.ctx.map.doubleClickZoom.enable()
    this.points = []
    this.ctx.preview.clearLayers()
  }

  /** A point on the world copy next to the previous point (shapes may cross the date line). */
  private near(p: Point): Point {
    const last = this.points[this.points.length - 1]
    return last ? [nearestCopy(p[0], last[0], this.ctx.data.width), p[1]] : p
  }

  /** After the view jumped to another world copy, move the draft along with it. */
  refresh() {
    if (!this.points.length) return
    const x0 = this.points[0][0]
    const dx = nearestCopy(x0, this.ctx.map.getCenter().lng, this.ctx.data.width) - x0
    if (!dx) return
    this.points = this.points.map(([x, y]) => [x + dx, y] as Point)
    this.renderPreview()
  }

  onClick(e: L.LeafletMouseEvent) {
    const p = this.near(this.ctx.toPoint(e.latlng))
    const last = this.points[this.points.length - 1]
    // Ignore the second click of a double-click landing on the same spot.
    if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) * this.ctx.scale() < 4) return
    this.points.push(p)
    this.update()
  }

  onDblClick() {
    this.finish()
  }

  onMouseMove(e: L.LeafletMouseEvent) {
    this.cursorPt = this.near(this.ctx.toPoint(e.latlng))
    if (this.points.length) this.renderPreview()
  }

  onKey(e: KeyboardEvent): boolean {
    if (!this.points.length) return false
    if (e.key === 'Enter') this.finish()
    else if (e.key === 'Escape') this.reset()
    else if (e.key === 'Backspace') {
      this.points.pop()
      this.update()
    } else return false
    return true
  }

  private finish() {
    const need = MIN_POINTS[this.id]
    if (this.points.length < need) {
      this.ctx.setHint(`hint.${this.id}.tooFew` as const)
      return
    }
    this.ctx.checkpoint()
    // Stored with the first point inside the world; shapes across the date line keep continuous x.
    const id = addObject(this.ctx.plan, this.draft(canonicalPoints(this.points, this.ctx.data.width)))
    this.ctx.checkpoint()
    this.ctx.session.selectedObject = id
    this.reset()
    this.ctx.setHint(`hint.${this.id}.added` as const)
  }

  private reset() {
    this.points = []
    this.ctx.preview.clearLayers()
    this.ctx.setHint(`hint.${this.id}.start` as const)
  }

  private update() {
    const n = this.points.length
    const need = MIN_POINTS[this.id]
    if (n === 0) return this.reset()
    if (n < need) this.ctx.setHint('hint.path.more', { n: n + 1 })
    else this.ctx.setHint('hint.path.finish', { n })
    this.renderPreview()
  }

  private draft(points: Point[]): Omit<PlanObject, 'id' | 'createdAt' | 'locked'> {
    const s = this.ctx.session
    return {
      ...this.ctx.newObjectBase(),
      type: this.id,
      points,
      variant: this.id === 'arrow' ? s.arrowVariant : this.id === 'front' ? s.frontVariant : s.zoneVariant,
      color: this.ctx.drawColor(),
      label: '',
      // Arrows are sized in map units so they scale with the map; start at ~16px on screen.
      width: this.id === 'arrow' ? Math.round(16 / this.ctx.scale()) : undefined,
    }
  }

  private renderPreview() {
    const pts = this.cursorPt ? [...this.points, this.cursorPt] : this.points
    this.ctx.preview.clearLayers()
    if (pts.length < 2) return
    const obj = { ...this.draft(pts), id: 'preview', createdAt: 0, locked: false }
    for (const l of buildLayers(obj, { renderer: this.ctx.previewRenderer, interactive: false, markerPane: 'preview' })) this.ctx.preview.addLayer(l)
  }
}

