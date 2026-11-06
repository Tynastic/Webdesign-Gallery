<script setup lang="ts">
import { computed } from 'vue'
import { NEUTRAL_COLORS, type NeutralColor } from '../../shared/schema'
import { t } from '../i18n'

/**
 * Colour choice for markings: the nation's own (Call of War) colour, or one of four
 * neutral colours (light grey, dark grey, white, black).
 *
 * `nationValue` is what choosing the nation colour stores: null where "nation" is a
 * default that follows the nation (drawing colour, a nation's planned conquests), or
 * a concrete colour (an existing drawing).
 */
const props = withDefaults(defineProps<{ nationColor?: string | null; nationValue?: string | null; label?: string }>(), {
  nationColor: null,
  nationValue: null,
  label: '',
})
const model = defineModel<string | null>({ required: true })

const neutrals = computed(() =>
  (Object.entries(NEUTRAL_COLORS) as [NeutralColor, string][]).map(([key, color]) => ({ color, label: t(`colour.${key}` as const) })),
)
const nationSelected = computed(() => model.value === props.nationValue || (props.nationColor !== null && model.value === props.nationColor))
</script>

<template>
  <div class="swatches" role="radiogroup" :aria-label="props.label || t('colour.label')">
    <button
      v-if="props.nationColor"
      class="swatch-btn nation"
      role="radio"
      :aria-checked="nationSelected"
      :title="t('colour.nationTitle')"
      @click="model = props.nationValue"
    >
      <span class="swatch-dot" :style="{ background: props.nationColor }" />{{ t('colour.nation') }}
    </button>
    <button
      v-for="s in neutrals"
      :key="s.color"
      class="swatch-btn"
      role="radio"
      :aria-checked="model === s.color"
      :aria-label="s.label"
      :title="s.label"
      :style="{ '--c': s.color }"
      @click="model = s.color"
    />
  </div>
</template>
