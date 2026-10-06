<script setup lang="ts">
import Fuse from 'fuse.js'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { t } from '../i18n'
import { session } from '../state/session'
import { usePlanner } from './context'

const { data, catalog, planner } = usePlanner()

// Nations are searchable in both languages ("Deutschland" and "Germany"); results show the current one.
const items = data.provinces.map((p) => {
  const nation = catalog.list[p.nation]
  return { id: p.id, name: p.name, nationInfo: nation, nationDe: nation.nameDe, nationEn: nation.nameEn, color: nation.color }
})
const fuse = new Fuse(items, {
  keys: [
    { name: 'name', weight: 3 },
    { name: 'nationDe', weight: 1 },
    { name: 'nationEn', weight: 1 },
  ],
  threshold: 0.3,
  ignoreLocation: true,
})

const input = ref<HTMLInputElement | null>(null)
const query = ref('')
const open = ref(false)
const active = ref(0)
const results = computed(() => (query.value.trim() ? fuse.search(query.value.trim(), { limit: 8 }).map((r) => r.item) : []))

function pick(i = active.value) {
  const item = results.value[i]
  if (!item) return
  session.selectedObject = null
  session.selectedProvince = item.id
  planner.value?.flyToProvince(item.id)
  query.value = item.name
  open.value = false
  input.value?.blur()
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') active.value = Math.min(active.value + 1, results.value.length - 1)
  else if (e.key === 'ArrowUp') active.value = Math.max(active.value - 1, 0)
  else if (e.key === 'Enter') pick()
  else if (e.key === 'Escape') {
    open.value = false
    input.value?.blur()
  } else return
  e.preventDefault()
}

function onGlobalKey(e: KeyboardEvent) {
  const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
  if (!typing && (e.key === '/' || (e.key === 'k' && (e.ctrlKey || e.metaKey)))) {
    e.preventDefault()
    input.value?.focus()
    input.value?.select()
  }
}
onMounted(() => window.addEventListener('keydown', onGlobalKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKey))
</script>

<template>
  <div class="search" @focusout="open = false">
    <input
      ref="input"
      v-model="query"
      type="search"
      :placeholder="t('search.placeholder')"
      :aria-label="t('search.aria')"
      spellcheck="false"
      @focus="open = true"
      @input="(open = true), (active = 0)"
      @keydown="onKey"
    />
    <kbd>/</kbd>
    <ul v-if="open && results.length" class="search-results" role="listbox">
      <li
        v-for="(r, i) in results"
        :key="r.id"
        role="option"
        :aria-selected="i === active"
        :class="{ active: i === active }"
        @mousedown.prevent="pick(i)"
        @mouseenter="active = i"
      >
        <span class="swatch" :style="{ background: r.color }" />
        <span class="r-name">{{ r.name }}</span>
        <span class="r-nation">{{ r.nationInfo.name }}</span>
      </li>
    </ul>
  </div>
</template>
