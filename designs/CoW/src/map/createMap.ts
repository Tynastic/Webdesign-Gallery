import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type * as Y from 'yjs'
import { displayName, distanceFactor, phaseVisibility, type Plan } from '../../shared/schema'
import { ObjectRenderer } from '../render/objectRenderer'
import { t } from '../i18n'
import { escapeHtml } from '../render/icons'
import type { SessionState, ToolId } from '../state/session'
import type { Presence } from '../sync/presence'
import { MeasureTool } from '../tools/measureTool'
import { PaintTool, PingTool } from '../tools/paintTool'
import { PathTool } from '../tools/pathTool'
import { PlaceTool, RangeTool } from '../tools/placeTool'
import { SelectTool } from '../tools/selectTool'
import type { Tool, ToolContext } from '../tools/types'
import { BaseMapLayer } from './baseLayer'
import { copiesIn, nearestCopy, toPoint, wrapX } from './coords'
import { LabelLayer } from './labelLayer'
import { MarkLayer, type ProvinceMark } from './markLayer'
import type { NationCatalog } from './nations'
import { PresenceLayer } from './presenceLayer'
import { ProvinceIndex } from './provinceIndex'
import type { MapData } from './types'

/** Pane stacking, bottom to top. */
const PANES: [string, number][] = [
  ['base', 200],
  ['marks', 250],
  ['labels', 350],
  ['plan', 400],
  ['planMarkers', 450],
  ['preview', 500],
  ['cursors', 620],
  ['handles', 640],
]

const DRAW_TOOLS = new Set<ToolId>(['arrow', 'front', 'zone', 'range'])

/**
 * Imperative facade over Leaflet. Vue never touches Leaflet objects; it mutates
 * the reactive session / Yjs plan and calls the sync methods below.
 */
export class PlannerMap {
  readonly map: L.Map
  readonly index: ProvinceIndex
  private readonly base: BaseMapLayer
  private readonly marks: MarkLayer
  private readonly labels: LabelLayer
  private readonly objects: ObjectRenderer
  private readonly tooltip: L.Tooltip
  private readonly tools: Record<ToolId, Tool>
  private tool: Tool
  private lastTool: ToolId = 'select'
  private owners: Int16Array
  private readonly svgRenderers: L.Renderer[]
  private zoomControl: L.Control.Zoom
  private moveFrame = 0
  /** While a pointer is down the view must not jump (it would break a drag that is starting). */
  private pointerDown = false
  /** A click whose pointerdown happened before the last tool drag ended belongs to that drag and is swallowed. */
  private dragEndedAt = -Infinity
  private lastDownAt = 0

