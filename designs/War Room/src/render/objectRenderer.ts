import L from 'leaflet'
import { distanceFactor, phaseVisibility, type ObjectiveIcon, type Plan, type PlanObject, type Point, type UnitType } from '../../shared/schema'
import { mix } from '../map/baseLayer'
import { toLatLng } from '../map/coords'
import type { SessionState } from '../state/session'
import { arrowPolygon, midpoint, smoothLine } from './arrowGeometry'
import { locale, t } from '../i18n'
import { formatKm, radiusToKm } from '../map/geo'
import { escapeHtml, objectiveSvg, unitSvg } from './icons'

export interface BuildOptions {
  renderer: L.Renderer
  dim?: boolean
  selected?: boolean
  interactive?: boolean
  markerPane?: string
  /** Plan calibration factor, for range labels in km. */
  factor?: number
}

const ll = (pts: Point[]) => pts.map((p) => toLatLng(p[0], p[1]))
const darker = (c: string) => mix(c, '#000000', 0.45)

/** Leaflet layers for one plan object. Shared by the renderer and the drawing previews. */
export function buildLayers(o: PlanObject, opt: BuildOptions): L.Layer[] {
  const { renderer, dim = false, selected = false, interactive = true, markerPane = 'planMarkers', factor = 1 } = opt
  const fade = dim ? 0.35 : 1
  const out: L.Layer[] = []
  const halo = (latlngs: L.LatLngExpression[], closed: boolean) => {
    if (!selected) return
    const style = { renderer, interactive: false, color: '#ffcf3f', weight: 9, opacity: 0.55, fill: false, lineJoin: 'round' as const }
    out.push(closed ? L.polygon(latlngs, style) : L.polyline(latlngs, style))
  }
  const label = (at: Point, text: string, cls = '') => {
    if (!text) return
    out.push(
      L.marker(toLatLng(at[0], at[1]), {
        pane: markerPane,
        interactive: false,
        keyboard: false,
        icon: L.divIcon({ className: `plan-label ${cls}`, html: `<span style="opacity:${fade}">${escapeHtml(text)}</span>`, iconSize: undefined }),
      }),
    )
  }

  switch (o.type) {
    case 'arrow': {
      const poly = arrowPolygon(o.points, o.width ?? 40)
      if (poly.length < 3) break
      const latlngs = ll(poly)
      halo(latlngs, true)
      const move = o.variant === 'move'
      out.push(
        L.polygon(latlngs, {
          renderer, interactive,
          fillColor: o.color, fillOpacity: (move ? 0.4 : 0.85) * fade,
          color: darker(o.color), weight: 1.6, opacity: 0.9 * fade,
          dashArray: move ? '7 5' : undefined, lineJoin: 'round',
        }),
      )
      label(midpoint(smoothLine(o.points)), o.label)
      break
    }
    case 'front': {
      const line = ll(smoothLine(o.points))
      halo(line, false)
      if (o.variant === 'defense') {
        out.push(L.polyline(line, { renderer, interactive, color: darker(o.color), weight: 9, opacity: fade, lineCap: 'round', lineJoin: 'round' }))
        out.push(L.polyline(line, { renderer, interactive: false, color: o.color, weight: 5, opacity: fade, lineCap: 'round', lineJoin: 'round' }))
        out.push(L.polyline(line, { renderer, interactive: false, color: '#fff8e6', weight: 1.5, opacity: 0.9 * fade, dashArray: '6 6' }))
      } else {
        // Barbed front line: solid core plus perpendicular ticks made from a wide dashed stroke.
        out.push(L.polyline(line, { renderer, interactive, color: o.color, weight: 15, opacity: 0.9 * fade, dashArray: '2.5 9', lineCap: 'butt' }))
        out.push(L.polyline(line, { renderer, interactive: false, color: darker(o.color), weight: 6, opacity: fade, lineCap: 'round', lineJoin: 'round' }))
        out.push(L.polyline(line, { renderer, interactive: false, color: o.color, weight: 3.5, opacity: fade, lineCap: 'round', lineJoin: 'round' }))
      }
      label(midpoint(smoothLine(o.points)), o.label)
      break
    }
    case 'zone': {
      const latlngs = ll(o.points)
      halo(latlngs, true)
      const dash = o.variant === 'danger' ? '3 6' : o.variant === 'hold' ? undefined : '10 7'
      out.push(
        L.polygon(latlngs, {
          renderer, interactive,
          fillColor: o.color, fillOpacity: (o.variant === 'danger' ? 0.26 : 0.16) * fade,
          color: o.color, weight: o.variant === 'danger' ? 3 : 2.5, opacity: fade, dashArray: dash, lineJoin: 'round',
        }),
      )
      label(centroid(o.points), o.label, 'zone-label')
      break
    }
    case 'range': {
      const c = o.points[0]
      const radius = o.radius ?? 100
      if (selected) out.push(L.circle(toLatLng(c[0], c[1]), { renderer, radius, interactive: false, color: '#ffcf3f', weight: 9, opacity: 0.55, fill: false }))
      out.push(
        L.circle(toLatLng(c[0], c[1]), {
          renderer, radius, interactive,
          color: o.color, weight: 2.5, opacity: fade, dashArray: '8 6', fillColor: o.color, fillOpacity: 0.07 * fade,
        }),
      )
      out.push(L.circleMarker(toLatLng(c[0], c[1]), { renderer, radius: 3.5, interactive: false, color: darker(o.color), weight: 1.5, fillColor: o.color, fillOpacity: fade, opacity: fade }))
      const km = formatKm(radiusToKm(radius, c[1], factor), locale.value)
      label([c[0], c[1] - radius], o.label ? `${o.label} · ${km}` : t('range.label', { km }), 'range-label')
      break
    }
    case 'unit':
    case 'objective':
    case 'text': {
      const p = o.points[0]
      out.push(
        L.marker(toLatLng(p[0], p[1]), {
          pane: markerPane,
          interactive,
          keyboard: false,
          bubblingMouseEvents: true,
          icon: L.divIcon({ className: `plan-marker plan-${o.type}${selected ? ' is-selected' : ''}`, html: markerHtml(o, fade), iconSize: undefined }),
        }),
      )
      break
    }
  }
  return out
}

