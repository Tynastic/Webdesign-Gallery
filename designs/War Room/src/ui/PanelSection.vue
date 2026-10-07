<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next'
import { ref } from 'vue'

/** Collapsible sidebar section; open state is remembered per section. */
const props = withDefaults(defineProps<{ title: string; id: string; badge?: string | number; collapsible?: boolean }>(), { collapsible: true })

const KEY = `cow-planner.panel.${props.id}`
const read = () => {
  try {
    return localStorage.getItem(KEY) !== 'closed'
  } catch {
    return true
  }
}
const open = ref(read())
function toggle() {
  open.value = !open.value
  try {
    localStorage.setItem(KEY, open.value ? 'open' : 'closed')
  } catch {
    /* ignore */
  }
}
</script>

<template>
  <section class="panel" :class="{ closed: !open }" :aria-labelledby="`ph-${id}`">
    <header class="panel-bar">
      <button v-if="collapsible" :id="`ph-${id}`" class="panel-toggle" :aria-expanded="open" @click="toggle">
        <ChevronDown :size="14" class="chev" />
        <h2>{{ title }}</h2>
        <span v-if="badge !== undefined" class="badge">{{ badge }}</span>
      </button>
      <h2 v-else :id="`ph-${id}`" class="panel-title">{{ title }}</h2>
      <div v-if="open" class="panel-actions"><slot name="actions" /></div>
    </header>
    <div v-if="open" class="panel-body"><slot /></div>
  </section>
</template>
