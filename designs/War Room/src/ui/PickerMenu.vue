<script setup lang="ts">
import { ref } from 'vue'
import MenuPopover from './MenuPopover.vue'

/**
 * Compact picker for the tool bar: a button showing the current choice that opens
 * the full set of choices (any radio buttons in the default slot). Picking closes it.
 */
defineProps<{ label: string; title?: string }>()
const open = ref(false)

function onPick(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('[role=radio]')) open.value = false
}
</script>

<template>
  <MenuPopover v-model:open="open" class="picker-menu" :label="label" :title="title ?? label" placement="below-start" button-class="picker-btn">
    <template #button><slot name="current" /></template>
    <div @click="onPick"><slot /></div>
  </MenuPopover>
</template>
