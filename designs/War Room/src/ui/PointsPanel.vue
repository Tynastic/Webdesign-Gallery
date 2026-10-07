<script setup lang="ts">
import { ChevronRight, CircleCheck } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { displayName, setDailyPoints } from '../../shared/schema'
import { usePoints } from '../composables/usePoints'
import { useYMap } from '../composables/useY'
import { t } from '../i18n'
import { categoryLabel, classLabel, fmtNum, fmtPoints, kindLabel } from '../i18n/format'
import { session } from '../state/session'
import { usePlanner } from './context'
import PanelSection from './PanelSection.vue'

/** The point calculator: what each nation's planned conquests cost, against the daily allowance. */
const { data, catalog, plan, undo, planner } = usePlanner()
const roster = useYMap(plan.nations)
const { byNation, allowance } = usePoints()
const expanded = ref<string | null>(null)

const rows = computed(() =>
  [...roster.value.values()]
    .filter((n) => byNation.value.has(n.id))
    .map((n) => {
      const p = byNation.value.get(n.id)!
      const max = allowance.value
      return {
        id: n.id,
        color: n.color,
        name: displayName(n, catalog.byId.get(n.id)?.name ?? n.id),
        p,
        over: max !== null && p.total > max ? p.total - max : 0,
        fill: max ? Math.min(100, (p.total / max) * 100) : 0,
        items: [...p.items].sort((a, b) => b.points - a.points || data.provinces[a.province].name.localeCompare(data.provinces[b.province].name)),
      }
    }),
)

function setAllowance(e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  undo.stopCapturing()
  setDailyPoints(plan, v > 0 ? v : null)
  undo.stopCapturing()
}

function pick(id: number) {
  session.selectedProvince = id
  planner.value?.flyToProvince(id)
}
</script>

<template>
  <PanelSection id="points" :title="t('panel.points')">
    <label class="field inline points-allowance">
      <span>{{ t('points.allowance') }}</span>
      <input type="number" min="0" step="0.5" inputmode="decimal" :value="allowance ?? ''" placeholder="–" @change="setAllowance" />
    </label>
    <p class="muted fine">{{ t('points.allowanceHint') }}</p>
    <p v-if="!rows.length" class="empty-state">{{ t('points.empty') }}</p>
    <ul class="points-list">
      <li v-for="r in rows" :key="r.id" class="points-row" :class="{ over: r.over }">
        <button class="points-head" :aria-expanded="expanded === r.id" :title="t('points.details', { name: r.name })" @click="expanded = expanded === r.id ? null : r.id">
          <ChevronRight :size="14" class="points-chev" />
          <span class="dot" :style="{ background: r.color }" />
          <span class="points-name">{{ r.name }}</span>
          <span class="points-sum">{{ fmtPoints(r.p.total) }}<template v-if="allowance !== null"> / {{ fmtNum(allowance) }}</template></span>
        </button>
        <div v-if="allowance !== null" class="points-bar" aria-hidden="true"><span :style="{ width: `${r.fill}%` }" /></div>
        <p class="points-meta">
          {{ t('points.provinces', { n: r.p.items.length }) }}
          <template v-if="r.p.done"> · {{ t('points.done', { n: r.p.done }) }}</template>
          <template v-if="r.p.free"> · {{ t('points.free', { n: r.p.free }) }}</template>
          <strong v-if="r.over" class="points-over"> · {{ t('points.over', { points: fmtPoints(r.over) }) }}</strong>
        </p>
        <ul v-if="expanded === r.id" class="points-items">
          <li v-for="i in r.items" :key="i.province">
            <button class="points-item" :class="{ done: i.done }" @click="pick(i.province)">
              <span class="kind-sym" :class="`k${data.provinces[i.province].city}`" :title="kindLabel(data.provinces[i.province].city)" />
              <span class="points-item-name">{{ data.provinces[i.province].name }}</span>
              <CircleCheck v-if="i.done" :size="13" class="points-done" />
              <span class="points-item-cat" :title="`${categoryLabel(i.category)} · ${classLabel(i.ownerClass)}`">{{ categoryLabel(i.category) }} · {{ classLabel(i.ownerClass) }}</span>
              <b>{{ fmtPoints(i.points) }}</b>
            </button>
          </li>
        </ul>
      </li>
    </ul>
  </PanelSection>
</template>
