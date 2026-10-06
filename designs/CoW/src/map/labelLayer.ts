import L from 'leaflet'
import { copiesIn } from './coords'
import { territoryLabels, type NationCatalog, type TerritoryLabel } from './nations'
import type { MapData } from './types'

/** Below this map scale (screen px per SVG px) nation names replace city names. */
const NATION_MODE_SCALE = 0.3
/** A city label is only considered once its province is this many screen px across. */
const MIN_PROVINCE_PX = 26
const CELL = 64

interface Rect { x0: number; y0: number; x1: number; y1: number }

/**
 * City and nation labels drawn on one canvas sized to the viewport. Labels are
 * placed largest-province-first and skipped when they would overlap one already
 * placed, so density adapts to the zoom level automatically.
 */
export class LabelLayer extends L.Layer {
  private canvas!: HTMLCanvasElement
  private ctx!: CanvasRenderingContext2D
  private readonly byArea: number[]
  private nationNames: string[]
  private territories: TerritoryLabel[]
  private widthCache = new Map<string, number>()
  private frame = 0

  constructor(private readonly data: MapData, private readonly nations: NationCatalog) {
    super()
    L.Util.setOptions(this, { pane: 'labels' })
    this.byArea = data.provinces.map((p) => p.id).sort((a, b) => data.provinces[b].area - data.provinces[a].area)
    this.nationNames = nations.list.map((n) => n.name.toUpperCase())
    this.territories = territoryLabels(data, Int16Array.from(data.provinces, (p) => p.nation))
  }

  /** Nation names in the current UI language. */
  refreshNames() {
    this.nationNames = this.nations.list.map((n) => n.name.toUpperCase())
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
    ctx.font = `600 ${fontPx}px ${FONT}`
    for (const id of this.byArea) {
      const p = this.data.provinces[id]
      if (Math.sqrt(p.area) * scale < MIN_PROVINCE_PX) break
      const pt = map.latLngToContainerPoint([-(p.label[1] - 3), p.label[0] + shift])
      if (pt.x < -100 || pt.y < -20 || pt.x > size.x + 100 || pt.y > size.y + 20) continue
      const w = this.measure(p.name, fontPx)
      if (!this.fits(pt, w, fontPx, size, placed)) continue
      this.text(p.name, pt, fontPx, '#231d12', 'rgba(250,246,234,0.88)')
    }
  }

  private text(s: string, pt: L.Point, fontPx: number, fill: string, halo: string) {
    const ctx = this.ctx
    ctx.lineWidth = Math.max(2.5, fontPx / 4)
    ctx.strokeStyle = halo
    ctx.strokeText(s, pt.x, pt.y)
    ctx.fillStyle = fill
    ctx.fillText(s, pt.x, pt.y)
  }

  private measure(s: string, fontPx: number): number {
    const key = `${fontPx}|${s}`
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

const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif'
const SERIF = 'Georgia, "Times New Roman", serif'
