<script setup lang="ts">
import { Eraser, RotateCcw } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { distanceFactor, setDistanceFactor, type ArrowVariant, type FrontVariant, type ZoneVariant } from '../../shared/schema'
import { useYArray, useYMap } from '../composables/useY'
import { t } from '../i18n'
import { toast } from '../state/feedback'
import { OBJECTIVE_ICONS, UNIT_TYPES, objectiveLabel, objectiveSvg, unitLabel, unitSvg } from '../render/icons'
import { session } from '../state/session'
import ColorChooser from './ColorChooser.vue'
import { usePlanner } from './context'
import NationSelect from './NationSelect.vue'
import Segmented from './Segmented.vue'
import { toolLabel } from './toolCatalog'

const { catalog, plan, undo } = usePlanner()
const roster = useYMap(plan.nations)
const layers = useYMap(plan.layers)
const phases = useYArray(plan.phases)

const drawing = computed(() => !['select', 'assign', 'own', 'ping', 'measure'].includes(session.tool))

// ---------- measure: travel speed and plan-wide calibration ----------
const meta = useYMap(plan.meta)
const factor = computed(() => (meta.value, distanceFactor(plan)))
const calibrating = ref(false)
const realKm = ref<number | null>(null)
function setSpeed(e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  session.measureSpeed = v > 0 ? v : null
}
function applyCalibration() {
  if (!session.measuredKm || !realKm.value || realKm.value <= 0) return
  undo.stopCapturing()
  setDistanceFactor(plan, Math.round((realKm.value / session.measuredKm) * 1000) / 1000)
  undo.stopCapturing()
  calibrating.value = false
  realKm.value = null
  toast(t('toast.calibrated'), { label: t('common.undo'), run: () => undo.undo() })
}
function resetCalibration() {
  undo.stopCapturing()
  setDistanceFactor(plan, 1)
  undo.stopCapturing()
}

const rosterList = computed(() =>
  [...roster.value.values()].map((n) => {
    const nation = catalog.byId.get(n.id)
    return { id: n.id, color: n.color, mapColor: nation?.color ?? n.color, label: n.nickname || nation?.name || n.id, title: n.nickname ? `${n.nickname} (${nation?.name})` : (nation?.name ?? n.id) }
  }),
)
const paintTarget = computed({
  get: () => (session.tool === 'assign' ? session.assignNation : session.ownNation),
  set: (v: string | null) => (session.tool === 'assign' ? (session.assignNation = v) : (session.ownNation = v)),
})
/** The ownership target when it is a nation outside the plan's roster. */
const otherOwner = computed(() => (session.ownNation && !roster.value.has(session.ownNation) ? session.ownNation : ''))
function pickOtherOwner(id: string) {
  if (id) session.ownNation = id
}
const target = computed(() => {
  const layer = layers.value.get(session.activeLayer)?.name ?? '?'
  const phase = phases.value.find((p) => p.id === session.activePhase)?.name
  return phase ? `${layer} · ${phase}` : layer
})
const assignPhase = computed(() => phases.value.find((p) => p.id === session.activePhase)?.name)

const arrows = computed<{ value: ArrowVariant; label: string }[]>(() => [
  { value: 'attack', label: t('variant.attack') },
  { value: 'move', label: t('variant.move') },
])
const fronts = computed<{ value: FrontVariant; label: string }[]>(() => [
  { value: 'front', label: t('variant.front') },
  { value: 'defense', label: t('variant.defense') },
])
const zones = computed<{ value: ZoneVariant; label: string }[]>(() => [
  { value: 'target', label: t('variant.target') },
  { value: 'danger', label: t('variant.danger') },
  { value: 'hold', label: t('variant.hold') },
])
const iconColor = computed(() => session.drawColor ?? (session.me ? roster.value.get(session.me)?.color : undefined) ?? '#ff5a4e')
</script>

