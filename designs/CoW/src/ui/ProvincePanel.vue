<script setup lang="ts">
import { CircleCheck, LocateFixed, RotateCcw, X } from 'lucide-vue-next'
import { computed } from 'vue'
import { assignProvinces, displayName, setOwners } from '../../shared/schema'
import { useYArray, useYMap } from '../composables/useY'
import { t } from '../i18n'
import { session } from '../state/session'
import { usePlanner } from './context'
import NationSelect from './NationSelect.vue'

const props = defineProps<{ id: number }>()
const { data, catalog, plan, undo, planner } = usePlanner()
const roster = useYMap(plan.nations)
const phases = useYArray(plan.phases)
const assignments = useYMap(plan.assignments)
const ownership = useYMap(plan.ownership)

const province = computed(() => data.provinces[props.id])
const owners = computed(() => catalog.owners(ownership.value.entries()))
const start = computed(() => catalog.startOf(props.id))
const owner = computed(() => catalog.list[owners.value[props.id]])
const conquered = computed(() => owner.value.id !== start.value.id)
const ownerName = computed(() => displayName(roster.value.get(owner.value.id), owner.value.name))
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

const neighbors = computed(() =>
  province.value.neighbors
    .map((id) => {
      const o = catalog.list[owners.value[id]]
      const planned = roster.value.get(assignments.value.get(String(id))?.nation ?? '')
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
        <small class="muted">{{ ownerName }}<template v-if="conquered"> · {{ t('prov.conqueredFrom', { nation: start.name }) }}</template></small>
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

    <div class="assign-box" :class="{ achieved }" :style="{ '--c': roster.get(plannedModel)?.color ?? 'transparent' }">
      <div class="field">
        <span>{{ t('prov.planned') }} <small class="muted">· {{ t('prov.plannedHint') }}</small></span>
        <NationSelect v-model="plannedModel" :label="t('prov.plannedLabel')" :placeholder="t('prov.nobody')" roster-only />
      </div>
      <p v-if="!roster.size" class="muted fine">{{ t('prov.noNations') }}</p>
      <p v-if="achieved" class="done-text"><CircleCheck :size="15" />{{ t('prov.taken', { name: ownerName }) }}</p>
      <div v-if="assignment && phases.length" class="field">
        <span>{{ t('prov.inPhase') }}</span>
        <select v-model="phaseModel" :aria-label="t('prov.phaseAria')">
          <option value="">{{ t('prov.anyTime') }}</option>
          <option v-for="p in phases" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </div>
    </div>

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
        <button class="chip" :class="{ foreign: n.foreign }" :title="n.planned ? t('prov.plannedFor', { name: n.planned.nickname || n.nation }) : n.foreign ? t('prov.heldByNation', { nation: n.nation }) : ''" @click="pick(n.id)">
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
