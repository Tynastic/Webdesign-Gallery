<script setup lang="ts">
import { Castle, CircleCheck, LocateFixed, RotateCcw, X } from 'lucide-vue-next'
import { computed } from 'vue'
import { assignProvinces, setOwners } from '../../shared/schema'
import { useMatch } from '../composables/useMatch'
import { usePoints } from '../composables/usePoints'
import { useYArray, useYMap } from '../composables/useY'
import { t } from '../i18n'
import { categoryLabel, classLabel, fmtNum, fmtPoints, kindLabel, resourceLabel, teamLabel } from '../i18n/format'
import { session } from '../state/session'
import { usePlanner } from './context'
import NationSelect from './NationSelect.vue'
import ResourceIcon from './ResourceIcon.vue'

const props = defineProps<{ id: number }>()
const { data, catalog, plan, undo, planner, owners } = usePlanner()
const { match, role, label, playersTotal } = useMatch()
const phases = useYArray(plan.phases)
const assignments = useYMap(plan.assignments)

const province = computed(() => data.provinces[props.id])
const start = computed(() => catalog.startOf(props.id))
const owner = computed(() => catalog.list[owners.value[props.id]])
const conquered = computed(() => owner.value.id !== start.value.id)
const ownerName = computed(() => label(owner.value.id))
/** Team of the holder ("Axis"), or "AI" for nations without a player. */
const ownerSide = computed(() => {
  const r = role(owner.value.id)
  return r?.player ? (r.team ? teamLabel(r.team) : '') : t('match.ai')
})
const capitalOf = computed(() => (catalog.capitals.has(props.id) ? start.value.name : null))
const assignment = computed(() => assignments.value.get(String(props.id)))
const achieved = computed(() => !!assignment.value && assignment.value.nation === owner.value.id)

function edit(fn: () => void) {
  undo.stopCapturing()
  fn()
  undo.stopCapturing()
}

const ownerModel = computed({
  get: () => owner.value.id,
  set: (v: string) => v && edit(() => setOwners(plan, [{ province: props.id, nation: v, original: start.value.id }])),
})
const plannedModel = computed({
  get: () => assignment.value?.nation ?? '',
  set: (v: string) => edit(() => assignProvinces(plan, [props.id], v || null, assignment.value?.phaseId ?? session.activePhase)),
})
const phaseModel = computed({
  get: () => assignment.value?.phaseId ?? '',
  set: (v: string) => assignment.value && edit(() => assignProvinces(plan, [props.id], assignment.value!.nation, v || null)),
})

// ---------- production and conquest points ----------
const { costFor, markTaken } = usePoints()
/** The price for the planned nation, or for my own nation while nothing is planned here. */
const cost = computed(() => {
  const attacker = assignment.value?.nation ?? session.me
  if (!attacker || (!assignment.value && owner.value.id === attacker)) return null
  const c = costFor(props.id, attacker)
  const name = label(attacker)
  return { ...c, text: t('points.costLine', { points: fmtPoints(c.points), name }), rule: costRule(c) }
})
/** How the price comes about, e.g. "Class 2 · city 5 × ½". */
function costRule(c: ReturnType<typeof costFor>): string {
  if (!c.ownerClass) return c.points ? '' : t('points.freeRule')
  if (c.category === 'capital') return t('points.capitalRule')
  const base = t(province.value.city ? 'points.cityBase' : 'points.provinceBase', { points: fmtNum(c.points * (c.half ? 2 : 1)) })
  return `${classLabel(c.ownerClass)} · ${base}${c.half ? ' × ½' : ''}`
}

const neighbors = computed(() =>
  province.value.neighbors
    .map((id) => {
      const o = catalog.list[owners.value[id]]
      const nation = assignments.value.get(String(id))?.nation
      const planned = nation ? { name: label(nation), color: match.value.colorOf(nation) } : undefined
      return { id, name: data.provinces[id].name, color: o.color, nation: o.id, foreign: o.id !== owner.value.id, planned }
    })
    .sort((a, b) => Number(b.foreign) - Number(a.foreign) || a.name.localeCompare(b.name)),
)
const isBorder = computed(() => neighbors.value.some((n) => n.foreign))

function pick(id: number) {
  session.selectedProvince = id
  planner.value?.flyToProvince(id)
}
</script>

