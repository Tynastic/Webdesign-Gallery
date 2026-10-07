<script setup lang="ts">
import { computed } from 'vue'
import { MARKER_COLORS, displayName } from '../../shared/schema'
import { useYMap } from '../composables/useY'
import { t } from '../i18n'
import { usePlanner } from './context'

/** Marker colour swatches; swatches already used by a nation in the plan are ringed and named. */
const props = withDefaults(defineProps<{ auto?: boolean; label?: string }>(), { auto: false, label: '' })
const model = defineModel<string | null>({ required: true })

const { catalog, plan } = usePlanner()
const roster = useYMap(plan.nations)
const swatches = computed(() => {
  const byColor = new Map<string, string>()
  for (const n of roster.value.values()) {
    const name = displayName(n, catalog.byId.get(n.id)?.name ?? n.id)
    byColor.set(n.color, byColor.has(n.color) ? `${byColor.get(n.color)}, ${name}` : name)
  }
  return MARKER_COLORS.map((c) => ({ color: c, who: byColor.get(c) }))
})
</script>

<template>
  <div class="swatches" role="radiogroup" :aria-label="props.label || t('colour.label')">
    <button
      v-if="props.auto"
      class="swatch-btn auto"
      role="radio"
      :aria-checked="model === null"
      :title="t('colour.autoTitle')"
      @click="model = null"
    >
      {{ t('colour.auto') }}
    </button>
    <button
      v-for="s in swatches"
      :key="s.color"
      class="swatch-btn"
      :class="{ claimed: s.who }"
      role="radio"
      :aria-checked="model === s.color"
      :aria-label="s.who ? `${s.color} (${s.who})` : s.color"
      :title="s.who ?? s.color"
      :style="{ '--c': s.color }"
      @click="model = s.color"
    />
  </div>
</template>