  constructor(
    el: HTMLElement,
    private readonly data: MapData,
    private readonly nations: NationCatalog,
    private readonly plan: Plan,
    private readonly session: SessionState,
    private readonly undo: Y.UndoManager,
    private readonly presence: Presence,
  ) {
    const world = L.latLngBounds([-data.height, 0], [0, data.width])
    this.map = L.map(el, {
      // The map wraps horizontally (Asia → Pacific → America): every layer draws the world
      // copies around the view, and the view is folded back into the canonical copy after moves.
      crs: L.CRS.Simple,
      minZoom: -4,
      maxZoom: 3,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 90,
      // Vertical limits only; horizontally the world repeats.
      maxBounds: L.latLngBounds([-data.height * 1.15, -1e6], [data.height * 0.15, 1e6]),
      maxBoundsViscosity: 0.8,
      attributionControl: false,
      zoomControl: false,
      boxZoom: false,
      // Long-press fires 'contextmenu' on touch screens too (reserved for mobile ping/erase, see PLAN.md M4).
      tapHold: true,
    })
    this.zoomControl = L.control.zoom({ position: 'bottomright', zoomInTitle: `${t('map.zoomIn')} (+)`, zoomOutTitle: `${t('map.zoomOut')} (−)` }).addTo(this.map)
    for (const [name, z] of PANES) {
      const pane = this.map.createPane(name)
      pane.style.zIndex = String(z)
      if (['labels', 'base', 'marks', 'cursors'].includes(name)) pane.style.pointerEvents = 'none'
    }

    this.index = new ProvinceIndex(data)
    this.owners = nations.owners(plan.ownership.entries())
    this.base = new BaseMapLayer(data, this.index).addTo(this.map)
    this.marks = new MarkLayer(this.index, data.width).addTo(this.map)
    this.labels = new LabelLayer(data, nations).addTo(this.map)
    this.base.setOwners(this.owners)
    this.labels.setOwners(this.owners)

    const planRenderer = L.svg({ pane: 'plan', padding: 0.5 })
    const previewRenderer = L.svg({ pane: 'preview', padding: 0.5 })
    this.svgRenderers = [planRenderer, previewRenderer]
    this.objects = new ObjectRenderer(plan, session, planRenderer, { down: (id, e) => this.tool.onObjectDown?.(id, e) }, data.width)
    this.objects.group.addTo(this.map)
    const preview = L.layerGroup().addTo(this.map)
    new PresenceLayer(presence, this.map, data.width).group.addTo(this.map)

    this.tooltip = L.tooltip({ direction: 'top', offset: [0, -14], className: 'cow-tip', opacity: 1 })

    const ctx: ToolContext = {
      map: this.map,
      plan,
      session,
      data,
      index: this.index,
      nations,
      owners: () => this.owners,
      preview,
      previewRenderer,
      toPoint,
      scale: () => this.map.getZoomScale(this.map.getZoom(), 0),
      drawColor: () => session.drawColor ?? (session.me ? plan.nations.get(session.me)?.color : undefined) ?? '#ff5a4e',
      newObjectBase: () => ({ layerId: session.activeLayer, phaseId: session.activePhase, author: session.me ?? '' }),
      setHint: (key, params) => (session.hint = { key, params }),
      ping: ([x, y]) => presence.ping([wrapX(x, data.width), y]),
      endOneShot: () => (session.tool = this.lastTool),
      checkpoint: () => undo.stopCapturing(),
      distanceFactor: () => distanceFactor(plan),
      trackDrag: (move, end) => this.trackDrag(move, end),
    }
    this.tools = {
      select: new SelectTool(ctx),
      assign: new PaintTool('assign', ctx),
      own: new PaintTool('own', ctx),
      arrow: new PathTool('arrow', ctx),
      front: new PathTool('front', ctx),
      zone: new PathTool('zone', ctx),
      unit: new PlaceTool('unit', ctx),
      objective: new PlaceTool('objective', ctx),
      text: new PlaceTool('text', ctx),
      range: new RangeTool(ctx),
      measure: new MeasureTool(ctx),
      ping: new PingTool(ctx),
    }
    this.tool = this.tools.select

    // Capture phase: also sees presses on markers/handles, which don't bubble to the map.
    el.addEventListener(
      'pointerdown',
      (e) => {
        this.lastDownAt = e.timeStamp
        this.pointerDown = true
      },
      true,
    )
    const release = () => (this.pointerDown = false)
    document.addEventListener('pointerup', release)
    document.addEventListener('pointercancel', release)
    this.map.on('mousemove', (e) => {
      this.onHover(e)
      const [cx, cy] = toPoint(e.latlng)
      presence.setCursor([wrapX(cx, data.width), cy])
      this.tool.onMouseMove?.(e)
    })
    this.map.on('mouseout', () => {
      this.setHovered(null)
      presence.setCursor(null)
    })
    this.map.on('mousedown', (e) => {
      if (e.sourceTarget === this.map && !(e.originalEvent as MouseEvent).altKey) this.tool.onMouseDown?.(e)
    })
    this.map.on('click', (e) => {
      if (this.lastDownAt <= this.dragEndedAt || e.sourceTarget !== this.map) return
      // Alt+click pings with any tool.
      if ((e.originalEvent as MouseEvent).altKey) return ctx.ping(toPoint(e.latlng))
      this.tool.onClick?.(e)
    })
    this.map.on('dblclick', (e) => this.tool.onDblClick?.(e))
    this.map.on('contextmenu', (e) => this.tool.onContextMenu?.(e))

    plan.ownership.observe(() => this.syncOwners())
    plan.assignments.observe(() => this.syncMarks())
    plan.nations.observe(() => this.syncMarks())
    plan.phases.observe(() => this.syncMarks())
    plan.objects.observe(() => this.tool.refresh?.())
    // Calibration changed: range labels and the ruler show new distances.
    plan.meta.observe(() => this.syncObjects())

    // Following another player: any manual pan or zoom hands control back to this viewer.
    this.map.on('dragstart', () => this.userMoved())
    el.addEventListener('wheel', () => this.userMoved(), { passive: true })
    el.addEventListener('dblclick', () => this.userMoved())

    // Keyboard pans, inertia and flights can still leave the canonical copy; jump back
    // (invisibly, since every copy looks the same) so the ±1 object copies always cover the view.
    this.map.on('move', () => this.onMove())
    this.map.on('moveend', () => {
      this.normalizeView()
      const c = this.map.getCenter()
      presence.setView({ x: Math.round(wrapX(c.lng, data.width)), y: Math.round(-c.lat), z: this.map.getZoom() })
      this.syncCopies()
      this.tool.refresh?.() // handles and drafts follow the view to the copy it now shows
    })

    const fitWorld = () => this.map.setMinZoom(Math.floor(this.map.getBoundsZoom(world) * 4) / 4)
    fitWorld()
    this.map.on('resize', fitWorld)
    this.map.fitBounds(world, { animate: false })

    this.syncStyle()
    this.syncMarks()
    this.normalizeView()
    this.syncCopies()
    this.setTool(session.tool)
  }

