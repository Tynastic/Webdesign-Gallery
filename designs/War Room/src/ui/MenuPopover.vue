<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next'
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'

/**
 * A button that opens a small floating panel. Closes on an outside click or Esc
 * (Esc returns focus to the button). The panel stays mounted while closed, so
 * pending work inside it (a confirm dialog, a fetch) is not cut off.
 */
withDefaults(defineProps<{ label: string; title?: string; placement?: 'below-end' | 'above-start'; buttonClass?: string }>(), {
  title: undefined,
  placement: 'below-end',
  buttonClass: 'btn',
})
const open = defineModel<boolean>('open', { default: false })

const id = useId()
const root = ref<HTMLElement | null>(null)
const button = ref<HTMLButtonElement | null>(null)
const panel = ref<HTMLElement | null>(null)

function onOutside(e: PointerEvent) {
  if (!root.value?.contains(e.target as Node)) open.value = false
}
function close() {
  open.value = false
  button.value?.focus()
}

watch(open, async (isOpen) => {
  if (!isOpen) return document.removeEventListener('pointerdown', onOutside, true)
  document.addEventListener('pointerdown', onOutside, true)
  await nextTick()
  panel.value?.querySelector<HTMLElement>('input, button, select, textarea')?.focus()
})
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside, true))
</script>

<template>
  <div ref="root" class="menu" @keydown.esc.stop="close">
    <button
      ref="button"
      :class="[buttonClass, 'menu-btn']"
      :title="title"
      :aria-label="label"
      aria-haspopup="dialog"
      :aria-expanded="open"
      :aria-controls="id"
      @click="open = !open"
    >
      <slot name="button" />
      <ChevronDown :size="14" class="menu-chev" aria-hidden="true" />
    </button>
    <section v-show="open" :id="id" ref="panel" class="menu-panel" :class="placement" role="dialog" :aria-label="label">
      <h2 class="menu-title">{{ label }}</h2>
      <slot />
    </section>
  </div>
</template>
