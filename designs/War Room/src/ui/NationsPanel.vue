<script setup lang="ts">
import { ChevronRight, Users } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { TEAMS, type Team } from '../../shared/lineup'
import { PLAYABLE } from '../../shared/points'
import { useMatch } from '../composables/useMatch'
import { useYMap } from '../composables/useY'
import { t } from '../i18n'
import { teamLabel } from '../i18n/format'
import { TEAM_SWATCH } from '../map/teamColors'
import { session } from '../state/session'
import ClassBadge from './ClassBadge.vue'
import { usePlanner } from './context'
import PanelSection from './PanelSection.vue'

/**
 * Who is who, at a glance: the playable nations grouped by team, each with its
 * player (or AI), class, land held compared to the start, whether it still holds
 * its capital, and how its planned conquests are going. Teams and players are
 * changed in the line-up; this panel only reads them (plus the marker colour).
 */
const { data, catalog, plan, planner, owners, held } = usePlanner()
const { byTeam, nationName, playersTotal } = useMatch()
const assignments = useYMap(plan.assignments)

const startCount = new Map<number, number>()
for (const p of data.provinces) startCount.set(p.nation, (startCount.get(p.nation) ?? 0) + 1)
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

const collapsed = ref(new Set<Team | null>())
function toggle(team: Team | null) {
  const next = new Set(collapsed.value)
  if (next.has(team)) next.delete(team)
  else next.add(team)
  collapsed.value = next
}

const groups = computed(() =>
  ([...TEAMS, null] as (Team | null)[])
    .map((team) => {
      const roles = byTeam.value.get(team)!
      return {
        team,
        players: roles.filter((r) => r.player).length,
        rows: roles.map((r) => {
          const index = catalog.byId.get(r.nation)!.index
          const now = held.value[index]
          const capital = catalog.capitalOf.get(r.nation)
          const holder = capital === undefined ? null : catalog.list[owners.value[capital]]
          return {
            ...r,
            name: nationName(r.nation),
            held: now,
            delta: now - (startCount.get(index) ?? 0),
            capitalLostTo: holder && holder.id !== r.nation ? holder.name : null,
            progress: progress.value.get(r.nation),
          }
        }),
      }
    })
    .filter((g) => g.rows.length),
)

const signed = (n: number) => (n > 0 ? `+${n}` : String(n))
</script>

<template>
  <PanelSection id="nations" :title="t('panel.nations')" :badge="t('nations.playersOf', { n: playersTotal, of: PLAYABLE.length })">
    <button class="btn lineup-open" :title="t('nations.lineupTitle')" @click="session.lineupOpen = true"><Users :size="14" />{{ t('nations.lineup') }}<kbd>L</kbd></button>
    <p v-if="!playersTotal" class="empty-state">{{ t('nations.empty') }}</p>
    <div v-for="g in groups" :key="g.team ?? 'none'" class="nation-group" :class="`team-${g.team ?? 'none'}`">
      <button class="nation-group-head" :aria-expanded="!collapsed.has(g.team)" @click="toggle(g.team)">
        <ChevronRight :size="14" class="chev" />
        <span class="team-swatch" :style="{ background: g.team ? TEAM_SWATCH[g.team] : TEAM_SWATCH.open }" />
        <strong>{{ teamLabel(g.team) }}</strong>
        <span class="muted">{{ t('nations.groupCount', { n: g.players, of: g.rows.length }) }}</span>
      </button>
      <ul v-if="!collapsed.has(g.team)" class="rows" @mouseleave="planner?.focusNation(null)">
        <li v-for="n in g.rows" :key="n.nation" class="row nation-row" :class="{ ai: !n.player }" @mouseenter="planner?.focusNation(n.nation)">
          <span class="dot lg" :style="{ background: n.color }" :title="t('nations.colourTitle')" />
          <div class="nation-cell">
            <span class="nation-main">
              <strong class="nation-player" :class="{ ai: !n.player }">{{ n.player?.name ?? t('match.ai') }}</strong>
              <span v-if="session.me === n.nation" class="tag me" :title="t('nations.youTitle')">{{ t('nations.you') }}</span>
            </span>
            <small class="nation-sub">
              {{ n.name }} ·
              <span :title="t('nations.heldTitle', { n: n.held, delta: signed(n.delta) })">{{ n.held }}<template v-if="n.delta"> ({{ signed(n.delta) }})</template></span>
              <span v-if="n.capitalLostTo" class="capital-lost" :title="t('nations.capitalLost', { nation: n.capitalLostTo })">★ {{ t('nations.capitalLostShort') }}</span>
            </small>
          </div>
          <ClassBadge :cls="n.cls" />
          <button
            class="count-btn"
            :disabled="!n.progress"
            :title="n.progress ? t('nations.progressTitle') : t('nations.noProgress')"
            @click="planner?.flyToProvinces(n.progress?.ids ?? [])"
          >
            {{ n.progress ? `${n.progress.done}/${n.progress.ids.length}` : '0' }}
          </button>
        </li>
      </ul>
    </div>
  </PanelSection>
</template>
