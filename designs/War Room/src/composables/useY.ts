import { onScopeDispose, shallowRef, type ShallowRef } from 'vue'
import type * as Y from 'yjs'

/** Live, read-only snapshot of a Y.Map's values. Writes go through shared/schema helpers. */
export function useYMap<T>(map: Y.Map<T>): ShallowRef<Map<string, T>> {
  const state = shallowRef(new Map(map.entries()))
  const update = () => (state.value = new Map(map.entries()))
  map.observe(update)
  onScopeDispose(() => map.unobserve(update))
  return state
}

/** Live, read-only snapshot of a Y.Array. */
export function useYArray<T>(arr: Y.Array<T>): ShallowRef<T[]> {
  const state = shallowRef(arr.toArray())
  const update = () => (state.value = arr.toArray())
  arr.observe(update)
  onScopeDispose(() => arr.unobserve(update))
  return state
}

/** Reactive canUndo/canRedo for toolbar buttons. */
export function useUndoState(undo: Y.UndoManager) {
  const state = shallowRef({ canUndo: undo.canUndo(), canRedo: undo.canRedo() })
  const update = () => (state.value = { canUndo: undo.canUndo(), canRedo: undo.canRedo() })
  const events = ['stack-item-added', 'stack-item-popped', 'stack-cleared'] as const
  events.forEach((e) => undo.on(e, update))
  onScopeDispose(() => events.forEach((e) => undo.off(e, update)))
  return state
}
