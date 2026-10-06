import L from 'leaflet'

/**
 * Affine view of SVG map space onto the canvas. CRS.Simple is linear, so a
 * single transform maps every SVG coordinate: px = x * scale + ox.
 */
export interface View {
  scale: number
  ox: number
  oy: number
  /** Visible SVG-space rectangle covered by the canvas (incl. padding). */
  x0: number
  y0: number
  x1: number
  y1: number
}

/**
 * A padded, viewport-sized canvas that redraws after pans/zooms and is CSS-scaled
 * in between (same approach as Leaflet's own renderers, so it stays aligned during
 * wheel/pinch zoom animations and flyTo).
 */
export abstract class CanvasLayer extends L.Layer {
  protected canvas!: HTMLCanvasElement
  protected ctx!: CanvasRenderingContext2D
  private padding = 0.35
  private center!: L.LatLng
  private zoom = 0
  private frame = 0
  private coverFrame = 0
  /** Layer-pixel rectangle the canvas currently covers (at this.zoom). */
  private covered: L.Bounds | null = null

  constructor(pane: string) {
    super()
    // Leaflet's Class constructor ignores options passed to super(); set them explicitly.
    L.Util.setOptions(this, { pane })
  }

  protected abstract render(ctx: CanvasRenderingContext2D, view: View): void

  onAdd(map: L.Map): this {
    this.canvas = L.DomUtil.create('canvas', 'cow-canvas leaflet-zoom-animated')
    this.ctx = this.canvas.getContext('2d')!
    this.getPane()!.appendChild(this.canvas)
    map.on(this.handlers)
    this.reset()
    return this
  }

  onRemove(map: L.Map): this {
    map.off(this.handlers)
    cancelAnimationFrame(this.frame)
    this.canvas.remove()
    return this
  }

  /** Request a repaint on the next animation frame (coalesces bursts). */
  redraw() {
    if (!this._map) return
    cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(() => this.paint())
  }

  private readonly handlers: L.LeafletEventHandlerFnMap = {
    moveend: () => this.reset(),
    viewreset: () => this.reset(),
    resize: () => this.reset(),
    zoom: () => this.updateTransform(this._map.getCenter(), this._map.getZoom()),
    move: () => this.checkCoverage(),
    zoomanim: (e) => this.updateTransform((e as L.ZoomAnimEvent).center, (e as L.ZoomAnimEvent).zoom),
  }

  private updateTransform(center: L.LatLng, zoom: number) {
    const map = this._map
    const scale = map.getZoomScale(zoom, this.zoom)
    const viewHalf = map.getSize().multiplyBy(0.5 + this.padding)
    const offset = viewHalf
      .multiplyBy(-scale)
      .add(map.project(this.center, zoom))
      // _getNewPixelOrigin is internal but stable across Leaflet 1.x; Leaflet's renderers use it the same way.
      .subtract((map as unknown as { _getNewPixelOrigin(c: L.LatLng, z: number): L.Point })._getNewPixelOrigin(center, zoom))
    L.DomUtil.setTransform(this.canvas, offset, scale)
  }

  /**
   * Long drags (and panning across the date line) can run past the padded canvas
   * before 'moveend'; repaint as soon as part of the view is no longer covered.
   */
  private checkCoverage() {
    if (this.coverFrame || !this.covered || this._map.getZoom() !== this.zoom) return
    this.coverFrame = requestAnimationFrame(() => {
      this.coverFrame = 0
      const map = this._map
      if (!map || map.getZoom() !== this.zoom || !this.covered) return
      const view = L.bounds(map.containerPointToLayerPoint([0, 0]), map.containerPointToLayerPoint(map.getSize()))
      if (!this.covered.contains(view)) this.reset()
    })
  }

  private reset() {
    const map = this._map
    this.center = map.getCenter()
    this.zoom = map.getZoom()
    this.updateTransform(this.center, this.zoom)
    this.paint()
  }

  private paint() {
    const map = this._map
    if (!map) return
    const size = map.getSize().multiplyBy(1 + this.padding * 2)
    const min = map.containerPointToLayerPoint(map.getSize().multiplyBy(-this.padding))
    const dpr = window.devicePixelRatio || 1
    const w = Math.round(size.x * dpr), h = Math.round(size.y * dpr)
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
      this.canvas.style.width = `${size.x}px`
      this.canvas.style.height = `${size.y}px`
    }
    L.DomUtil.setPosition(this.canvas, min)
    this.updateTransform(this.center, this.zoom)
    this.covered = L.bounds(min, min.add(size))

    const scale = map.getZoomScale(this.zoom, 0)
    // SVG (0,0) is latLng(0,0); its layer-point position gives the translation.
    const origin = map.project([0, 0], this.zoom).subtract(map.getPixelOrigin()).subtract(min)
    const view: View = {
      scale,
      ox: origin.x,
      oy: origin.y,
      x0: -origin.x / scale,
      y0: -origin.y / scale,
      x1: (size.x - origin.x) / scale,
      y1: (size.y - origin.y) / scale,
    }
    const ctx = this.ctx
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.x, size.y)
    this.render(ctx, view)
  }
}

/** Switch the context into SVG-space coordinates for the given view, optionally shifted by dx (a world copy). */
export function useMapSpace(ctx: CanvasRenderingContext2D, view: View, dx = 0) {
  const dpr = window.devicePixelRatio || 1
  ctx.setTransform(view.scale * dpr, 0, 0, view.scale * dpr, (view.ox + dx * view.scale) * dpr, view.oy * dpr)
}

/** Build a Path2D for a flat ring/polyline in SVG coordinates. */
export function flatPath(coords: number[], closed: boolean, path = new Path2D()): Path2D {
  path.moveTo(coords[0], coords[1])
  for (let i = 2; i < coords.length; i += 2) path.lineTo(coords[i], coords[i + 1])
  if (closed) path.closePath()
  return path
}
