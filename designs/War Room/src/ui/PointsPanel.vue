<script setup lang="ts">
import { Castle, ChevronRight, CircleCheck, RotateCcw } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { displayName, setDailyPoints } from '../../shared/schema'
import { usePoints } from '../composables/usePoints'
import { useYArray, useYMap } from '../composables/useY'
import { t } from '../i18n'
import { categoryLabel, classLabel, fmtNum, fmtPoints, kindLabel } from '../i18n/format'
import { toast } from '../state/feedback'
import { session } from '../state/session'
import { usePlanner } from './context'
import PanelSection from './PanelSection.vue'

/**
 * The point calculator: what each nation's planned conquests cost in the selected
 * phases (days), against the daily allowance × days. Planned provinces can be
 * marked as taken from here, like with the ownership tool.
 */
const { data, catalog, plan, undo, planner } = usePlanner()
const roster = useYMap(plan.nations)
const phases = useYArray(plan.phases)
const { byNation, scoped, scope, allowance, markTaken } = usePoints()
const expanded = ref<string | null>(null)

const phaseName = computed(() => new Map(phases.value.map((p, i) => [p.id, { n: i + 1, name: p.name }])))
const days = computed(() => Math.max(1, scope.value.phases.length))
/** While planning for a nation, its row comes first and stands out. */
const current = computed(() => (session.tool === 'assign' ? session.assignNation : null))

