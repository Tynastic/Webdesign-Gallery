<script setup lang="ts">
import { LocateFixed, Lock, LockOpen, Trash2 } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { deleteObjects, displayName, distanceFactor, updateObject, type ArrowVariant, type FrontVariant, type PlanObject, type ZoneVariant } from '../../shared/schema'
import { useYArray, useYMap } from '../composables/useY'
import { locale, t } from '../i18n'
import { kmToRadius, radiusToKm } from '../map/geo'
import { OBJECTIVE_ICONS, UNIT_TYPES, objectiveLabel, objectiveSvg, unitLabel, unitSvg } from '../render/icons'
import { toast } from '../state/feedback'
import { session } from '../state/session'
import ColorChooser from './ColorChooser.vue'
import { usePlanner } from './context'
import Segmented from './Segmented.vue'
import { toolInfo, toolLabel } from './toolCatalog'

const props = defineProps<{ object: PlanObject }>()
const { catalog, plan, undo, planner } = usePlanner()
const layers = useYMap(plan.layers)
const roster = useYMap(plan.nations)
const phases = useYArray(plan.phases)

const o = computed(() => props.object)
const patch = (p: Partial<PlanObject>) => updateObject(plan, o.value.id, p)
const info = computed(() => toolInfo(o.value.type))
const author = computed(() => {
  const nation = catalog.byId.get(o.value.author)
  return nation ? displayName(roster.value.get(nation.id), nation.name) : ''
})
const meta = useYMap(plan.meta)
/** Range radius shown and edited in km (converted at the circle's latitude, calibrated). */
const radiusKm = computed(() => {
  void meta.value
  return o.value.radius ? Math.round(radiusToKm(o.value.radius, o.value.points[0][1], distanceFactor(plan))) : 0
})
function setRadiusKm(e: Event) {
  const km = Number((e.target as HTMLInputElement).value)
  if (km > 0) patch({ radius: Math.max(1, Math.round(kmToRadius(km, o.value.points[0][1], distanceFactor(plan)))) })
}
const sortedLayers = computed(() => [...layers.value.values()].sort((a, b) => a.order - b.order))

const color = computed({ get: () => o.value.color, set: (c) => c && patch({ color: c }) })
const variant = computed({ get: () => o.value.variant, set: (v: string) => patch({ variant: v }) })

const labelInput = ref<HTMLInputElement | null>(null)
onMounted(() => {
  // A freshly placed note is useless until it has text: put the caret there.
  if (o.value.type === 'text' && o.value.label === t('obj.noteDefault') && Date.now() - o.value.createdAt < 2000) {
    labelInput.value?.focus()
    labelInput.value?.select()
  }
})

const variants = computed<Partial<Record<PlanObject['type'], { value: string; label: string }[]>>>(() => ({
  arrow: [
    { value: 'attack' satisfies ArrowVariant, label: t('variant.attack') },
    { value: 'move' satisfies ArrowVariant, label: t('variant.move') },
  ],
  front: [
    { value: 'front' satisfies FrontVariant, label: t('variant.front') },
    { value: 'defense' satisfies FrontVariant, label: t('variant.defense') },
  ],
  zone: [
    { value: 'target' satisfies ZoneVariant, label: t('variant.target') },
    { value: 'danger' satisfies ZoneVariant, label: t('variant.danger') },
    { value: 'hold' satisfies ZoneVariant, label: t('variant.hold') },
  ],
}))

function remove() {
  deleteObjects(plan, [o.value.id])
  session.selectedObject = null
  toast(t('toast.deleted', { what: toolLabel(o.value.type) }), { label: t('common.undo'), run: () => undo.undo() })
}
</script>