<template>
  <div class="province">
    <div class="insp-head">
      <span class="swatch lg" :style="{ background: owner.color }" />
      <div class="insp-title">
        <strong class="province-name">{{ province.name }}</strong>
        <small class="muted">{{ ownerName }}<template v-if="ownerSide"> · {{ ownerSide }}</template><template v-if="conquered"> · {{ t('prov.conqueredFrom', { nation: start.name }) }}</template></small>
      </div>
      <button class="icon-btn" :title="t('prov.zoom')" :aria-label="t('prov.zoom')" @click="planner?.flyToProvince(id)"><LocateFixed :size="16" /></button>
      <button class="icon-btn" :title="t('prov.deselect')" :aria-label="t('prov.deselect')" @click="session.selectedProvince = null"><X :size="16" /></button>
    </div>

    <div class="field">
      <span>{{ t('prov.heldBy') }} <small class="muted">· {{ t('prov.heldByHint') }}</small></span>
      <div class="field-inline">
        <NationSelect v-model="ownerModel" :label="t('prov.currentOwner')" />
        <button
          v-if="conquered"
          class="icon-btn"
          :title="t('prov.restoreTitle', { nation: start.name })"
          :aria-label="t('prov.restoreAria', { nation: start.name })"
          @click="edit(() => setOwners(plan, [{ province: id, nation: null, original: start.id }]))"
        >
          <RotateCcw :size="16" />
        </button>
      </div>
    </div>

    <div class="assign-box" :class="{ achieved }" :style="{ '--c': plannedModel ? match.colorOf(plannedModel) : 'transparent' }">
      <div class="field">
        <span>{{ t('prov.planned') }} <small class="muted">· {{ t('prov.plannedHint') }}</small></span>
        <NationSelect v-model="plannedModel" :label="t('prov.plannedLabel')" :placeholder="t('prov.nobody')" players-only />
      </div>
      <p v-if="!playersTotal" class="muted fine">{{ t('prov.noNations') }}</p>
      <p v-if="cost" class="cost-line" :title="t('points.costTitle')">
        <strong>{{ cost.text }}</strong> · {{ categoryLabel(cost.category) }}<template v-if="cost.rule"> · {{ cost.rule }}</template>
      </p>
      <p v-if="achieved" class="done-text">
        <CircleCheck :size="15" />{{ t('prov.taken', { name: ownerName }) }}
        <button class="icon-btn sm" :title="t('prov.undoTaken', { nation: start.name })" :aria-label="t('prov.undoTaken', { nation: start.name })" @click="markTaken([id], false)">
          <RotateCcw :size="14" />
        </button>
      </p>
      <button v-else-if="assignment" class="btn mark-taken" :title="t('prov.markTakenTitle')" @click="markTaken([id], true)">
        <Castle :size="14" />{{ t('prov.markTaken', { name: role(assignment.nation)?.player?.name || catalog.byId.get(assignment.nation)?.name || assignment.nation }) }}
      </button>
      <div v-if="assignment && phases.length" class="field">
        <span>{{ t('prov.inPhase') }}</span>
        <select v-model="phaseModel" :aria-label="t('prov.phaseAria')">
          <option value="">{{ t('prov.anyTime') }}</option>
          <option v-for="p in phases" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </div>
    </div>

    <h3 class="sub">{{ t('prov.production') }}</h3>
    <div class="prod-tags">
      <span class="tag kind-tag" :class="{ city: province.city }"><span class="kind-sym" :class="`k${province.city}`" />{{ kindLabel(province.city) }}</span>
      <span v-if="capitalOf" class="tag capital-tag" :title="t('prov.capitalTitle', { nation: capitalOf })">★ {{ t('prov.capital') }}</span>
      <span v-if="province.core" class="tag" :title="t('prov.coreTitle', { nation: start.name })">{{ t('prov.core') }}</span>
      <span v-else class="tag warn" :title="t('prov.nonCoreTitle')">{{ t('prov.nonCore') }}</span>
    </div>
    <p v-if="province.res" class="prod">
      <ResourceIcon :res="province.res" :size="18" />
      <span>{{ resourceLabel(province.res) }}</span>
      <strong>{{ fmtNum(province.amount) }}</strong>
    </p>
    <p v-else class="prod muted">{{ t('prov.noResource') }}</p>

    <dl class="facts">
      <dt>{{ t('prov.status') }}</dt>
      <dd>
        <span v-if="!neighbors.length" class="tag">{{ t('prov.island') }}</span>
        <span v-else-if="isBorder" class="tag warn">{{ t('prov.front') }}</span>
        <span v-else class="tag">{{ t('prov.hinterland') }}</span>
      </dd>
      <dt>{{ t('prov.start') }}</dt>
      <dd>{{ start.name }}</dd>
    </dl>

    <h3 class="sub">{{ t('prov.neighbours') }} <span class="muted">({{ neighbors.length }})</span></h3>
    <ul v-if="neighbors.length" class="chips">
      <li v-for="n in neighbors" :key="n.id">
        <button class="chip" :class="{ foreign: n.foreign }" :title="n.planned ? t('prov.plannedFor', { name: n.planned.name }) : n.foreign ? t('prov.heldByNation', { nation: n.nation }) : ''" @click="pick(n.id)">
          <span class="swatch" :style="{ background: n.color }" />
          {{ n.name }}
          <span v-if="n.foreign" class="chip-tag">{{ n.nation }}</span>
          <span v-if="n.planned" class="dot" :style="{ background: n.planned.color }" />
        </button>
      </li>
    </ul>
    <p v-else class="muted">{{ t('prov.noNeighbours') }}</p>
  </div>
</template>