  // ---------- called by Vue when session state changes ----------

  setTool(id: ToolId) {
    if (this.tool.id !== 'ping') this.lastTool = this.tool.id
    this.tool.deactivate?.()
    this.tool = this.tools[id]
    const container = this.map.getContainer()
    container.style.cursor = this.tool.cursor
    container.classList.toggle('objects-passive', !this.tool.objectsInteractive)
    this.tool.activate?.()
    this.presence.setTool(id)
  }

  /** Show what a followed teammate sees (their view centre and zoom). */
  followView(v: { x: number; y: number; z: number }) {
    this.map.setView([-v.y, this.near(v.x)], v.z, { animate: true })
  }

  private userMoved() {
    if (this.session.following !== null) this.session.following = null
  }

  /** The UI language changed: re-render everything that baked text into the map. */
  refreshLocale() {
    this.objects.sync()
    this.labels.refreshNames()
    this.zoomControl.remove()
    this.zoomControl = L.control.zoom({ position: 'bottomright', zoomInTitle: `${t('map.zoomIn')} (+)`, zoomOutTitle: `${t('map.zoomOut')} (−)` }).addTo(this.map)
    this.tooltip.remove()
    this.session.hoveredProvince = null
    this.tool.refresh?.()
    if (this.tool instanceof PaintTool) this.tool.hint()
  }

  /** Forward a keydown to the active tool; true if it consumed the key. */
  handleKey(e: KeyboardEvent): boolean {
    return this.tool.onKey?.(e) ?? false
  }

  syncStyle() {
    this.base.setStyle(this.session.fillMode, this.session.borders)
    if (this.session.labels) this.labels.addTo(this.map)
    else this.labels.remove()
  }

  syncObjects() {
    this.objects.sync()
    this.tool.refresh?.()
  }

  syncSelection() {
    this.marks.setHighlight(this.session.hoveredProvince, this.session.selectedProvince)
    this.syncObjects()
  }

  /** Provinces changed hands: recolour, redraw nation borders and labels, re-check planned conquests. */
  private syncOwners() {
    this.owners = this.nations.owners(this.plan.ownership.entries())
    this.base.setOwners(this.owners)
    this.labels.setOwners(this.owners)
    this.syncMarks()
  }