function markerHtml(o: PlanObject, fade: number): string {
  const text = o.label ? `<span class="pm-label">${escapeHtml(o.label)}</span>` : ''
  const style = `style="opacity:${fade}"`
  if (o.type === 'unit') {
    const count = o.count ? `<span class="pm-count">${o.count}</span>` : ''
    return `<div class="pm" ${style}><div class="pm-symbol">${unitSvg(o.variant as UnitType, o.color)}${count}</div>${text}</div>`
  }
  if (o.type === 'objective') return `<div class="pm" ${style}>${objectiveSvg(o.variant as ObjectiveIcon, o.color)}${text}</div>`
  return `<div class="pm pm-text" ${style}><span style="color:${o.color}">${escapeHtml(o.label || t('field.text'))}</span></div>`
}

function centroid(points: Point[]): Point {
  const n = points.length || 1
  return [points.reduce((s, p) => s + p[0], 0) / n, points.reduce((s, p) => s + p[1], 0) / n]
}

export interface ObjectHandlers {
  /** Pointer pressed on an object (used for select + drag). */
  down: (id: string, e: L.LeafletMouseEvent) => void
}

/** The same object moved by dx map units (used for world copies). */
export const shiftObject = (o: PlanObject, dx: number): PlanObject =>
  dx ? { ...o, points: o.points.map(([x, y]) => [x + dx, y] as Point) } : o


/**
 * Keeps one Leaflet layer group per plan object in sync with the Yjs map,
 * rebuilding only objects whose content or display state changed. Every object
 * is drawn on the neighbouring world copies too, because the map wraps around.
 */
export class ObjectRenderer {
  readonly group = L.layerGroup()
  private readonly rendered = new Map<string, { key: string; layers: L.Layer[] }>()
  /** World copies (offset k · worldWidth) currently drawn. */
  private copies: number[] = [0]

  constructor(
    private readonly plan: Plan,
    private readonly session: SessionState,
    private readonly renderer: L.Renderer,
    private readonly handlers: ObjectHandlers,
    private readonly worldWidth: number,
  ) {
    plan.objects.observe(() => this.sync())
    plan.phases.observe(() => this.sync())
  }

  /** Draw objects on these world copies (the ones near the view); rebuilds only when the set changes. */
  setCopies(copies: number[]) {
    if (copies.join() === this.copies.join()) return
    this.copies = copies
    this.sync()
  }

  sync() {
    const phases = this.plan.phases.toArray().map((p) => p.id)
    const factor = distanceFactor(this.plan)
    const seen = new Set<string>()
    for (const o of this.plan.objects.values()) {
      const vis = phaseVisibility(o.phaseId, this.session.activePhase, phases)
      if (vis === 'hidden' || this.session.hiddenLayers.includes(o.layerId)) continue
      seen.add(o.id)
      const selected = this.session.selectedObject === o.id
      const key = `${JSON.stringify(o)}|${vis}|${selected}|${this.copies.join()}|${factor}|${locale.value}`
      const cur = this.rendered.get(o.id)
      if (cur?.key === key) continue
      cur?.layers.forEach((l) => this.group.removeLayer(l))
      const layers = this.copies.flatMap((k) => buildLayers(shiftObject(o, k * this.worldWidth), { renderer: this.renderer, dim: vis === 'dim', selected, factor }))
      for (const l of layers) {
        l.on('mousedown', (e) => this.handlers.down(o.id, e as L.LeafletMouseEvent))
        this.group.addLayer(l)
      }
      this.rendered.set(o.id, { key, layers })
    }
    for (const [id, r] of this.rendered)
      if (!seen.has(id)) {
        r.layers.forEach((l) => this.group.removeLayer(l))
        this.rendered.delete(id)
      }
  }
}
