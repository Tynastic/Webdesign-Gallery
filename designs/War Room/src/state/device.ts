import { ref, type Ref } from 'vue'

/** A live media query as a Vue ref (false where matchMedia is missing, e.g. in tests). */
function mediaRef(query: string): Ref<boolean> {
  const mq = typeof matchMedia === 'undefined' ? null : matchMedia(query)
  const state = ref(mq?.matches ?? false)
  mq?.addEventListener('change', (e) => (state.value = e.matches))
  return state
}

/** A finger is the main input: no hover, no keyboard shortcuts, no right-click. Texts and help switch to touch wording. */
export const touchScreen = mediaRef('(hover: none) and (pointer: coarse)')

/** The phone layout: the panels live in a bottom sheet under the map (same breakpoint as style.css). */
export const narrowScreen = mediaRef('(max-width: 720px)')
