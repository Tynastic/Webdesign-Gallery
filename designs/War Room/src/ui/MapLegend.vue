<script setup lang="ts">
import { ChevronDown, Map as MapIcon } from 'lucide-vue-next'
import { computed } from 'vue'
import { useMatch } from '../composables/useMatch'
import { t } from '../i18n'
import { teamLabel } from '../i18n/format'
import { TEAM_SWATCH } from '../map/teamColors'
import { session } from '../state/session'

/**
 * What the colours and symbols on the map mean, one glance away in the map's
 * corner: the team colours (Teams mode), AI nations (when greyed out), planned and
 * achieved conquests, and capitals. Collapses to a button; remembered per browser.
 */
const { byTeam } = useMatch()
const teams = computed(() =>
  (['axis', 'allies'] as const).map((team) => ({
    team,
    color: TEAM_SWATCH[team],
    players: byTeam.value.get(team)!.filter((r) => r.player).length,
  })),
)
const showAi = computed(() => session.fillMode !== 'off' && (session.aiGrey || session.fillMode === 'teams'))
</script>

<template>
  <div class="map-legend chrome-surface" :class="{ open: session.legend }">
    <button class="legend-toggle" :aria-expanded="session.legend" :title="t('legend.toggle')" @click="session.legend = !session.legend">
      <MapIcon :size="15" /><span>{{ t('legend.title') }}</span><ChevronDown :size="14" class="chev" />
    </button>
    <ul v-if="session.legend" class="legend-list">
      <template v-if="session.fillMode === 'teams'">
        <li v-for="tm in teams" :key="tm.team">
          <span class="legend-swatch" :style="{ background: tm.color }" />{{ teamLabel(tm.team) }}
          <small class="muted">{{ t('legend.players', { n: tm.players }) }}</small>
        </li>
        <li><span class="legend-swatch open" :style="{ background: TEAM_SWATCH.open }" />{{ t('legend.noTeam') }}</li>
      </template>
      <li v-if="showAi"><span class="legend-swatch" :style="{ background: TEAM_SWATCH.ai }" />{{ t('legend.ai') }}</li>
      <li><span class="legend-swatch hatch" />{{ t('legend.planned') }}</li>
      <li><span class="legend-swatch dashed" />{{ t('legend.achieved') }}</li>
      <li><span class="legend-star">★</span>{{ t('legend.capital') }}</li>
    </ul>
  </div>
</template>
