<script setup lang="ts" generic="T extends string">
/** Segmented control: a compact, always-visible single choice (radio group semantics). */
defineProps<{ options: { value: T; label: string }[]; label: string }>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <div class="segmented" role="radiogroup" :aria-label="label">
    <button v-for="o in options" :key="o.value" role="radio" :aria-checked="model === o.value" @click="model = o.value">
      {{ o.label }}
    </button>
  </div>
</template>
