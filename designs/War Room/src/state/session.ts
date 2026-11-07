import { reactive, watch } from 'vue'
import type { ArrowVariant, FrontVariant, ObjectiveIcon, UnitType, ZoneVariant } from '../../shared/schema'
import type { Message } from '../i18n'

/**
 * Per-viewer UI state: which tool is active, what is selected, what is hidden.
 * Never synced to other players (the shared plan lives in the Yjs doc).
 */
export type ToolId = 'select' | 'assign' | 'own' | 'arrow' | 'front' | 'zone' | 'unit' | 'objective' | 'text' | 'range' | 'measure' | 'ping'
/** 'teams': land coloured by the holder's team (Axis, Allies, AI); the others by nation. */
export type FillMode = 'teams' | 'vivid' | 'muted' | 'off'
/** What the plan tool does on click: plan conquests, or mark planned ones as taken. */
export type PlanMode = 'plan' | 'taken'
/** What one click of a paint tool covers: one province, or the whole territory (the same as Shift+click). */
export type PaintArea = 'one' | 'all'
/** Buttons for a drawing in progress (touch screens have no Enter, Backspace or Esc). */
export type DraftCommand = 'finish' | 'undo' | 'cancel'

/** A drawing or measurement in progress, as the options bar offers it; cancelling is always possible. */
export interface Draft {
  canFinish: boolean
  /** Removing the last point is possible. */
  canUndo: boolean
}

export interface SessionState {
  tool: ToolId
  /** Room id ('local' for the offline plan). */
  room: string
  /** Player this viewer is (per room); null = spectator. */
  player: string | null
  /** Nation this viewer plays, from the line-up; drawings default to its marker colour. null = none (yet). */
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
  planMode: PlanMode
  paintArea: PaintArea
  /** Nation the ownership tool marks provinces as conquered by; null = restore the original owner. */
  ownNation: string | null
  activeLayer: string
  /** null = show all phases. */
  activePhase: string | null
  /** Phases (days) the point counter covers; empty = all. Follows the phase bar until changed in the Points panel. */
  pointsPhases: string[]
  hiddenLayers: string[]
  selectedObject: string | null
  selectedProvince: number | null
  fillMode: FillMode
  /** Grey out nations without a player (AI nations). Switched on whenever the Teams mode is chosen. */
  aiGrey: boolean
  borders: boolean
  labels: boolean
  /** Highlight cities and Doppelstädte with map symbols and bold labels. */
  cities: boolean
  /** Mark resource provinces with their resource glyph. */
  resources: boolean
  /** The map legend is expanded. */
  legend: boolean
  /** Transient: the line-up dialog is open. */
  lineupOpen: boolean
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
  /** Transient: the map is fully zoomed out ('min') or in ('max'). */
  zoomRange: 'min' | 'max' | null
  /** Transient: the drawing or measurement in progress, if any. */
  draft: Draft | null
}

const STORAGE_KEY = 'cow-planner.session'
/** Version of the stored preferences: 2 introduced the Teams colour mode as the default. */
const PREFS_VERSION = 2
/** Only preferences are remembered between visits, not transient selection. */
const PERSISTED: (keyof SessionState)[] = ['measureSpeed', 'fillMode', 'aiGrey', 'borders', 'labels', 'cities', 'resources', 'legend', 'arrowVariant', 'unitType', 'objectiveIcon', 'hiddenLayers']

function restore(): Partial<SessionState> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    // Muted was the default before teams existed: switch those viewers to the new default once.
    if ((raw.v ?? 1) < 2 && raw.fillMode === 'muted') raw.fillMode = 'teams'
    return Object.fromEntries(PERSISTED.filter((k) => k in raw).map((k) => [k, raw[k]]))
  } catch {
    return {}
  }
}

export const session = reactive<SessionState>({
  tool: 'select',
  room: 'local',
  player: null,
  me: null,
  drawColor: null,
  arrowVariant: 'attack',
  frontVariant: 'front',
  zoneVariant: 'target',
  unitType: 'infantry',
  objectiveIcon: 'target',
  assignNation: null,
  planMode: 'plan',
  paintArea: 'one',
  ownNation: null,
  activeLayer: 'general',
  activePhase: null,
  pointsPhases: [],
  hiddenLayers: [],
  selectedObject: null,
  selectedProvince: null,
  fillMode: 'teams',
  aiGrey: true,
  borders: true,
  labels: true,
  cities: true,
  resources: true,
  // Open by default, except on phones, where it would cover much of the map.
  legend: typeof matchMedia === 'undefined' || matchMedia('(min-width: 721px)').matches,
  lineupOpen: false,
  measureSpeed: null,
  measuredKm: null,
  following: null,
  hoveredProvince: null,
  hint: null,
  zoomRange: null,
  draft: null,
  ...restore(),
})

watch(
  () => PERSISTED.map((k) => session[k]),
  () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: PREFS_VERSION, ...Object.fromEntries(PERSISTED.map((k) => [k, session[k]])) }))
    } catch {
      /* storage unavailable (private mode): preferences just won't persist */
    }
  },
  { deep: true },
)

// Choosing a mode sets AI greying to fit it (Teams on, Vivid and Muted off); the toggle stays free to change afterwards.
watch(
  () => session.fillMode,
  (mode, before) => {
    if (mode === before) return
    if (mode === 'teams') session.aiGrey = true
    else if (mode === 'vivid' || mode === 'muted') session.aiGrey = false
  },
)

/** Step the active phase one day back or forward; past either end it goes to "All" (null). */
export function stepPhase(phases: { id: string }[], dir: 1 | -1) {
  if (!phases.length) return
  const i = session.activePhase ? phases.findIndex((p) => p.id === session.activePhase) : -1
  const next = i + dir
  session.activePhase = next < 0 || next >= phases.length ? null : phases[next].id
}

/** Which player I am is remembered per room (and per browser). */
export function loadPlayer(room: string): string | null {
  try {
    return localStorage.getItem(`cow-planner.player.${room}`)
  } catch {
    return null
  }
}

export function savePlayer(room: string, player: string | null) {
  try {
    if (player) localStorage.setItem(`cow-planner.player.${room}`, player)
    else localStorage.removeItem(`cow-planner.player.${room}`)
  } catch {
    /* storage unavailable */
  }
}

/** Before v0.5 this browser remembered the nation it played; used once to find that nation's player. */
export function takeLegacyNation(room: string): string | null {
  try {
    const nation = localStorage.getItem(`cow-planner.me.${room}`)
    localStorage.removeItem(`cow-planner.me.${room}`)
    return nation
  } catch {
    return null
  }
}
