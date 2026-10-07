import L from 'leaflet'
import type { Point } from '../../shared/schema'
import { locale } from '../i18n'
import { toLatLng } from '../map/coords'
import { formatDuration, formatKm, pathKm } from '../map/geo'
import { nearestCopy } from '../map/wrap'
import type { Tool, ToolContext } from './types'

/**
 * Ruler: click points, double-click/Enter to finish. Shows the approximate
 * distance (calibrated per plan) and, with a speed set, the travel time. The
 * measurement is personal and temporary; it is never stored in the plan.
 */
export class MeasureTool implements Tool {
  readonly id = 'measure' as const
  readonly cursor = 'crosshair'
  readonly objectsInteractive = false
  private points: Point[] = []
  private cursorPt: Point | null = null
  private done = false

  constructor(private readonly ctx: ToolContext) {}

  activate() {
    this.ctx.map.doubleClickZoom.disable()
    this.ctx.setHint('hint.measure.start')
  }

  deactivate() {
    this.ctx.map.doubleClickZoom.enable()
    this.clear()
  }

  onClick(e: L.LeafletMouseEvent) {
    if (this.done) this.clear()
    const p = this.near(this.ctx.toPoint(e.latlng))
    const last = this.points[this.points.length - 1]
    if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) * this.ctx.scale() < 4) return
    this.points.push(p)
    this.ctx.setHint('hint.measure.more')
    this.render()
  }

  onDblClick() {
    this.finish()
  }

  onMouseMove(e: L.LeafletMouseEvent) {
    if (!this.points.length || this.done) return
    this.cursorPt = this.near(this.ctx.toPoint(e.latlng))
    this.render()
  }

  onKey(e: KeyboardEvent): boolean {
    if (!this.points.length) return false
    if (e.key === 'Enter') this.finish()
    else if (e.key === 'Escape') this.clear()
    else if (e.key === 'Backspace' && !this.done) {
      this.points.pop()
      this.render()
    } else return false
    return true
  }

  /** View moved to another world copy, calibration or language changed: redraw. */
  refresh() {
    if (!this.points.length) return
    const x0 = this.points[0][0]
    const dx = nearestCopy(x0, this.ctx.map.getCenter().lng, this.ctx.data.width) - x0
    if (dx) this.points = this.points.map(([x, y]) => [x + dx, y] as Point)
    this.render()
  }

  private finish() {
    if (this.points.length < 2) return
    this.done = true
    this.cursorPt = null
    this.ctx.session.measuredKm = pathKm(this.points) // uncalibrated, for calibration
    this.ctx.setHint('hint.measure.done', { km: this.label(this.points) })
    this.render()
  }

  private clear() {
    this.points = []
    this.cursorPt = null
    this.done = false
    this.ctx.session.measuredKm = null
    this.ctx.preview.clearLayers()
    this.ctx.setHint('hint.measure.start')
  }

  private near(p: Point): Point {
    const last = this.points[this.points.length - 1]
    return last ? [nearestCopy(p[0], last[0], this.ctx.data.width), p[1]] : p
  }

  private label(points: Point[]): string {
    const km = pathKm(points, this.ctx.distanceFactor())
    const speed = this.ctx.session.measureSpeed
    return `≈ ${formatKm(km, locale.value)}${speed ? ` · ${formatDuration(km, speed)}` : ''}`
  }

  private render() {
    const pts = this.cursorPt && !this.done ? [...this.points, this.cursorPt] : this.points
    const { preview, previewRenderer: renderer } = this.ctx
    preview.clearLayers()
    if (!pts.length) return
    const latlngs = pts.map(([x, y]) => toLatLng(x, y))
    preview.addLayer(L.polyline(latlngs, { renderer, interactive: false, color: '#111', weight: 5, opacity: 0.55 }))
    preview.addLayer(L.polyline(latlngs, { renderer, interactive: false, color: '#fff', weight: 2.5, dashArray: '8 6' }))
    for (const ll of latlngs.slice(0, this.points.length))
      preview.addLayer(L.circleMarker(ll, { renderer, interactive: false, radius: 4, color: '#111', weight: 1.5, fillColor: '#fff', fillOpacity: 1 }))
    if (pts.length > 1)
      preview.addLayer(
        L.marker(latlngs[latlngs.length - 1], {
          pane: 'preview',
          interactive: false,
          keyboard: false,
          icon: L.divIcon({ className: 'measure-label', iconSize: undefined, html: `<span>${this.label(pts)}</span>` }),
        }),
      )
  }
}
