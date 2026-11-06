<script setup lang="ts">
import { computed } from 'vue'
import { TEAMS, type Team } from '../../shared/lineup'
import { useMatch } from '../composables/useMatch'
import { t } from '../i18n'
import { teamLabel } from '../i18n/format'
import { usePlanner } from './context'

/**
 * Native <select> of nations: nations with a player first (grouped by team), then
 * all others A–Z. Native on purpose: searchable by typing on desktop and a proper
 * picker on phones.
 */
const props = withDefaults(defineProps<{ label: string; placeholder?: string; exclude?: string[]; playersOnly?: boolean }>(), {
  placeholder: '',
  exclude: () => [],
  playersOnly: false,
})
const model = defineModel<string>({ required: true })

const { catalog } = usePlanner()
const { byTeam, label: roleLabel } = useMatch()
const teams = computed(() =>
  ([...TEAMS, null] as (Team | null)[])
    .map((team) => ({
      team,
      nations: byTeam.value
        .get(team)!
        .filter((r) => r.player && !props.exclude.includes(r.nation))
        .map((r) => ({ id: r.nation, text: roleLabel(r.nation) })),
    }))
    .filter((g) => g.nations.length),
)
const withPlayer = computed(() => new Set(teams.value.flatMap((g) => g.nations.map((n) => n.id))))
const others = computed(() => catalog.sorted.filter((n) => !withPlayer.value.has(n.id) && !props.exclude.includes(n.id)))
</script>

<template>
  <select v-model="model" :aria-label="label">
    <option v-if="placeholder" value="">{{ placeholder }}</option>
    <optgroup v-for="g in teams" :key="g.team ?? 'none'" :label="g.team ? teamLabel(g.team) : t('select.withPlayer')">
      <option v-for="n in g.nations" :key="n.id" :value="n.id">{{ n.text }}</option>
    </optgroup>
    <optgroup v-if="!playersOnly && others.length" :label="teams.length ? t('select.other') : t('select.nations')">
      <option v-for="n in others" :key="n.id" :value="n.id">{{ n.name }}</option>
    </optgroup>
  </select>
</template>
