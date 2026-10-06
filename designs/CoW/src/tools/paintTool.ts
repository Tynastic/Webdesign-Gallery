import type L from 'leaflet'
import { assignProvinces, displayName, setOwners } from '../../shared/schema'
import { connectedTerritory } from '../map/nations'
import type { Tool, ToolContext } from './types'

type PaintMode = 'assign' | 'own'

/**
 * Province brush with two modes:
 *  - assign: plan which nation should conquer a province ("who takes what")
 *  - own:    record a conquest that already happened (changes the map colours)
 *
 * click / drag paints · starting on a province already painted with the target
 * toggles back (erase / restore 1942 owner) · Shift+click paints the whole
 * connected territory of the province's current owner · right-click erases ·
 * hold Space to pan. (Alt+click is reserved for pings.)
 */
export class PaintTool implements Tool {
  readonly objectsInteractive = false
  private stroke: { erase: boolean; done: Set<number> } | null = null
  private spaceHeld = false

  constructor(readonly id: PaintMode, private readonly ctx: ToolContext) {}

  get cursor() {
    return this.spaceHeld ? 'grab' : 'cell'
  }

  private get target(): string | null {
    return this.id === 'assign' ? this.ctx.session.assignNation : this.ctx.session.ownNation
  }

  activate() {
    this.ctx.map.dragging.disable()
    this.ctx.map.doubleClickZoom.disable()
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onKeyUp)
    this.hint()
  }

  deactivate() {
    this.ctx.map.dragging.enable()
    this.ctx.map.doubleClickZoom.enable()
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onKeyUp)
    this.spaceHeld = false
    this.stroke = null
  }

  hint() {
    const t = this.target
    const name = t ? displayName(this.ctx.plan.nations.get(t), this.ctx.nations.byId.get(t)?.name ?? t) : null
    if (this.id === 'assign') {
      if (!this.ctx.plan.nations.size) return this.ctx.setHint('hint.assign.noNations')
      if (name) this.ctx.setHint('hint.assign.active', { name })
      else this.ctx.setHint('hint.assign.erase')
    } else if (name) this.ctx.setHint('hint.own.active', { name })
    else this.ctx.setHint('hint.own.restore')
  }

  onKey(e: KeyboardEvent): boolean {
    if (e.code !== 'Space') return false
    if (!this.spaceHeld) {
      this.spaceHeld = true
      this.ctx.map.dragging.enable()
      this.ctx.map.getContainer().style.cursor = 'grab'
    }
    return true
  }

  private onKeyUp = (e: KeyboardEvent | FocusEvent) => {
    if ('code' in e && e.code !== 'Space') return
    this.spaceHeld = false
    this.ctx.map.dragging.disable()
    this.ctx.map.getContainer().style.cursor = 'cell'
  }

  onMouseDown(e: L.LeafletMouseEvent) {
    const ev = e.originalEvent as MouseEvent
    if (this.spaceHeld || ev.button !== 0) return
    const id = this.hit(e)
    if (id === null) return
    if (ev.shiftKey) return this.fillTerritory(id)

    const target = this.target
    const erase = target === null || this.current(id) === target
    this.stroke = { erase, done: new Set() }
    this.ctx.trackDrag(
      (move) => {
        const pid = this.hit(move)
        if (pid !== null) this.apply(pid)
      },
      () => (this.stroke = null),
    )
    this.apply(id) // after trackDrag opened a fresh undo step
  }

  onContextMenu(e: L.LeafletMouseEvent) {
    const id = this.hit(e)
    if (id === null) return
    this.ctx.checkpoint()
    this.write([id], null)
    this.ctx.checkpoint()
  }

  /** What this mode currently has for the province (assigned nation / current owner). */
  private current(id: number): string | null {
    if (this.id === 'assign') return this.ctx.plan.assignments.get(String(id))?.nation ?? null
    return this.ctx.nations.list[this.ctx.owners()[id]].id
  }

  private apply(id: number) {
    const s = this.stroke!
    if (s.done.has(id)) return
    s.done.add(id)
    this.write([id], s.erase ? null : this.target)
  }

  private write(ids: number[], nation: string | null) {
    if (this.id === 'assign') {
      const todo = nation === null ? ids.filter((id) => this.ctx.plan.assignments.has(String(id))) : ids
      if (todo.length) assignProvinces(this.ctx.plan, todo, nation, this.ctx.session.activePhase)
    } else {
      const changes = ids.map((id) => ({ province: id, nation, original: this.ctx.nations.startOf(id).id }))
      setOwners(this.ctx.plan, changes)
    }
  }

  /** Whole connected territory of the province's current owner (e.g. all of mainland Poland). */
  private fillTerritory(start: number) {
    const ids = connectedTerritory(this.ctx.data, this.ctx.owners(), start)
    this.ctx.checkpoint()
    this.write(ids, this.target)
    this.ctx.checkpoint()
    const key = this.id === 'assign' ? (this.target ? 'hint.fill.planned' : 'hint.fill.cleared') : this.target ? 'hint.fill.conquered' : 'hint.fill.restored'
    this.ctx.setHint(key, { n: ids.length })
  }

  private hit(e: L.LeafletMouseEvent) {
    const [x, y] = this.ctx.toPoint(e.latlng)
    return this.ctx.index.hit(x, y)
  }
}

/** One-shot: click to ping a spot for everyone, then return to the previous tool. */
export class PingTool implements Tool {
  readonly id = 'ping' as const
  readonly cursor = 'crosshair'
  readonly objectsInteractive = false

  constructor(private readonly ctx: ToolContext) {}

  activate() {
    this.ctx.setHint('hint.ping')
  }

  onClick(e: L.LeafletMouseEvent) {
    this.ctx.ping(this.ctx.toPoint(e.latlng))
    this.ctx.endOneShot()
  }
}
