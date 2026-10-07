import L from 'leaflet'
import { addObject, type Point } from '../../shared/schema'
import { t } from '../i18n'
import { nearestCopy, toLatLng, wrapX } from '../map/coords'
import { buildLayers } from '../render/objectRenderer'
import type { Tool, ToolContext } from './types'

type PlaceType = 'unit' | 'objective' | 'text'


/** One click places a marker; the new marker is selected so it can be labelled right away. */
export class PlaceTool implements Tool {
  readonly cursor = 'copy'
  readonly objectsInteractive = false

  constructor(readonly id: PlaceType, private readonly ctx: ToolContext) {}

  activate() {
    this.ctx.setHint(`hint.${this.id}.place` as const)
  }

  deactivate() {
    this.ctx.preview.clearLayers()
  }

  onMouseMove(e: L.LeafletMouseEvent) {
    // Ghost marker under the cursor shows exactly what will be placed.
    this.ctx.preview.clearLayers()
    const obj = { ...this.draft(this.ctx.toPoint(e.latlng)), id: 'ghost', createdAt: 0, locked: false }
    for (const l of buildLayers(obj, { renderer: this.ctx.previewRenderer, interactive: false, markerPane: 'preview', dim: true })) this.ctx.preview.addLayer(l)
  }

  onClick(e: L.LeafletMouseEvent) {
    this.ctx.checkpoint()
    const [x, y] = this.ctx.toPoint(e.latlng)
    const id = addObject(this.ctx.plan, this.draft([wrapX(x, this.ctx.data.width), y]))
    this.ctx.checkpoint()
    this.ctx.session.selectedObject = id
    this.ctx.setHint(`hint.${this.id}.placed` as const)
  }

  private draft(p: Point) {
    const s = this.ctx.session
    return {
      ...this.ctx.newObjectBase(),
      type: this.id,
      points: [p],
      variant: this.id === 'unit' ? s.unitType : this.id === 'objective' ? s.objectiveIcon : '',
      color: this.ctx.drawColor(),
      label: this.id === 'text' ? t('obj.noteDefault') : '',
    }
  }
}

/** Range circle: click the centre, move, click again to set the radius. */
export class RangeTool implements Tool {
  readonly id = 'range' as const
  readonly cursor = 'crosshair'
  readonly objectsInteractive = false
  private center: Point | null = null

  constructor(private readonly ctx: ToolContext) {}

  activate() {
    this.center = null
    this.ctx.setHint('hint.range.center')
  }

  deactivate() {
    this.center = null
    this.ctx.preview.clearLayers()
  }

  /** Pointer position on the world copy next to the chosen centre. */
  private near(e: L.LeafletMouseEvent): Point {
    const [x, y] = this.ctx.toPoint(e.latlng)
    return [this.center ? nearestCopy(x, this.center[0], this.ctx.data.width) : x, y]
  }

  onMouseMove(e: L.LeafletMouseEvent) {
    if (!this.center) return
    const p = this.near(e)
    const radius = Math.hypot(p[0] - this.center[0], p[1] - this.center[1])
    this.ctx.preview.clearLayers()
    const obj = { ...this.draft(radius), id: 'preview', createdAt: 0, locked: false }
    for (const l of buildLayers(obj, { renderer: this.ctx.previewRenderer, interactive: false, markerPane: 'preview', factor: this.ctx.distanceFactor() }))
      this.ctx.preview.addLayer(l)
    this.ctx.preview.addLayer(
      L.polyline([toLatLng(...this.center), toLatLng(...p)], { renderer: this.ctx.previewRenderer, interactive: false, color: '#fff', weight: 1.5, dashArray: '4 4' }),
    )
  }

  onClick(e: L.LeafletMouseEvent) {
    const p = this.near(e)
    if (!this.center) {
      this.center = p
      this.ctx.setHint('hint.range.radius')
      return
    }
    const radius = Math.hypot(p[0] - this.center[0], p[1] - this.center[1])
    if (radius * this.ctx.scale() < 6) return
    this.ctx.checkpoint()
    const id = addObject(this.ctx.plan, { ...this.draft(radius), points: [[wrapX(this.center[0], this.ctx.data.width), this.center[1]]] })
    this.ctx.checkpoint()
    this.ctx.session.selectedObject = id
    this.center = null
    this.ctx.preview.clearLayers()
    this.ctx.setHint('hint.range.added')
  }

  onKey(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !this.center) return false
    this.activate()
    this.ctx.preview.clearLayers()
    return true
  }

  private draft(radius: number) {
    return {
      ...this.ctx.newObjectBase(),
      type: 'range' as const,
      points: [this.center!],
      variant: '',
      color: this.ctx.drawColor(),
      label: '',
      radius: Math.round(radius),
    }
  }
}
