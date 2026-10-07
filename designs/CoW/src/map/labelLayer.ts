import L from 'leaflet'
import { copiesIn } from './coords'
import { territoryLabels, type NationCatalog, type TerritoryLabel } from './nations'
import type { MapData } from './types'

/** Below this map scale (screen px per SVG px) nation names replace city names. */
const NATION_MODE_SCALE = 0.3
/** A city label is only considered once its province is this many screen px across. */
const MIN_PROVINCE_PX = 26
/** Cities and Doppelstädte are labelled in smaller provinces than ordinary ones. */
const MIN_CITY_PX = 14
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
 * bold, and in smaller provinces than the rest.
 */
export class LabelLayer extends L.Layer {
  private canvas!: HTMLCanvasElement
  private ctx!: CanvasRenderingContext2D
  private readonly byArea: number[]
  /** Doppelstädte, then cities, each largest first. */
  private readonly cities: number[]
  private showLabels = true
  private showCities = true
  private nationNames: string[]
  private territories: TerritoryLabel[]
  private widthCache = new Map<string, number>()
  private frame = 0

  constructor(private readonly data: MapData, private readonly nations: NationCatalog) {
    super()
    L.Util.setOptions(this, { pane: 'labels' })
    this.byArea = data.provinces.map((p) => p.id).sort((a, b) => data.provinces[b].area - data.provinces[a].area)
    this.cities = this.byArea.filter((id) => data.provinces[id].city).sort((a, b) => data.provinces[b].city - data.provinces[a].city)
    this.nationNames = nations.list.map((n) => n.name.toUpperCase())
    this.territories = territoryLabels(data, Int16Array.from(data.provinces, (p) => p.nation))
  }

  /** Nation names in the current UI language. */
  refreshNames() {
    this.nationNames = this.nations.list.map((n) => n.name.toUpperCase())
    if (this._map) this.schedule()
  }

  /** Which parts to draw: names (cities and nations) and the city highlighting. */
  setMode(labels: boolean, cities: boolean) {
    this.showLabels = labels
    this.showCities = cities
    if (this._map) this.schedule()
  }

  /** Re-place nation names after provinces changed hands. */
  setOwners(owners: Int16Array) {
    this.territories = territoryLabels(this.data, owners)
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
      if (this.showCities) this.drawCitySymbols(map, scale, size, shift)
      if (!this.showLabels) continue
      if (scale < NATION_MODE_SCALE) this.drawNations(map, scale, size, placed, shift)
      else this.drawCities(map, scale, size, placed, shift)
    }
  }

  private drawNations(map: L.Map, scale: number, size: L.Point, placed: Map<number, Rect[]>, shift: number) {
    const ctx = this.ctx
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

  private drawCities(map: L.Map, scale: number, size: L.Point, placed: Map<number, Rect[]>, shift: number) {
    const ctx = this.ctx
    const fontPx = scale >= 2 ? 13 : scale >= 1 ? 12 : 11
    const cities = this.showCities
    if (cities)
      for (const id of this.cities) {
        const p = this.data.provinces[id]
        if (Math.sqrt(p.area) * scale < MIN_CITY_PX) continue
        const pt = this.anchor(map, p.label, shift)
        if (!onScreen(pt, size)) continue
        // Name to the right of the symbol; the reserved box covers both.
        const r = symbolRadius(p.city, scale)
        const px = fontPx + p.city - 1
        ctx.font = `700 ${px}px ${FONT}`
        const w = this.measure(p.name, px, 700)
        const box = L.point(pt.x - r + (2 * r + 4 + w) / 2, pt.y)
        if (!this.fits(box, 2 * r + 4 + w, px, size, placed)) continue
        ctx.textAlign = 'left'
        this.text(p.name, L.point(pt.x + r + 4, pt.y), px, '#1c160b', 'rgba(250,246,234,0.92)')
        ctx.textAlign = 'center'
      }
    ctx.font = `600 ${fontPx}px ${FONT}`
    for (const id of this.byArea) {
      const p = this.data.provinces[id]
      if (Math.sqrt(p.area) * scale < MIN_PROVINCE_PX) break
      if (cities && p.city) continue
      const pt = this.anchor(map, p.label, shift)
      if (!onScreen(pt, size)) continue
      const w = this.measure(p.name, fontPx)
      if (!this.fits(pt, w, fontPx, size, placed)) continue
      this.text(p.name, pt, fontPx, '#231d12', 'rgba(250,246,234,0.88)')
    }
  }

  /** Dot for a city, double ring for a Doppelstadt, at the province's label point. Never culled by collisions. */
  private drawCitySymbols(map: L.Map, scale: number, size: L.Point, shift: number) {
    if (scale < DOUBLE_SYMBOL_SCALE) return
    const ctx = this.ctx
    const ink = '#1c160b'
    for (const id of this.cities) {
      const p = this.data.provinces[id]
      if (p.city === 1 && scale < CITY_SYMBOL_SCALE) break // sorted: Doppelstädte first
      const pt = this.anchor(map, p.label, shift)
      if (!onScreen(pt, size)) continue
      const r = symbolRadius(p.city, scale)
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, r + 1.5, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(250,246,234,0.95)'
      ctx.fill()
      ctx.fillStyle = ink
      ctx.beginPath()
      if (p.city === 2) {
        ctx.arc(pt.x, pt.y, r - 0.9, 0, Math.PI * 2)
        ctx.lineWidth = 1.8
        ctx.strokeStyle = ink
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, r * 0.42, 0, Math.PI * 2)
      } else ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2)
      ctx.fill()
    }
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
    for (let cx = cx0; cx <= cx1; cx++)
      for (let cy = cy0; cy <= cy1; cy++) {
        const key = cx * 4096 + cy
        const list = placed.get(key)
        if (list) list.push(r)
        else placed.set(key, [r])
      }
    return true
  }
}

const onScreen = (pt: L.Point, size: L.Point) => pt.x > -100 && pt.y > -20 && pt.x < size.x + 100 && pt.y < size.y + 20
const symbolRadius = (city: number, scale: number) => (city === 2 ? 6 : 3.5) * (scale < NATION_MODE_SCALE ? 0.7 : scale >= 1 ? 1.15 : 1)

const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif'
const SERIF = 'Georgia, "Times New Roman", serif'
