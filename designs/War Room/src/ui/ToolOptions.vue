<script setup lang="ts">
import { Check, Eraser, RotateCcw, Undo2, X } from 'lucide-vue-next'
import { computed, nextTick, ref, watch } from 'vue'
import { distanceFactor, setDistanceFactor, type ArrowVariant, type FrontVariant, type ZoneVariant } from '../../shared/schema'
import { useMatch } from '../composables/useMatch'
import { usePoints } from '../composables/usePoints'
import { useYArray, useYMap } from '../composables/useY'
import { t } from '../i18n'
import { fmtNum, fmtPoints } from '../i18n/format'
import { toast } from '../state/feedback'
import { OBJECTIVE_ICONS, UNIT_TYPES, objectiveLabel, objectiveSvg, unitLabel, unitSvg } from '../render/icons'
import { session, type PaintArea, type PlanMode } from '../state/session'
import ColorChooser from './ColorChooser.vue'
import { usePlanner } from './context'
import NationSelect from './NationSelect.vue'
import PickerMenu from './PickerMenu.vue'
import Segmented from './Segmented.vue'
import { toolLabel } from './toolCatalog'

const { plan, undo, planner } = usePlanner()
const { playerNations, label, myRole } = useMatch()
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

/** Nations with a player, my team first; a divider marks where the next team starts. */
const rosterList = computed(() =>
  playerNations.value.map((r, i, all) => {
    return {
      id: r.nation,
      color: r.color,
      label: r.player!.name,
      title: label(r.nation),
      team: r.team ?? 'none',
      newTeam: i > 0 && all[i - 1].team !== r.team,
    }
  }),
)
const paintTarget = computed({
  get: () => (session.tool === 'assign' ? session.assignNation : session.ownNation),
  set: (v: string | null) => (session.tool === 'assign' ? (session.assignNation = v) : (session.ownNation = v)),
})
/** From this many players on, each team's chips start a line of their own (they no longer fit in one row). */
const MANY_PLAYERS = 8
const pickRow = ref<HTMLElement | null>(null)
// The chip row scrolls when it holds many players: keep the chosen one in sight (number keys pick off-screen ones too).
watch(
  () => [session.tool, paintTarget.value],
  async () => {
    await nextTick()
    pickRow.value?.querySelector('[aria-checked="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  },
)

/** The ownership target when it is a nation without a chip (AI nations). */
const otherOwner = computed(() => (session.ownNation && !rosterList.value.some((n) => n.id === session.ownNation) ? session.ownNation : ''))
function pickOtherOwner(id: string) {
  if (id) session.ownNation = id
}
const target = computed(() => {
  const layer = layers.value.get(session.activeLayer)?.name ?? '?'
  const phase = phases.value.find((p) => p.id === session.activePhase)?.name
  return phase ? `${layer} · ${phase}` : layer
})
const { scoped, scope } = usePoints()
/** Points planned for the nation being painted for, in the phases (days) the counter covers. */
const assignPoints = computed(() => {
  if (session.tool !== 'assign' || session.planMode !== 'plan' || !session.assignNation) return null
  const p = scoped.value.get(session.assignNation)
  const used = p?.used ?? 0
  const max = p?.limit ?? null
  const days = scope.value.phases.length
  return {
    text: max === null ? t('options.points', { used: fmtPoints(used) }) : t('options.pointsOf', { used: fmtNum(used), max: fmtPoints(max) }),
    days: days > 1 ? t('options.pointsDays', { n: days }) : '',
    over: !!p && (p.over > 0 || p.days.some((d) => d.over)),
  }
})
const assignPhase = computed(() => phases.value.find((p) => p.id === session.activePhase)?.name)
const planModes = computed<{ value: PlanMode; label: string }[]>(() => [
  { value: 'plan', label: t('options.modePlan') },
  { value: 'taken', label: t('options.modeTaken') },
])

/** One province per click, or the whole territory (in "Mark taken" mode: the nation's whole day). */
const areas = computed<{ value: PaintArea; label: string }[]>(() => [
  { value: 'one', label: t('options.areaOne') },
  { value: 'all', label: taking.value ? t('options.areaDay') : t('options.areaTerritory') },
])
const taking = computed(() => session.tool === 'assign' && session.planMode === 'taken')

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
const iconColor = computed(() => session.drawColor ?? myRole.value?.color ?? '#f6f5f0')
</script>

<template>
  <div v-if="session.tool !== 'select' && session.tool !== 'ping'" class="tool-options" role="toolbar" :aria-label="t('options.aria', { tool: toolLabel(session.tool) })">
    <span class="to-title">{{ toolLabel(session.tool) }}</span>

    <template v-if="session.tool === 'assign' || session.tool === 'own'">
      <Segmented v-if="session.tool === 'assign'" v-model="session.planMode" :options="planModes" :label="t('options.planMode')" :title="t('options.planModeTitle')" />
      <Segmented v-model="session.paintArea" :options="areas" :label="t('options.area')" :title="taking ? t('options.areaTitleTaken') : t('options.areaTitle')" />
      <div
        v-if="session.tool === 'own' || session.planMode === 'plan'"
        ref="pickRow"
        class="player-pick"
        :class="{ many: rosterList.length > MANY_PLAYERS }"
        role="radiogroup" :aria-label="session.tool === 'assign' ? t('options.planFor') : t('options.conqueredBy')">
        <template v-for="(n, i) in rosterList" :key="n.id">
        <span v-if="n.newTeam" class="pick-sep" aria-hidden="true" />
        <button
          class="pick-chip"
          :class="`team-${n.team}`"
          role="radio"
          :aria-checked="paintTarget === n.id"
          :title="`${n.title} (${i + 1})`"
          @click="paintTarget = n.id"
        >
          <span class="dot" :style="{ background: n.color }" />{{ n.label }}<kbd v-if="i < 9">{{ i + 1 }}</kbd>
        </button>
        </template>
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
        :exclude="rosterList.map((n) => n.id)"
        @update:model-value="pickOtherOwner"
      />
      <span v-if="assignPoints" class="to-points" :class="{ over: assignPoints.over }" :title="t('options.pointsTitle')" role="status">{{ assignPoints.text }}<small v-if="assignPoints.days"> · {{ assignPoints.days }}</small></span>
      <span v-if="session.tool === 'assign' && session.planMode === 'taken'" class="to-target">{{ t('options.takenHelp') }}</span>
      <span v-if="session.tool === 'assign' && session.planMode === 'plan' && assignPhase" class="to-target" :title="t('options.phaseTitle')">{{ t('options.phase', { name: assignPhase }) }}</span>
    </template>

    <Segmented v-else-if="session.tool === 'arrow'" v-model="session.arrowVariant" :options="arrows" :label="t('options.arrowType')" />
    <Segmented v-else-if="session.tool === 'front'" v-model="session.frontVariant" :options="fronts" :label="t('options.lineType')" />
    <Segmented v-else-if="session.tool === 'zone'" v-model="session.zoneVariant" :options="zones" :label="t('options.zoneType')" />

    <PickerMenu v-else-if="session.tool === 'unit'" :label="t('options.unitType')">
      <template #current>
        <span class="picker-icon" v-html="unitSvg(session.unitType, iconColor)" />
        <span class="picker-text">{{ unitLabel(session.unitType) }}</span>
      </template>
      <div class="icon-pick" role="radiogroup" :aria-label="t('options.unitType')">
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
    </PickerMenu>

    <PickerMenu v-else-if="session.tool === 'objective'" :label="t('options.objectiveIcon')">
      <template #current>
        <span class="picker-icon round" v-html="objectiveSvg(session.objectiveIcon, iconColor)" />
        <span class="picker-text">{{ objectiveLabel(session.objectiveIcon) }}</span>
      </template>
      <div class="icon-pick" role="radiogroup" :aria-label="t('options.objectiveIcon')">
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
    </PickerMenu>

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

    <!-- A drawing or measurement in progress: what Enter, Backspace and Esc do, for touch screens. -->
    <template v-if="session.draft">
      <span class="to-sep" />
      <template v-if="session.draft.canUndo && session.tool !== 'range'">
        <button class="btn" :title="t('options.draftUndoTitle')" @click="planner?.command('undo')"><Undo2 :size="15" />{{ t('options.draftUndo') }}</button>
        <button class="btn primary" :disabled="!session.draft.canFinish" :title="t('options.draftFinishTitle')" @click="planner?.command('finish')"><Check :size="15" />{{ t('options.draftFinish') }}</button>
      </template>
      <button class="btn" :title="t('options.draftCancelTitle')" @click="planner?.command('cancel')"><X :size="15" />{{ t('common.cancel') }}</button>
    </template>

    <template v-if="drawing">
      <span class="to-sep" />
      <PickerMenu :label="t('options.drawColour')">
        <template #current>
          <span class="picker-swatch" :style="{ background: iconColor }" />
          <span v-if="session.drawColor === null" class="picker-text">{{ t('colour.nation') }}</span>
        </template>
        <ColorChooser v-model="session.drawColor" :nation-color="myRole?.color ?? null" :label="t('options.drawColour')" />
      </PickerMenu>
      <span class="to-sep" />
      <span class="to-target" :title="t('options.targetTitle')">→ {{ target }}</span>
    </template>
  </div>
</template>
