import L from 'leaflet'
import { updateObject, type PlanObject, type Point } from '../../shared/schema'
import { t } from '../i18n'
import { canonicalPoints, nearestCopy, toLatLng } from '../map/coords'
import type { Tool, ToolContext } from './types'

const PATH_TYPES = new Set(['arrow', 'front', 'zone'])
const MIN_POINTS: Record<string, number> = { arrow: 2, front: 2, zone: 3 }

/**
 * Select, move and reshape plan objects; select provinces by clicking land.
 * Selected paths get vertex handles (drag to move, double-click to remove) and
 * midpoint handles (drag to insert a vertex); range circles get a radius handle.
 */
export class SelectTool implements Tool {
  readonly id = 'select' as const
  readonly cursor = ''
  readonly objectsInteractive = true
  /** World-copy offset of the selected object's handles. */
  private shift = 0

  constructor(private readonly ctx: ToolContext) {}

  activate() {
    this.ctx.setHint('hint.select')
    this.refresh()
  }

  deactivate() {
    this.ctx.preview.clearLayers()
  }

  onClick(e: L.LeafletMouseEvent) {
    const [x, y] = this.ctx.toPoint(e.latlng)
    this.ctx.session.selectedObject = null
    this.ctx.session.selectedProvince = this.ctx.index.hit(x, y)
  }

  onObjectDown(id: string, e: L.LeafletMouseEvent) {
    const s = this.ctx.session
    s.selectedObject = id
    s.selectedProvince = null
    const obj = this.ctx.plan.objects.get(id)
    if (!obj || obj.locked || (e.originalEvent as MouseEvent).button !== 0) return
    const start = this.ctx.toPoint(e.latlng)
    const origin = obj.points
    this.ctx.trackDrag(
      (ev) => {
        const p = this.ctx.toPoint(ev.latlng)
        const dx = p[0] - start[0], dy = p[1] - start[1]
        updateObject(this.ctx.plan, id, { points: origin.map(([x, y]) => [Math.round(x + dx), Math.round(y + dy)] as Point) })
      },
      () => {
        // Dragged across the date line: store it back inside the world.
        const cur = this.ctx.plan.objects.get(id)
        if (!cur) return
        const points = canonicalPoints(cur.points, this.ctx.data.width)
        if (points !== cur.points) updateObject(this.ctx.plan, id, { points })
      },
    )
  }

  /** Rebuild handles for the current selection. */
  refresh() {
    this.ctx.preview.clearLayers()
    const id = this.ctx.session.selectedObject
    const obj = id ? this.ctx.plan.objects.get(id) : undefined
    if (!obj || obj.locked) return
    // Handles go on the world copy of the object nearest to the current view.
    this.shift = nearestCopy(obj.points[0][0], this.ctx.map.getCenter().lng, this.ctx.data.width) - obj.points[0][0]
    if (PATH_TYPES.has(obj.type)) this.pathHandles(obj)
    else if (obj.type === 'range') this.radiusHandle(obj)
  }

  private pathHandles(obj: PlanObject) {
    const pts = obj.points
    pts.forEach((p, i) => {
      const h = this.handle(p, 'vertex', t('handle.vertex'))
      h.on('mousedown', (e) => this.dragVertex(obj.id, i, false, e as L.LeafletMouseEvent))
      h.on('dblclick', (e) => {
        L.DomEvent.stop(e)
        const cur = this.ctx.plan.objects.get(obj.id)
        if (!cur || cur.points.length <= MIN_POINTS[cur.type]) return this.ctx.setHint('hint.minPoints', { n: MIN_POINTS[cur?.type ?? 'arrow'] })
        updateObject(this.ctx.plan, obj.id, { points: cur.points.filter((_, k) => k !== i) })
      })
    })
    const segments = obj.type === 'zone' ? pts.length : pts.length - 1
    for (let i = 0; i < segments; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length]
      const h = this.handle([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], 'midpoint', t('handle.midpoint'))
      h.on('mousedown', (e) => this.dragVertex(obj.id, i + 1, true, e as L.LeafletMouseEvent))
    }
  }

  private radiusHandle(obj: PlanObject) {
    const c = obj.points[0]
    const h = this.handle([c[0] + (obj.radius ?? 0), c[1]], 'vertex', t('handle.resize'))
    h.on('mousedown', (e) => {
      L.DomEvent.stop(e as L.LeafletMouseEvent)
      this.ctx.trackDrag(
        (ev) => {
          const p = this.ctx.toPoint(ev.latlng)
          updateObject(this.ctx.plan, obj.id, { radius: Math.max(1, Math.round(Math.hypot(p[0] - this.shift - c[0], p[1] - c[1]))) })
        },
        () => {},
      )
    })
  }

  private dragVertex(id: string, index: number, insert: boolean, e: L.LeafletMouseEvent) {
    L.DomEvent.stop(e)
    let inserted = !insert
    this.ctx.trackDrag(
      (ev) => {
        const cur = this.ctx.plan.objects.get(id)
        if (!cur) return
        const raw = this.ctx.toPoint(ev.latlng)
        const p: Point = [Math.round(raw[0] - this.shift), Math.round(raw[1])]
        const points = cur.points.slice()
        if (!inserted) {
          points.splice(index, 0, p)
          inserted = true
        } else points[index] = p
        updateObject(this.ctx.plan, id, { points })
      },
      () => {},
    )
  }

  private handle(p: Point, kind: 'vertex' | 'midpoint', title: string) {
    const m = L.marker(toLatLng(p[0] + this.shift, p[1]), {
      pane: 'handles',
      keyboard: false,
      title,
      icon: L.divIcon({ className: `edit-handle ${kind}`, iconSize: kind === 'vertex' ? [12, 12] : [10, 10] }),
    })
    this.ctx.preview.addLayer(m)
    return m
  }
}