  syncMarks() {
    const phases = this.plan.phases.toArray().map((p) => p.id)
    const marks = new Map<number, ProvinceMark>()
    for (const [key, a] of this.plan.assignments) {
      const entry = this.plan.nations.get(a.nation)
      const nation = this.nations.byId.get(a.nation)
      if (!entry || !nation) continue
      const pid = Number(key)
      marks.set(pid, {
        color: entry.color,
        visibility: phaseVisibility(a.phaseId, this.session.activePhase, phases),
        done: this.owners[pid] === nation.index,
      })
    }
    this.marks.setMarks(marks)
    if (this.tool instanceof PaintTool) this.tool.hint()
  }

  focusNation(nationId: string | null) {
    this.marks.setFocusColor(nationId ? (this.plan.nations.get(nationId)?.color ?? null) : null)
  }

  flyToPoint(x: number, y: number) {
    this.map.flyTo([-y, this.near(x)], Math.max(this.map.getZoom(), -0.5), { duration: 0.8 })
  }

  /** The copy of x closest to the current view, so flights take the short way round. */
  private near(x: number) {
    return nearestCopy(x, this.map.getCenter().lng, this.data.width)
  }

  /** Fold the view centre back into the canonical world [0, width); invisible since all copies look alike. */
  private normalizeView() {
    // A new drag stops the previous inertia, which fires moveend: never jump then. The drag's own
    // moveend (after its inertia) normalises instead.
    if (this.pointerDown) return
    const c = this.map.getCenter()
    const k = Math.floor(c.lng / this.data.width)
    if (k) this.map.setView([c.lat, c.lng - k * this.data.width], this.map.getZoom(), { animate: false })
  }

  /** World copies plan objects are drawn on: those in view plus one viewport of margin each side. */
  private syncCopies() {
    const b = this.map.getBounds()
    const margin = b.getEast() - b.getWest()
    this.objects.setCopies(copiesIn(b.getWest() - margin, b.getEast() + margin, this.data.width))
  }

  /** During pans: add object copies as they come into reach, and re-render SVG overlays that run out of padding. */
  private onMove() {
    if (this.moveFrame) return
    this.moveFrame = requestAnimationFrame(() => {
      this.moveFrame = 0
      this.syncCopies()
      const map = this.map
      const view = L.bounds(map.containerPointToLayerPoint([0, 0]), map.containerPointToLayerPoint(map.getSize()))
      for (const r of this.svgRenderers) {
        // Leaflet internals (stable in 1.x): the renderer's covered layer-pixel bounds and their zoom.
        const internal = r as unknown as { _bounds?: L.Bounds; _zoom?: number; _update(): void }
        if (internal._bounds && internal._zoom === map.getZoom() && !internal._bounds.contains(view)) internal._update()
      }
    })
  }

  flyToProvince(id: number) {
    const b = this.index.bboxes
    const dx = this.near(b[id * 4]) - b[id * 4]
    const bounds = L.latLngBounds([-b[id * 4 + 3], b[id * 4] + dx], [-b[id * 4 + 1], b[id * 4 + 2] + dx])
    this.map.flyToBounds(bounds, { maxZoom: 1, padding: [80, 80], duration: 0.9 })
  }

