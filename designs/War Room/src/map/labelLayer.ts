import L from 'leaflet'
import { copiesIn } from './coords'
import { territoryLabels, type NationCatalog, type TerritoryLabel } from './nations'
import { GLYPH_HALO, RESOURCE_GLYPHS, glyphSize } from '../render/resourceGlyphs'
import type { MapData, Resource } from './types'

/** Below this map scale (screen px per SVG px) nation names replace city names. */
const NATION_MODE_SCALE = 0.3
/** A city label is only considered once its province is this many screen px across. */
const MIN_PROVINCE_PX = 26
/** Cities and Doppelstädte are labelled in smaller provinces than ordinary ones. */
const MIN_CITY_PX = 14
/** Resource glyphs appear once their province is this many screen px across. */
const MIN_RESOURCE_PX = 12
/** Below these map scales the city / Doppelstadt symbols are left out. */
const CITY_SYMBOL_SCALE = 0.2
const DOUBLE_SYMBOL_SCALE = 0.1
const CELL = 64

interface Rect { x0: number; y0: number; x1: number; y1: number }

/**
 * City and nation labels drawn on one canvas sized to the viewport. Labels are
 * placed largest-province-first and skipped when they would overlap one already
 * placed, so density adapts to the zoom level automatically.
 *
 * Cities are the most important provinces, so with highlighting on they get an
 * atlas symbol (dot = city, double ring = Doppelstadt), are labelled first, in
 * bold, and in smaller provinces than the rest. Resource provinces get a glyph
 * (wheat ear, ingot, drop) sized by production. Both markers sit in front of the
 * name and are never dropped for lack of space; names are.
 *
 * Capitals get a gold star at every zoom level.
 */
export class LabelLayer extends L.Layer {
  private canvas!: HTMLCanvasElement
  private ctx!: CanvasRenderingContext2D
  private readonly byArea: number[]
  /** Doppelstädte, then cities, each largest first. */
  private readonly cities: number[]
  /** Cities first, then the other resource provinces largest-first: the order markers claim space in. */
  private readonly marked: number[]
  private showLabels = true
  private showCities = true
  private showResources = true
  private glyphPaths = new Map<Resource, Path2D>()
  private nationNames: string[]
  private owners: Int16Array
  /** Nation-name anchors for the current owners; null until needed (only drawn when zoomed far out). */
  private territories: TerritoryLabel[] | null = null
  private widthCache = new Map<string, number>()
  private frame = 0

  constructor(private readonly data: MapData, private readonly nations: NationCatalog) {
    super()
    L.Util.setOptions(this, { pane: 'labels' })
    this.byArea = data.provinces.map((p) => p.id).sort((a, b) => data.provinces[b].area - data.provinces[a].area)
    this.cities = this.byArea.filter((id) => data.provinces[id].city).sort((a, b) => data.provinces[b].city - data.provinces[a].city)
    this.marked = [...this.cities, ...this.byArea.filter((id) => !data.provinces[id].city && data.provinces[id].res)]
    this.nationNames = nations.list.map((n) => n.name.toUpperCase())
    this.owners = Int16Array.from(data.provinces, (p) => p.nation)
  }

  /** Nation names in the current UI language. */
  refreshNames() {
    this.nationNames = this.nations.list.map((n) => n.name.toUpperCase())
    if (this._map) this.schedule()
  }

  /** Which parts to draw: names (provinces and nations), city highlighting, resource glyphs. */
  setMode(labels: boolean, cities: boolean, resources: boolean) {
    this.showLabels = labels
    this.showCities = cities
    this.showResources = resources
    if (this._map) this.schedule()
  }

  /** Re-place nation names after provinces changed hands. */
  setOwners(owners: Int16Array) {
    this.owners = owners
    this.territories = null
    if (this._map) this.schedule()
  }

  onAdd(map: L.Map): this {
    this.canvas = L.DomUtil.create('canvas', 'cow-labels leaflet-zoom-hide')
    this.ctx = this.canvas.getContext('2d')!
    map.getPane('labels')!.appendChild(this.canvas)
    map.on('move zoomend resize viewreset', this.schedule, this)
    this.draw()
    return this
  }

