<script setup lang="ts">
import { Plus, Trash2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { addNation, removeNation, updateNation } from '../../shared/schema'
import { useYMap } from '../composables/useY'
import { t } from '../i18n'
import { confirmAction, toast } from '../state/feedback'
import { session } from '../state/session'
import ColorChooser from './ColorChooser.vue'
import { usePlanner } from './context'
import NationSelect from './NationSelect.vue'
import PanelSection from './PanelSection.vue'

const { catalog, plan, undo, planner } = usePlanner()
const roster = useYMap(plan.nations)
const assignments = useYMap(plan.assignments)
const ownership = useYMap(plan.ownership)

const owners = computed(() => catalog.owners(ownership.value.entries()))
/** Planned provinces per nation and how many of them it already holds. */
const progress = computed(() => {
  const out = new Map<string, { ids: number[]; done: number }>()
  for (const [key, a] of assignments.value) {
    const p = out.get(a.nation) ?? { ids: [], done: 0 }
    p.ids.push(Number(key))
    if (owners.value[Number(key)] === catalog.byId.get(a.nation)?.index) p.done++
    out.set(a.nation, p)
  }
  return out
})
const held = computed(() => {
  const c = new Map<number, number>()
  for (const o of owners.value) c.set(o, (c.get(o) ?? 0) + 1)
  return c
})
const players = computed(() => [...roster.value.values()].filter((n) => n.nickname).length)

const newNation = ref('')
const newNick = ref('')
const colorFor = ref<string | null>(null)

function add() {
  if (!newNation.value) return
  addNation(plan, newNation.value, newNick.value)
  session.assignNation ??= newNation.value
  newNation.value = ''
  newNick.value = ''
}

function rename(id: string, e: Event) {
  updateNation(plan, id, { nickname: (e.target as HTMLInputElement).value.trim() })
}

async function remove(id: string) {
  const name = catalog.byId.get(id)?.name ?? id
  const n = progress.value.get(id)?.ids.length ?? 0
  if (n && !(await confirmAction(t('nations.confirmTitle', { nation: name }), t('nations.confirmText', { n }), t('common.remove')))) return
  removeNation(plan, id)
  if (session.me === id) session.me = null
  if (session.assignNation === id) session.assignNation = session.me
  if (session.ownNation === id) session.ownNation = session.me
  toast(t('nations.removed', { name }), { label: t('common.undo'), run: () => undo.undo() })
}

function setColor(id: string, c: string | null) {
  if (c) updateNation(plan, id, { color: c })
  colorFor.value = null
}
</script>

<template>
  <PanelSection id="nations" :title="t('panel.nations')" :badge="roster.size ? t('nations.players', { n: players }) : undefined">
    <p v-if="!roster.size" class="empty-state">{{ t('nations.empty') }}</p>
    <ul class="rows" @mouseleave="planner?.focusNation(null)">
      <li v-for="n in roster.values()" :key="n.id" class="row nation-row" @mouseenter="planner?.focusNation(n.id)">
        <button class="dot-btn" :style="{ background: n.color }" :aria-label="t('nations.markerColour', { nation: catalog.byId.get(n.id)?.name ?? n.id })" :title="t('nations.markerTitle')" @click="colorFor = colorFor === n.id ? null : n.id" />
        <div class="nation-cell">
          <input
            class="row-name"
            :value="n.nickname"
            :placeholder="t('nations.noPlayer')"
            :aria-label="t('nations.playerOf', { nation: catalog.byId.get(n.id)?.name ?? n.id })"
            maxlength="24"
            @change="rename(n.id, $event)"
            @keydown.enter="($event.target as HTMLInputElement).blur()"
          />
          <small class="nation-sub">
            <span class="swatch" :style="{ background: catalog.byId.get(n.id)?.color }" />{{ catalog.byId.get(n.id)?.name }} · {{ t('nations.holds', { n: held.get(catalog.byId.get(n.id)?.index ?? -1) ?? 0 }) }}
          </small>
        </div>
        <span v-if="session.me === n.id" class="tag me" :title="t('nations.youTitle')">{{ t('nations.you') }}</span>
        <button
          class="count-btn"
          :disabled="!progress.get(n.id)?.ids.length"
          :title="progress.get(n.id)?.ids.length ? t('nations.progressTitle') : t('nations.noProgress')"
          @click="planner?.flyToProvinces(progress.get(n.id)?.ids ?? [])"
        >
          {{ progress.get(n.id) ? `${progress.get(n.id)!.done}/${progress.get(n.id)!.ids.length}` : '0' }}
        </button>
        <button class="icon-btn sm danger" :aria-label="t('nations.remove', { nation: catalog.byId.get(n.id)?.name ?? n.id })" :title="t('nations.removeTitle')" @click="remove(n.id)"><Trash2 :size="14" /></button>
        <div v-if="colorFor === n.id" class="row-popover">
          <ColorChooser :model-value="n.color" :label="t('nations.markerColour', { nation: catalog.byId.get(n.id)?.name ?? n.id })" @update:model-value="setColor(n.id, $event)" />
        </div>
      </li>
    </ul>
    <form class="add-nation" @submit.prevent="add">
      <NationSelect v-model="newNation" :label="t('nations.addLabel')" :placeholder="t('nations.addPlaceholder')" :exclude="[...roster.keys()]" />
      <input v-model="newNick" :placeholder="t('nations.nickPlaceholder')" :aria-label="t('nations.nickLabel')" maxlength="24" />
      <button class="btn" type="submit" :disabled="!newNation"><Plus :size="14" />{{ t('common.add') }}</button>
    </form>
  </PanelSection>
</template>
