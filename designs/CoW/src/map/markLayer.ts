import { CanvasLayer, useMapSpace, type View } from './canvasLayer'
import { copiesIn } from './coords'
import type { ProvinceIndex } from './provinceIndex'
import type { PhaseVisibility } from '../../shared/schema'

export interface ProvinceMark {
  color: string
  visibility: PhaseVisibility
  /** The assigned nation already holds the province: the planned conquest is achieved. */
  done: boolean
}

/**
 * Dynamic province overlays: planned conquests ("who conquers what") as tint +
 * diagonal hatching + inner outline in the nation's marker colour (achieved ones
 * shrink to a slim dashed outline so open work stands out), and hover/selection
 * highlights. Cheap to repaint, so it updates on every hover change.
 */
export class MarkLayer extends CanvasLayer {
  private marks = new Map<number, ProvinceMark>()
  private hovered: number | null = null
  private selected: number | null = null
  private focusColor: string | null = null
  private patterns = new Map<string, CanvasPattern>()

  constructor(private readonly index: ProvinceIndex, private readonly worldWidth: number) {
    super('marks')
  }

  setMarks(marks: Map<number, ProvinceMark>) {
    this.marks = marks
    this.redraw()
  }

  setHighlight(hovered: number | null, selected: number | null) {
    if (hovered === this.hovered && selected === this.selected) return
    this.hovered = hovered
    this.selected = selected
    this.redraw()
  }

  /** Emphasise one player's provinces (e.g. while hovering them in the legend). */
  setFocusColor(color: string | null) {
    this.focusColor = color
    this.redraw()
  }

  protected render(ctx: CanvasRenderingContext2D, view: View) {
    // Draw every visible world copy (the map wraps horizontally).
    for (const k of copiesIn(view.x0, view.x1, this.worldWidth)) this.renderCopy(ctx, view, k * this.worldWidth)
  }

  private renderCopy(ctx: CanvasRenderingContext2D, baseView: View, shift: number) {
    const view = { ...baseView, x0: baseView.x0 - shift, x1: baseView.x1 - shift }
    const px = (n: number) => n / view.scale
    useMapSpace(ctx, baseView, shift)
    ctx.lineJoin = 'round'

    for (const [id, mark] of this.marks) {
      if (mark.visibility === 'hidden' || !this.index.visible(id, view.x0, view.y0, view.x1, view.y1)) continue
      const path = this.index.paths[id]
      const dim = mark.visibility === 'dim' || (this.focusColor !== null && this.focusColor !== mark.color)
      ctx.save()
      ctx.clip(path)
      if (mark.done) {
        ctx.globalAlpha = dim ? 0.35 : 0.9
        ctx.strokeStyle = mark.color
        ctx.lineWidth = px(3.5)
        ctx.setLineDash([px(5), px(4)])
        ctx.stroke(path)
        ctx.restore()
        continue
      }
      ctx.globalAlpha = dim ? 0.12 : 0.3
      ctx.fillStyle = mark.color
      ctx.fill(path)
      ctx.globalAlpha = dim ? 0.3 : 0.75
      ctx.fillStyle = this.pattern(ctx, mark.color, view.scale)
      ctx.fill(path)
      // Inner outline: stroke twice the width, the clip removes the outer half.
      ctx.globalAlpha = dim ? 0.4 : 1
      ctx.strokeStyle = mark.color
      ctx.lineWidth = px(5)
      ctx.stroke(path)
      ctx.restore()
    }
    ctx.globalAlpha = 1

    if (this.hovered !== null && this.hovered !== this.selected) {
      const path = this.index.paths[this.hovered]
      ctx.fillStyle = 'rgba(255,255,255,0.18)'
      ctx.fill(path)
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'
      ctx.lineWidth = px(2)
      ctx.stroke(path)
    }
    if (this.selected !== null) {
      const path = this.index.paths[this.selected]
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.6)'
      ctx.shadowBlur = 8
      ctx.strokeStyle = '#ffcf3f'
      ctx.lineWidth = px(3)
      ctx.stroke(path)
      ctx.restore()
      ctx.strokeStyle = '#2a2006'
      ctx.lineWidth = px(1)
      ctx.stroke(path)
    }
  }

  /** Screen-constant diagonal hatching in the given colour. */
  private pattern(ctx: CanvasRenderingContext2D, color: string, scale: number): CanvasPattern {
    let pattern = this.patterns.get(color)
    if (!pattern) {
      const tile = document.createElement('canvas')
      tile.width = tile.height = 10
      const t = tile.getContext('2d')!
      t.strokeStyle = color
      t.lineWidth = 2.2
      t.beginPath()
      for (const o of [-10, 0, 10]) {
        t.moveTo(o, 10)
        t.lineTo(o + 10, 0)
      }
      t.stroke()
      pattern = ctx.createPattern(tile, 'repeat')!
      this.patterns.set(color, pattern)
    }
    pattern.setTransform(new DOMMatrix().scale(1 / scale))
    return pattern
  }
}