const rows = computed(() =>
  [...roster.value.values()]
    .filter((n) => byNation.value.has(n.id))
    .sort((a, b) => Number(b.id === current.value) - Number(a.id === current.value))
    .map((n) => {
      const p = scoped.value.get(n.id)!
      return {
        id: n.id,
        color: n.color,
        name: displayName(n, catalog.byId.get(n.id)?.name ?? n.id),
        p,
        done: p.items.filter((i) => i.done).length,
        free: p.items.filter((i) => i.ownerClass === null).length,
        over: p.over > 0 || p.days.some((d) => d.over),
        fill: p.limit ? Math.min(100, (p.used / p.limit) * 100) : 0,
        days: days.value > 1 ? p.days.map((d) => ({ ...d, ...phaseName.value.get(d.phaseId)! })) : [],
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

/** Add a day to the count or take it out; taking out the last one counts all days again. */
function toggleDay(id: string) {
  const cur = scope.value.all ? [] : scope.value.phases
  session.pointsPhases = cur.includes(id) ? cur.filter((p) => p !== id) : [...cur, id]
}

function pick(id: number) {
  session.selectedProvince = id
  planner.value?.flyToProvince(id)
}

function take(ids: number[], taken: boolean) {
  const n = markTaken(ids, taken)
  if (n) toast(t(taken ? 'points.markedTaken' : 'points.markedUndone', { n }), { label: t('common.undo'), run: () => undo.undo() })
}
</script>

<template>
  <PanelSection id="points" :title="t('panel.points')">
    <label class="field inline points-allowance">
      <span>{{ t('points.allowance') }}</span>
      <input type="number" min="0" step="0.5" inputmode="decimal" :value="allowance ?? ''" placeholder="–" @change="setAllowance" />
    </label>
    <p class="muted fine">{{ t('points.allowanceHint') }}</p>

    <div v-if="phases.length" class="points-scope" role="group" :aria-label="t('points.scope')">
      <span class="points-scope-label">{{ t('points.scope') }}</span>
      <button class="phase-chip" :aria-pressed="scope.all" :title="t('points.allDaysTitle')" @click="session.pointsPhases = []">{{ t('points.allDays') }}</button>
      <button
        v-for="(p, i) in phases"
        :key="p.id"
        class="phase-chip"
        :aria-pressed="!scope.all && scope.phases.includes(p.id)"
        :title="t('points.dayTitle', { name: p.name })"
        @click="toggleDay(p.id)"
      >
        <span class="phase-num">{{ i + 1 }}</span>{{ p.name }}
      </button>
    </div>
    <p v-if="allowance !== null && days > 1" class="muted fine points-limit">{{ t('points.limitDays', { max: fmtNum(allowance), n: days, total: fmtPoints(allowance * days) }) }}</p>

    <p v-if="!rows.length" class="empty-state">{{ t('points.empty') }}</p>
    <ul class="points-list">
      <li v-for="r in rows" :key="r.id" class="points-row" :class="{ over: r.over, current: r.id === current }">
        <button class="points-head" :aria-expanded="expanded === r.id" :title="t('points.details', { name: r.name })" @click="expanded = expanded === r.id ? null : r.id">
          <ChevronRight :size="14" class="points-chev" />
          <span class="dot" :style="{ background: r.color }" />
          <span class="points-name">{{ r.name }}</span>
          <span class="points-sum">{{ fmtPoints(r.p.used) }}<template v-if="r.p.limit !== null"> / {{ fmtNum(r.p.limit) }}</template></span>
        </button>
        <div v-if="r.p.limit !== null" class="points-bar" aria-hidden="true"><span :style="{ width: `${r.fill}%` }" /></div>
        <ul v-if="r.days.length" class="points-days">
          <li v-for="d in r.days" :key="d.phaseId" class="points-day" :class="{ over: d.over }" :title="d.name">
            <span class="phase-num">{{ d.n }}</span>{{ fmtNum(d.used) }}<template v-if="allowance !== null">/{{ fmtNum(allowance) }}</template>
          </li>
        </ul>
        <p class="points-meta">
          {{ t('points.provinces', { n: r.p.items.length }) }}
          <template v-if="r.done"> · {{ t('points.done', { n: r.done }) }}</template>
          <template v-if="r.free"> · {{ t('points.free', { n: r.free }) }}</template>
          <span v-if="r.p.unscheduled" :title="t('points.unscheduledTitle')"> · {{ t('points.unscheduled', { points: fmtPoints(r.p.unscheduled) }) }}</span>
          <strong v-if="r.p.over" class="points-over"> · {{ t('points.over', { points: fmtPoints(r.p.over) }) }}</strong>
          <strong v-else-if="r.over" class="points-over"> · {{ t('points.dayOver') }}</strong>
        </p>
        <template v-if="expanded === r.id">
          <ul class="points-items">
            <li v-for="i in r.items" :key="i.province" class="points-item" :class="{ done: i.done }">
              <button class="points-item-main" :title="i.phaseId ? phaseName.get(i.phaseId)?.name : t('prov.anyTime')" @click="pick(i.province)">
                <span class="kind-sym" :class="`k${data.provinces[i.province].city}`" :title="kindLabel(data.provinces[i.province].city)" />
                <span class="points-item-name">{{ data.provinces[i.province].name }}</span>
                <span class="points-item-cat" :title="`${categoryLabel(i.category)} · ${classLabel(i.ownerClass)}`">{{ categoryLabel(i.category) }} · {{ classLabel(i.ownerClass) }}</span>
                <b>{{ fmtPoints(i.points) }}</b>
              </button>
              <button
                class="icon-btn sm points-take"
                :aria-pressed="i.done"
                :title="i.done ? t('points.undoTaken', { name: data.provinces[i.province].name }) : t('points.markTaken', { name: data.provinces[i.province].name })"
                :aria-label="i.done ? t('points.undoTaken', { name: data.provinces[i.province].name }) : t('points.markTaken', { name: data.provinces[i.province].name })"
                @click="take([i.province], !i.done)"
              >
                <CircleCheck v-if="i.done" :size="14" />
                <Castle v-else :size="14" />
              </button>
            </li>
          </ul>
          <div class="points-actions">
            <button v-if="r.done < r.items.length" class="btn" :title="t('points.markAllTitle')" @click="take(r.items.map((i) => i.province), true)">
              <Castle :size="14" />{{ t('points.markAll', { n: r.items.length - r.done }) }}
            </button>
            <button v-if="r.done" class="btn" :title="t('points.undoAllTitle')" @click="take(r.items.map((i) => i.province), false)">
              <RotateCcw :size="14" />{{ t('points.undoAll') }}
            </button>
          </div>
        </template>
      </li>
    </ul>
  </PanelSection>
</template>
