<script setup lang="ts">
import { Eye, EyeOff, Plus, Trash2 } from 'lucide-vue-next'
import { computed } from 'vue'
import { addLayer, removeLayer, renameLayer } from '../../shared/schema'
import { useYMap } from '../composables/useY'
import { t } from '../i18n'
import { confirmAction, toast } from '../state/feedback'
import { session } from '../state/session'
import { usePlanner } from './context'
import PanelSection from './PanelSection.vue'

const { plan, undo } = usePlanner()
const layers = useYMap(plan.layers)
const objects = useYMap(plan.objects)

const sorted = computed(() => [...layers.value.values()].sort((a, b) => a.order - b.order))
const counts = computed(() => {
  const c = new Map<string, number>()
  for (const o of objects.value.values()) c.set(o.layerId, (c.get(o.layerId) ?? 0) + 1)
  return c
})

function toggle(id: string) {
  const hidden = session.hiddenLayers
  session.hiddenLayers = hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id]
}

function add() {
  const id = addLayer(plan, t('layers.default', { n: layers.value.size + 1 }))
  session.activeLayer = id
}

function rename(id: string, e: Event) {
  const input = e.target as HTMLInputElement
  if (input.value.trim()) renameLayer(plan, id, input.value.trim())
  else input.value = layers.value.get(id)?.name ?? ''
}

async function remove(id: string) {
  const l = layers.value.get(id)
  if (!l) return
  const n = counts.value.get(id) ?? 0
  if (n && !(await confirmAction(t('layers.confirmTitle', { name: l.name }), t('layers.confirmText', { n }), t('common.delete')))) return
  removeLayer(plan, id)
  if (session.activeLayer === id) session.activeLayer = plan.layers.keys().next().value ?? 'general'
  toast(t('layers.deleted', { name: l.name }), { label: t('common.undo'), run: () => undo.undo() })
}
</script>

<template>
  <PanelSection id="layers" :title="t('panel.layers')" :badge="layers.size">
    <template #actions>
      <button class="icon-btn sm" :title="t('layers.new')" :aria-label="t('layers.new')" @click="add"><Plus :size="15" /></button>
    </template>
    <ul class="rows" role="radiogroup" :aria-label="t('layers.radioGroup')">
      <li v-for="l in sorted" :key="l.id" class="row layer-row" :class="{ active: session.activeLayer === l.id, hidden: session.hiddenLayers.includes(l.id) }">
        <button
          class="icon-btn sm"
          :aria-pressed="!session.hiddenLayers.includes(l.id)"
          :aria-label="session.hiddenLayers.includes(l.id) ? t('layers.show', { name: l.name }) : t('layers.hide', { name: l.name })"
          :title="session.hiddenLayers.includes(l.id) ? t('layers.showTitle') : t('layers.hideTitle')"
          @click="toggle(l.id)"
        >
          <component :is="session.hiddenLayers.includes(l.id) ? EyeOff : Eye" :size="15" />
        </button>
        <input
          type="radio"
          name="active-layer"
          class="layer-radio"
          :checked="session.activeLayer === l.id"
          :aria-label="t('layers.drawOn', { name: l.name })"
          :title="t('layers.activeTitle')"
          @change="session.activeLayer = l.id"
        />
        <input class="row-name" :value="l.name" :aria-label="t('layers.nameLabel', { name: l.name })" maxlength="32" @change="rename(l.id, $event)" @keydown.enter="($event.target as HTMLInputElement).blur()" />
        <span class="badge" :title="t('layers.count', { n: counts.get(l.id) ?? 0 })">{{ counts.get(l.id) ?? 0 }}</span>
        <button class="icon-btn sm danger" :disabled="layers.size <= 1" :aria-label="t('layers.delete', { name: l.name })" :title="t('layers.deleteTitle')" @click="remove(l.id)"><Trash2 :size="14" /></button>
      </li>
    </ul>
  </PanelSection>
</template>
