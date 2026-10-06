import { reactive, watch } from 'vue'
import type { ArrowVariant, FrontVariant, ObjectiveIcon, UnitType, ZoneVariant } from '../../shared/schema'
import type { Message } from '../i18n'

/**
 * Per-viewer UI state: which tool is active, what is selected, what is hidden.
 * Never synced to other players (the shared plan lives in the Yjs doc).
 */
export type ToolId = 'select' | 'assign' | 'own' | 'arrow' | 'front' | 'zone' | 'unit' | 'objective' | 'text' | 'range' | 'measure' | 'ping'
export type FillMode = 'vivid' | 'muted' | 'off'

export interface SessionState {
  tool: ToolId
  /** Room id ('local' for the offline plan). */
  room: string
  /** Nation this viewer plays (per room); drawings default to its marker colour. null = spectator. */
  me: string | null
  /** Overrides the marker colour for new drawings; null = use my nation's colour. */
  drawColor: string | null
  arrowVariant: ArrowVariant
  frontVariant: FrontVariant
  zoneVariant: ZoneVariant
  unitType: UnitType
  objectiveIcon: ObjectiveIcon
  /** Nation new planned conquests go to; null = erase. */
  assignNation: string | null
  /** Nation the ownership tool marks provinces as conquered by; null = restore the 1942 owner. */
  ownNation: string | null
  activeLayer: string
  /** null = show all phases. */
  activePhase: string | null
  hiddenLayers: string[]
  selectedObject: string | null
  selectedProvince: number | null
  fillMode: FillMode
  borders: boolean
  labels: boolean
  /** Travel speed (km/h) for measurement travel times; null = distance only. */
  measureSpeed: number | null
  /** Transient: uncalibrated length of the last finished measurement (for calibration). */
  measuredKm: number | null
  /** Transient: awareness client id of the player whose view this viewer follows. */
  following: number | null
  /** Transient: province under the pointer. */
  hoveredProvince: number | null
  /** Transient: contextual instruction for the status bar (a message key, so it follows the language). */
  hint: Message | null
}

const STORAGE_KEY = 'cow-planner.session'
/** Only preferences are remembered between visits, not transient selection. */
const PERSISTED: (keyof SessionState)[] = ['measureSpeed', 'fillMode', 'borders', 'labels', 'arrowVariant', 'unitType', 'objectiveIcon', 'hiddenLayers']

function restore(): Partial<SessionState> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    return Object.fromEntries(PERSISTED.filter((k) => k in raw).map((k) => [k, raw[k]]))
  } catch {
    return {}
  }
}

export const session = reactive<SessionState>({
  tool: 'select',
  room: 'local',
  me: null,
  drawColor: null,
  arrowVariant: 'attack',
  frontVariant: 'front',
  zoneVariant: 'target',
  unitType: 'infantry',
  objectiveIcon: 'target',
  assignNation: null,
  ownNation: null,
  activeLayer: 'general',
  activePhase: null,
  hiddenLayers: [],
  selectedObject: null,
  selectedProvince: null,
  fillMode: 'muted',
  borders: true,
  labels: true,
  measureSpeed: null,
  measuredKm: null,
  following: null,
  hoveredProvince: null,
  hint: null,
  ...restore(),
})

watch(
  () => PERSISTED.map((k) => session[k]),
  () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(PERSISTED.map((k) => [k, session[k]]))))
    } catch {
      /* storage unavailable (private mode): preferences just won't persist */
    }
  },
  { deep: true },
)

/** Which nation I play is remembered per room (and per browser). */
export function loadMe(room: string): string | null {
  try {
    return localStorage.getItem(`cow-planner.me.${room}`)
  } catch {
    return null
  }
}

export function saveMe(room: string, nation: string | null) {
  try {
    if (nation) localStorage.setItem(`cow-planner.me.${room}`, nation)
    else localStorage.removeItem(`cow-planner.me.${room}`)
  } catch {
    /* storage unavailable */
  }
}
