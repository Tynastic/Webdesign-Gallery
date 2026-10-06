import type L from 'leaflet'
import type { Plan, PlanObject, Point } from '../../shared/schema'
import type { MessageKey, Params } from '../i18n'
import type { NationCatalog } from '../map/nations'
import type { ProvinceIndex } from '../map/provinceIndex'
import type { MapData } from '../map/types'
import type { SessionState, ToolId } from '../state/session'

export interface ToolContext {
  map: L.Map
  plan: Plan
  session: SessionState
  data: MapData
  index: ProvinceIndex
  nations: NationCatalog
  /** Current owner (nation index) per province. */
  owners(): Int16Array
  /** Layer group for transient previews (cleared by tools themselves). */
  preview: L.LayerGroup
  /** SVG renderer for previews/handles in the preview pane. */
  previewRenderer: L.Renderer
  toPoint(latlng: L.LatLng): Point
  /** Screen pixels per map unit at the current zoom. */
  scale(): number
  /** Colour for new drawings: explicit override, else my nation's marker colour. */
  drawColor(): string
  /** Common fields for new objects: active layer, active phase, author. */
  newObjectBase(): Pick<PlanObject, 'layerId' | 'phaseId' | 'author'>
  /** Short contextual instruction shown in the status bar. */
  setHint(key: MessageKey, params?: Params): void
  /** Calibration factor for distances in this plan (1 = uncalibrated estimate). */
  distanceFactor(): number
  /** Show a ping at this point for everyone in the room. */
  ping(p: Point): void
  /** Return from a one-shot tool (ping) to the tool used before. */
  endOneShot(): void
  /** Close the current undo step so the next edit becomes its own step. */
  checkpoint(): void
  /** Track the pointer at map level until release (for drags that rebuild layers). */
  trackDrag(onMove: (e: L.LeafletMouseEvent) => void, onEnd: (e: L.LeafletMouseEvent | null) => void): void
}

export interface Tool {
  readonly id: ToolId
  /** CSS cursor while the tool is active. */
  readonly cursor: string
  /** Whether plan objects should receive pointer events (only the select tool needs them). */
  readonly objectsInteractive: boolean
  activate?(): void
  deactivate?(): void
  onClick?(e: L.LeafletMouseEvent): void
  onDblClick?(e: L.LeafletMouseEvent): void
  onMouseDown?(e: L.LeafletMouseEvent): void
  onMouseMove?(e: L.LeafletMouseEvent): void
  onContextMenu?(e: L.LeafletMouseEvent): void
  onObjectDown?(id: string, e: L.LeafletMouseEvent): void
  /** Return true if the key was handled. */
  onKey?(e: KeyboardEvent): boolean
  /** Re-render tool overlays after the plan or selection changed. */
  refresh?(): void
}