<template>
  <div v-if="session.tool !== 'select' && session.tool !== 'ping'" class="tool-options" role="toolbar" :aria-label="t('options.aria', { tool: toolLabel(session.tool) })">
    <span class="to-title">{{ toolLabel(session.tool) }}</span>

    <template v-if="session.tool === 'assign' || session.tool === 'own'">
      <div class="player-pick" role="radiogroup" :aria-label="session.tool === 'assign' ? t('options.planFor') : t('options.conqueredBy')">
        <button
          v-for="(n, i) in rosterList"
          :key="n.id"
          class="pick-chip"
          role="radio"
          :aria-checked="paintTarget === n.id"
          :title="`${n.title} (${i + 1})`"
          @click="paintTarget = n.id"
        >
          <span class="dot" :style="{ background: session.tool === 'own' ? n.mapColor : n.color }" />{{ n.label }}<kbd v-if="i < 9">{{ i + 1 }}</kbd>
        </button>
        <button
          class="pick-chip"
          role="radio"
          :aria-checked="paintTarget === null"
          :title="session.tool === 'assign' ? t('options.eraseTitle') : t('options.restoreTitle')"
          @click="paintTarget = null"
        >
          <component :is="session.tool === 'assign' ? Eraser : RotateCcw" :size="14" />{{ session.tool === 'assign' ? t('options.erase') : t('options.restore') }}<kbd>0</kbd>
        </button>
      </div>
      <NationSelect
        v-if="session.tool === 'own'"
        class="to-select"
        :model-value="otherOwner"
        :label="t('options.otherNationLabel')"
        :placeholder="t('options.otherNation')"
        :exclude="[...roster.keys()]"
        @update:model-value="pickOtherOwner"
      />
      <span v-if="session.tool === 'assign' && assignPhase" class="to-target" :title="t('options.phaseTitle')">{{ t('options.phase', { name: assignPhase }) }}</span>
    </template>

    <Segmented v-else-if="session.tool === 'arrow'" v-model="session.arrowVariant" :options="arrows" :label="t('options.arrowType')" />
    <Segmented v-else-if="session.tool === 'front'" v-model="session.frontVariant" :options="fronts" :label="t('options.lineType')" />
    <Segmented v-else-if="session.tool === 'zone'" v-model="session.zoneVariant" :options="zones" :label="t('options.zoneType')" />

    <div v-else-if="session.tool === 'unit'" class="icon-pick" role="radiogroup" :aria-label="t('options.unitType')">
      <button
        v-for="u in UNIT_TYPES"
        :key="u"
        class="icon-pick-btn"
        role="radio"
        :aria-checked="session.unitType === u"
        :title="unitLabel(u)"
        :aria-label="unitLabel(u)"
        @click="session.unitType = u"
        v-html="unitSvg(u, iconColor)"
      />
    </div>

    <div v-else-if="session.tool === 'objective'" class="icon-pick" role="radiogroup" :aria-label="t('options.objectiveIcon')">
      <button
        v-for="o in OBJECTIVE_ICONS"
        :key="o"
        class="icon-pick-btn round"
        role="radio"
        :aria-checked="session.objectiveIcon === o"
        :title="objectiveLabel(o)"
        :aria-label="objectiveLabel(o)"
        @click="session.objectiveIcon = o"
        v-html="objectiveSvg(o, iconColor)"
      />
    </div>

    <template v-if="session.tool === 'measure'">
      <label class="to-field" :title="t('options.speedTitle')">
        {{ t('options.speed') }}
        <input type="number" min="1" max="500" step="1" :value="session.measureSpeed ?? ''" placeholder="—" @input="setSpeed" />
        km/h
      </label>
      <span class="to-sep" />
      <template v-if="calibrating">
        <label class="to-field">
          {{ t('options.calibrateLabel') }}
          <input v-model.number="realKm" type="number" min="1" autofocus @keydown.enter="applyCalibration" />
        </label>
        <button class="btn" :disabled="!realKm" @click="applyCalibration">{{ t('options.calibrateApply') }}</button>
        <button class="icon-btn sm" :aria-label="t('common.cancel')" @click="calibrating = false">✕</button>
      </template>
      <template v-else>
        <button
          class="btn"
          :disabled="!session.measuredKm"
          :title="session.measuredKm ? t('options.calibrateTitle') : t('options.measureFirst')"
          @click="calibrating = true"
        >
          {{ t('options.calibrate') }}
        </button>
        <span v-if="factor !== 1" class="to-target">{{ t('options.calibrated', { factor: factor.toLocaleString() }) }}</span>
        <button v-if="factor !== 1" class="btn" @click="resetCalibration">{{ t('options.calibrationReset') }}</button>
      </template>
    </template>

    <template v-if="drawing">
      <span class="to-sep" />
      <ColorChooser v-model="session.drawColor" auto :label="t('options.drawColour')" />
      <span class="to-sep" />
      <span class="to-target" :title="t('options.targetTitle')">→ {{ target }}</span>
    </template>
  </div>
</template>
