import { inject, provide, type InjectionKey, type ShallowRef } from 'vue'
import type * as Y from 'yjs'
import type { Plan } from '../../shared/schema'
import type { PlannerMap } from '../map/createMap'
import type { NationCatalog } from '../map/nations'
import type { MapData } from '../map/types'
import type { PlanHandle } from '../sync/planDoc'

export interface PlannerContext {
  data: MapData
  catalog: NationCatalog
  plan: Plan
  undo: Y.UndoManager
  handle: PlanHandle
  planner: ShallowRef<PlannerMap | null>
}

const KEY: InjectionKey<PlannerContext> = Symbol('planner')

export const providePlanner = (ctx: PlannerContext) => provide(KEY, ctx)

export function usePlanner(): PlannerContext {
  const ctx = inject(KEY)
  if (!ctx) throw new Error('usePlanner() called outside <Planner>')
  return ctx
}