  onRemove(map: L.Map): this {
    map.off('move zoomend resize viewreset', this.schedule, this)
    cancelAnimationFrame(this.frame)
    this.canvas.remove()
    return this
  }

  private schedule() {
    cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(() => this.draw())
  }

  private draw() {
    const map = this._map
    if (!map) return
    const size = map.getSize()
    const dpr = window.devicePixelRatio || 1
    if (this.canvas.width !== size.x * dpr || this.canvas.height !== size.y * dpr) {
      this.canvas.width = size.x * dpr
      this.canvas.height = size.y * dpr
      this.canvas.style.width = `${size.x}px`
      this.canvas.style.height = `${size.y}px`
    }
    L.DomUtil.setPosition(this.canvas, map.containerPointToLayerPoint([0, 0]))

    const ctx = this.ctx
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.x, size.y)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'

    const scale = map.getZoomScale(map.getZoom(), 0)
    const placed = new Map<number, Rect[]>()
    // The map wraps horizontally: label every visible world copy (collisions are shared across copies).
    const b = map.getBounds()
    for (const k of copiesIn(b.getWest(), b.getEast(), this.data.width)) {
      const shift = k * this.data.width
      if (scale < NATION_MODE_SCALE) {
        if (this.showCities) this.drawCitySymbols(map, scale, size, shift)
        if (this.showLabels) this.drawNations(map, scale, size, placed, shift)
        continue
      }
      const markers = this.drawMarkers(map, scale, size, placed, shift)
      if (this.showLabels) this.drawNames(map, scale, size, placed, shift, markers)
    }
  }

  private drawNations(map: L.Map, scale: number, size: L.Point, placed: Map<number, Rect[]>, shift: number) {
    const ctx = this.ctx
    this.territories ??= territoryLabels(this.data, this.owners)
    for (const l of this.territories) {
      const span = Math.sqrt(l.area) * scale
      if (span < 40) break // sorted by area: everything after is smaller
      const fontPx = Math.min(22, Math.max(9, span / 9))
      const name = this.nationNames[l.nation]
      ctx.font = `700 ${fontPx}px ${SERIF}`
      const w = ctx.measureText(name).width + name.length * fontPx * 0.12
      if (w > span * 1.6) continue
      const pt = map.latLngToContainerPoint([-l.y, l.x + shift])
      if (!this.fits(pt, w, fontPx, size, placed)) continue
      ctx.letterSpacing = `${(fontPx * 0.12).toFixed(1)}px`
      this.text(name, pt, fontPx, 'rgba(48,36,20,0.9)', 'rgba(250,244,226,0.6)')
      ctx.letterSpacing = '0px'
    }
  }

  /**
   * Markers in front of the names: the city symbol at the province's label point,
   * then the resource glyph (on its own, the glyph sits on the point). They are
   * always drawn and reserve their space first. Returns each marked province's
   * right marker edge, where its name starts.
   */
  private drawMarkers(map: L.Map, scale: number, size: L.Point, placed: Map<number, Rect[]>, shift: number): Map<number, number> {
    const edges = new Map<number, number>()
    if (!this.showCities && !this.showResources) return edges
    const grow = scale >= 1 ? 1.15 : 1
    for (const id of this.marked) {
      const p = this.data.provinces[id]
      const city = this.showCities && p.city > 0
      const res = this.showResources ? p.res : null
      if (!city && (!res || Math.sqrt(p.area) * scale < MIN_RESOURCE_PX)) continue
      const pt = this.anchor(map, p.label, shift)
      if (!onScreen(pt, size)) continue
      let left = pt.x
      let right = pt.x
      let h = 0
      if (city) {
        const capital = this.nations.capitals.has(id)
        const r = capital ? CAPITAL_RADIUS : symbolRadius(p.city, scale)
        if (capital) this.capitalStar(pt, r)
        else this.citySymbol(pt, r, p.city)
        left = pt.x - r - 1.5
        right = pt.x + r + 1.5
        h = 2 * r + 3
      }
      if (res) {
        const g = glyphSize(p.amount) * grow
        const cx = city ? right + 1 + g / 2 : pt.x
        this.glyph(res, cx, pt.y, g)
        if (!city) left = cx - g / 2
        right = cx + g / 2
        h = Math.max(h, g)
      }
      this.reserve({ x0: left, y0: pt.y - h / 2, x1: right, y1: pt.y + h / 2 }, placed)
      edges.set(id, right)
    }
    return edges
  }

  /** Province names: cities first and in bold (with highlighting on), then the rest largest-first. */
  private drawNames(map: L.Map, scale: number, size: L.Point, placed: Map<number, Rect[]>, shift: number, markers: Map<number, number>) {
    const ctx = this.ctx
    const fontPx = scale >= 2 ? 13 : scale >= 1 ? 12 : 11
    const cities = this.showCities
    const place = (id: number) => {
      const p = this.data.provinces[id]
      const pt = this.anchor(map, p.label, shift)
      if (!onScreen(pt, size)) return
      const bold = cities && p.city > 0
      const px = bold ? fontPx + p.city - 1 : fontPx
      const weight = bold ? 700 : 600
      ctx.font = `${weight} ${px}px ${FONT}`
      const w = this.measure(p.name, px, weight)
      const fill = bold ? '#1c160b' : '#231d12'
      const halo = bold ? 'rgba(250,246,234,0.92)' : 'rgba(250,246,234,0.88)'
      const edge = markers.get(id)
      if (edge === undefined) {
        if (this.fits(pt, w, px, size, placed)) this.text(p.name, pt, px, fill, halo)
        return
      }
      // Name to the right of its markers.
      const left = edge + 4
      if (!this.fits(L.point(left + w / 2, pt.y), w, px, size, placed)) return
      ctx.textAlign = 'left'
      this.text(p.name, L.point(left, pt.y), px, fill, halo)
      ctx.textAlign = 'center'
    }
    if (cities)
      for (const id of this.cities) if (Math.sqrt(this.data.provinces[id].area) * scale >= MIN_CITY_PX) place(id)
    for (const id of this.byArea) {
      const p = this.data.provinces[id]
      if (Math.sqrt(p.area) * scale < MIN_PROVINCE_PX) break
      if (!(cities && p.city)) place(id)
    }
  }

  /** Zoomed far out: Doppelstadt (and later city) symbols only, under the nation names. */
  private drawCitySymbols(map: L.Map, scale: number, size: L.Point, shift: number) {
    // Capitals always show, as stars.
    for (const id of this.nations.capitals) {
      const pt = this.anchor(map, this.data.provinces[id].label, shift)
      if (onScreen(pt, size)) this.capitalStar(pt, CAPITAL_RADIUS * (scale < DOUBLE_SYMBOL_SCALE ? 0.7 : 0.85))
    }
    if (scale < DOUBLE_SYMBOL_SCALE) return
    for (const id of this.cities) {
      const p = this.data.provinces[id]
      if (p.city === 1 && scale < CITY_SYMBOL_SCALE) break // sorted: Doppelstädte first
      if (this.nations.capitals.has(id)) continue
      const pt = this.anchor(map, p.label, shift)
      if (onScreen(pt, size)) this.citySymbol(pt, symbolRadius(p.city, scale), p.city)
    }
  }

  /** A capital: gold five-pointed star with a dark outline on a paper halo. */
  private capitalStar(pt: L.Point, r: number) {
    const ctx = this.ctx
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      const rr = i % 2 ? r * 0.45 : r
      ctx.lineTo(pt.x + rr * Math.cos(a), pt.y + rr * Math.sin(a))
    }
    ctx.closePath()
    ctx.lineJoin = 'round'
    ctx.lineWidth = 3.5
    ctx.strokeStyle = 'rgba(250,246,234,0.95)'
    ctx.stroke()
    ctx.fillStyle = '#f1c232'
    ctx.fill()
    ctx.lineWidth = 1.2
    ctx.strokeStyle = '#2a1d06'
    ctx.stroke()
  }

  /** Dot for a city, double ring for a Doppelstadt, on a paper disc. */
  private citySymbol(pt: L.Point, r: number, kind: number) {
    const ctx = this.ctx
    const ink = '#1c160b'
    ctx.beginPath()
    ctx.arc(pt.x, pt.y, r + 1.5, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(250,246,234,0.95)'
    ctx.fill()
    ctx.fillStyle = ink
    ctx.beginPath()
    if (kind === 2) {
      ctx.arc(pt.x, pt.y, r - 0.9, 0, Math.PI * 2)
      ctx.lineWidth = 1.8
      ctx.strokeStyle = ink
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, r * 0.42, 0, Math.PI * 2)
    } else ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  /** Resource glyph of g screen px, centred on (cx, cy), with a paper halo. */
  private glyph(res: Resource, cx: number, cy: number, g: number) {
    const ctx = this.ctx
    let path = this.glyphPaths.get(res)
    if (!path) this.glyphPaths.set(res, (path = new Path2D(RESOURCE_GLYPHS[res].d)))
    const k = g / 24
    ctx.save()
    ctx.translate(cx - g / 2, cy - g / 2)
    ctx.scale(k, k)
    ctx.lineJoin = 'round'
    ctx.lineWidth = 3 / k // 1.5 px of halo outside the glyph
    ctx.strokeStyle = GLYPH_HALO
    ctx.stroke(path)
    ctx.fillStyle = RESOURCE_GLYPHS[res].color
    ctx.fill(path)
    ctx.restore()
  }

  /** Screen position of a province's label point (the SVG text baseline sits a little below the centre). */
  private anchor(map: L.Map, label: [number, number], shift: number): L.Point {
    return map.latLngToContainerPoint([-(label[1] - 3), label[0] + shift])
  }

  private text(s: string, pt: L.Point, fontPx: number, fill: string, halo: string) {
    const ctx = this.ctx
    ctx.lineWidth = Math.max(2.5, fontPx / 4)
    ctx.strokeStyle = halo
    ctx.strokeText(s, pt.x, pt.y)
    ctx.fillStyle = fill
    ctx.fillText(s, pt.x, pt.y)
  }

  private measure(s: string, fontPx: number, weight = 600): number {
    const key = `${weight}|${fontPx}|${s}`
    let w = this.widthCache.get(key)
    if (w === undefined) this.widthCache.set(key, (w = this.ctx.measureText(s).width))
    return w
  }

  /** Reserve the label's box in a coarse spatial hash; false if it collides or is off-screen. */
  private fits(pt: L.Point, w: number, h: number, size: L.Point, placed: Map<number, Rect[]>): boolean {
    const r: Rect = { x0: pt.x - w / 2 - 3, y0: pt.y - h / 2 - 2, x1: pt.x + w / 2 + 3, y1: pt.y + h / 2 + 2 }
    if (r.x1 < 0 || r.y1 < 0 || r.x0 > size.x || r.y0 > size.y) return false
    const cx0 = Math.floor(r.x0 / CELL), cx1 = Math.floor(r.x1 / CELL)
    const cy0 = Math.floor(r.y0 / CELL), cy1 = Math.floor(r.y1 / CELL)
    for (let cx = cx0; cx <= cx1; cx++)
      for (let cy = cy0; cy <= cy1; cy++)
        for (const o of placed.get(cx * 4096 + cy) ?? [])
          if (r.x0 < o.x1 && r.x1 > o.x0 && r.y0 < o.y1 && r.y1 > o.y0) return false
    this.reserve(r, placed)
    return true
  }

  private reserve(r: Rect, placed: Map<number, Rect[]>) {
    for (let cx = Math.floor(r.x0 / CELL); cx <= Math.floor(r.x1 / CELL); cx++)
      for (let cy = Math.floor(r.y0 / CELL); cy <= Math.floor(r.y1 / CELL); cy++) {
        const key = cx * 4096 + cy
        const list = placed.get(key)
        if (list) list.push(r)
        else placed.set(key, [r])
      }
  }
}

const onScreen = (pt: L.Point, size: L.Point) => pt.x > -100 && pt.y > -20 && pt.x < size.x + 100 && pt.y < size.y + 20
const CAPITAL_RADIUS = 8
const symbolRadius = (city: number, scale: number) => (city === 2 ? 6 : 3.5) * (scale < NATION_MODE_SCALE ? 0.7 : scale >= 1 ? 1.15 : 1)

const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif'
const SERIF = 'Georgia, "Times New Roman", serif'
