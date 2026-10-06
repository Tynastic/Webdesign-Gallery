import { markRaw, onBeforeUnmount, onMounted, shallowRef, watch, type Ref } from 'vue'
import type * as Y from 'yjs'
import type { Plan } from '../../shared/schema'
import { PlannerMap } from '../map/createMap'
import type { NationCatalog } from '../map/nations'
import type { MapData } from '../map/types'
import { locale } from '../i18n'
import { session } from '../state/session'
import type { Presence } from '../sync/presence'

/**
 * Mounts the Leaflet map into `el` and keeps it in step with the session.
 * PlannerMap is markRaw'd: Leaflet objects must never become reactive proxies.
 */
export function useMap(el: Ref<HTMLElement | null>, data: MapData, catalog: NationCatalog, plan: Plan, undo: Y.UndoManager, presence: Presence) {
  const planner = shallowRef<PlannerMap | null>(null)

  onMounted(() => {
    planner.value = markRaw(new PlannerMap(el.value!, data, catalog, plan, session, undo, presence))
    // Dev-only handle for debugging and end-to-end tests.
    if (import.meta.env.DEV || import.meta.env.VITE_E2E) Object.assign(window, { __cow: { planner: planner.value, plan, session, presence } })
  })
  onBeforeUnmount(() => planner.value?.destroy())

  const p = () => planner.value
  watch(() => session.tool, (t) => p()?.setTool(t))
  watch(() => [session.fillMode, session.borders, session.labels], () => p()?.syncStyle())
  watch(() => [session.selectedProvince, session.selectedObject], () => p()?.syncSelection())
  watch(
    () => [session.activePhase, session.hiddenLayers],
    () => {
      p()?.syncMarks()
      p()?.syncObjects()
    },
    { deep: true },
  )
  watch(() => [session.assignNation, session.ownNation], () => p()?.syncMarks())
  watch(locale, () => p()?.refreshLocale())
  // A finished measurement shows travel time for the current speed.
  watch(() => session.measureSpeed, () => p()?.syncObjects())

  return planner
}