  /** Fit the view to a set of provinces (e.g. everything planned for a nation). */
  flyToProvinces(ids: number[]) {
    if (!ids.length) return
    const b = this.index.bboxes
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const id of ids) {
      x0 = Math.min(x0, b[id * 4]); y0 = Math.min(y0, b[id * 4 + 1])
      x1 = Math.max(x1, b[id * 4 + 2]); y1 = Math.max(y1, b[id * 4 + 3])
    }
    const dx = this.near(x0) - x0
    this.map.flyToBounds(L.latLngBounds([-y1, x0 + dx], [-y0, x1 + dx]), { maxZoom: 1, padding: [60, 60], duration: 0.9 })
  }

  flyToObject(id: string) {
    const o = this.plan.objects.get(id)
    if (!o) return
    const r = o.radius ?? 0
    const dx = this.near(o.points[0][0]) - o.points[0][0]
    const xs = o.points.map((p) => p[0] + dx), ys = o.points.map((p) => p[1])
    const bounds = L.latLngBounds([-(Math.max(...ys) + r), Math.min(...xs) - r], [-(Math.min(...ys) - r), Math.max(...xs) + r])
    this.map.flyToBounds(bounds, { maxZoom: 1, padding: [120, 120], duration: 0.8 })
  }

  /** Whether an SVG-space point is currently on screen. */
  isVisible(x: number, y: number): boolean {
    return this.map.getBounds().contains([-y, this.near(x)])
  }

  destroy() {
    this.tool.deactivate?.()
    this.map.remove()
  }

  // ---------- internals ----------

  private onHover(e: L.LeafletMouseEvent) {
    const [x, y] = toPoint(e.latlng)
    const id = e.sourceTarget === this.map || this.tool.id !== 'select' ? this.index.hit(x, y) : null
    this.tooltip.setLatLng(e.latlng)
    this.setHovered(id)
  }

  private setHovered(id: number | null) {
    if (id === this.session.hoveredProvince) return
    this.session.hoveredProvince = id
    this.marks.setHighlight(id, this.session.selectedProvince)
    if (id === null || DRAW_TOOLS.has(this.tool.id)) {
      this.tooltip.remove()
      return
    }
    const p = this.data.provinces[id]
    const owner = this.nations.list[this.owners[id]]
    const start = this.nations.startOf(id)
    const a = this.plan.assignments.get(String(id))
    const planned = a ? this.nations.byId.get(a.nation) : undefined
    const plannedEntry = a ? this.plan.nations.get(a.nation) : undefined
    const phase = a?.phaseId ? this.plan.phases.toArray().find((ph) => ph.id === a.phaseId)?.name : ''
    const ownerText = displayName(this.plan.nations.get(owner.id), owner.name)
    this.tooltip.setContent(
      `<b>${escapeHtml(p.name)}</b><span>${escapeHtml(ownerText)}${owner !== start ? ` · ${escapeHtml(t('tip.conqueredFrom', { nation: start.name }))}` : ''}</span>` +
        (planned && plannedEntry
          ? `<em><i style="background:${plannedEntry.color}"></i>${owner === planned ? '✓ ' : '→ '}${escapeHtml(displayName(plannedEntry, planned.name))}${phase ? ` · ${escapeHtml(phase)}` : ''}</em>`
          : ''),
    )
    if (!this.map.hasLayer(this.tooltip)) this.tooltip.addTo(this.map)
  }

  /**
   * Follow the pointer at document level until release. Pointer events (not
   * mouse events) so the same drags work with touch and pen later on mobile.
   */
  private trackDrag(onMove: (e: L.LeafletMouseEvent) => void, onEnd: (e: L.LeafletMouseEvent | null) => void) {
    const map = this.map
    // A drag is one undo step: separate it from whatever came before and after.
    this.undo.stopCapturing()
    const wasDraggable = map.dragging.enabled()
    map.dragging.disable()
    let moved = false
    let done = false
    const toLeaflet = (ev: PointerEvent): L.LeafletMouseEvent => {
      const latlng = map.mouseEventToLatLng(ev)
      return { latlng, layerPoint: map.latLngToLayerPoint(latlng), containerPoint: map.mouseEventToContainerPoint(ev), originalEvent: ev } as unknown as L.LeafletMouseEvent
    }
    const move = (ev: PointerEvent) => {
      moved = true
      onMove(toLeaflet(ev))
    }
    const finish = (ev: PointerEvent) => {
      if (done) return
      done = true
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', finish)
      document.removeEventListener('pointercancel', finish)
      if (wasDraggable) map.dragging.enable()
      // The click that follows a drag must not (de)select or place anything.
      if (moved) this.dragEndedAt = ev.timeStamp
      this.undo.stopCapturing()
      onEnd(ev.type === 'pointerup' ? toLeaflet(ev) : null)
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', finish)
    document.addEventListener('pointercancel', finish)
  }
}