<template>
  <div class="inspector">
    <div class="insp-head">
      <span class="insp-icon" :style="{ color: o.color }"><component :is="info.icon" :size="18" /></span>
      <div class="insp-title">
        <strong>{{ toolLabel(o.type) }}</strong>
        <small class="muted">{{ author ? t('obj.by', { name: author }) : t('obj.unknownAuthor') }}</small>
      </div>
      <button class="icon-btn" :title="t('obj.zoom')" :aria-label="t('obj.zoom')" @click="planner?.flyToObject(o.id)"><LocateFixed :size="16" /></button>
      <button
        class="icon-btn"
        :class="{ on: o.locked }"
        :title="o.locked ? t('obj.unlock') : t('obj.lock')"
        :aria-label="o.locked ? t('obj.unlockAria') : t('obj.lockAria')"
        :aria-pressed="o.locked"
        @click="patch({ locked: !o.locked })"
      >
        <component :is="o.locked ? Lock : LockOpen" :size="16" />
      </button>
      <button class="icon-btn danger" :disabled="o.locked" :title="t('common.withKeys', { label: t('common.delete'), keys: t('key.del') })" :aria-label="t('common.delete')" @click="remove"><Trash2 :size="16" /></button>
    </div>

    <label class="field">
      <span>{{ o.type === 'text' ? t('field.text') : t('field.label') }}</span>
      <input
        ref="labelInput"
        :value="o.label"
        :placeholder="o.type === 'arrow' ? t('field.arrowPlaceholder') : t('field.optional')"
        maxlength="80"
        @input="patch({ label: ($event.target as HTMLInputElement).value })"
      />
    </label>

    <div v-if="variants[o.type]" class="field">
      <span>{{ t('field.style') }}</span>
      <Segmented v-model="variant" :options="variants[o.type]!" :label="t('field.style')" />
    </div>

    <div v-if="o.type === 'unit'" class="field">
      <span>{{ t('field.unitType') }}</span>
      <div class="icon-pick" role="radiogroup" :aria-label="t('field.unitType')">
        <button
          v-for="u in UNIT_TYPES"
          :key="u"
          class="icon-pick-btn"
          role="radio"
          :aria-checked="o.variant === u"
          :title="unitLabel(u)"
          :aria-label="unitLabel(u)"
          @click="patch({ variant: u })"
          v-html="unitSvg(u, o.color)"
        />
      </div>
    </div>
    <label v-if="o.type === 'unit'" class="field inline">
      <span>{{ t('field.strength') }}</span>
      <input
        type="number"
        min="0"
        max="999"
        :value="o.count ?? ''"
        placeholder="—"
        @input="patch({ count: Number(($event.target as HTMLInputElement).value) || undefined })"
      />
    </label>

    <div v-if="o.type === 'objective'" class="field">
      <span>{{ t('field.icon') }}</span>
      <div class="icon-pick" role="radiogroup" :aria-label="t('field.icon')">
        <button
          v-for="i in OBJECTIVE_ICONS"
          :key="i"
          class="icon-pick-btn round"
          role="radio"
          :aria-checked="o.variant === i"
          :title="objectiveLabel(i)"
          :aria-label="objectiveLabel(i)"
          @click="patch({ variant: i })"
          v-html="objectiveSvg(i, o.color)"
        />
      </div>
    </div>

    <label v-if="o.type === 'arrow'" class="field">
      <span>{{ t('field.thickness') }}</span>
      <input
        type="range"
        min="0"
        max="100"
        :value="Math.round(Math.log((o.width ?? 40) / 4) / Math.log(1.06))"
        @input="patch({ width: Math.round(4 * Math.pow(1.06, Number(($event.target as HTMLInputElement).value))) })"
      />
    </label>
    <label v-if="o.type === 'range'" class="field inline">
      <span>{{ t('field.radiusKm') }}</span>
      <input type="number" min="1" :value="radiusKm" :lang="locale" @change="setRadiusKm" />
      <small class="muted">≈ km</small>
    </label>

    <div class="field">
      <span>{{ t('field.colour') }}</span>
      <ColorChooser v-model="color" :label="t('field.colour')" />
    </div>

    <div class="field-row">
      <label class="field">
        <span>{{ t('field.layer') }}</span>
        <select :value="o.layerId" @change="patch({ layerId: ($event.target as HTMLSelectElement).value })">
          <option v-for="l in sortedLayers" :key="l.id" :value="l.id">{{ l.name }}</option>
        </select>
      </label>
      <label class="field">
        <span>{{ t('field.phase') }}</span>
        <select :value="o.phaseId ?? ''" @change="patch({ phaseId: ($event.target as HTMLSelectElement).value || null })">
          <option value="">{{ t('field.allPhases') }}</option>
          <option v-for="p in phases" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </label>
    </div>
  </div>
</template>
