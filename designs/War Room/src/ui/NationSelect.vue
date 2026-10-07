<script setup lang="ts">
import { computed } from 'vue'
import { displayName } from '../../shared/schema'
import { useYMap } from '../composables/useY'
import { t } from '../i18n'
import { usePlanner } from './context'

/**
 * Native <select> of nations: the plan's nations first, then all others A–Z.
 * Native on purpose: searchable by typing on desktop and a proper picker on phones.
 */
const props = withDefaults(defineProps<{ label: string; placeholder?: string; exclude?: string[]; rosterOnly?: boolean }>(), {
  placeholder: '',
  exclude: () => [],
  rosterOnly: false,
})
const model = defineModel<string>({ required: true })

const { catalog, plan } = usePlanner()
const roster = useYMap(plan.nations)
const inPlan = computed(() =>
  [...roster.value.values()].filter((n) => !props.exclude.includes(n.id)).map((n) => ({ id: n.id, text: displayName(n, catalog.byId.get(n.id)?.name ?? n.id) })),
)
const others = computed(() => catalog.sorted.filter((n) => !roster.value.has(n.id) && !props.exclude.includes(n.id)))
</script>

<template>
  <select v-model="model" :aria-label="label">
    <option v-if="placeholder" value="">{{ placeholder }}</option>
    <optgroup v-if="inPlan.length" :label="t('select.inPlan')">
      <option v-for="n in inPlan" :key="n.id" :value="n.id">{{ n.text }}</option>
    </optgroup>
    <optgroup v-if="!rosterOnly && others.length" :label="inPlan.length ? t('select.other') : t('select.nations')">
      <option v-for="n in others" :key="n.id" :value="n.id">{{ n.name }}</option>
    </optgroup>
  </select>
</template>
