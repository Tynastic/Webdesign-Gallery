<script setup lang="ts">
import { SlidersHorizontal } from 'lucide-vue-next'
import { computed } from 'vue'
import { LOCALES, locale, t } from '../i18n'
import { session, type FillMode } from '../state/session'
import MenuPopover from './MenuPopover.vue'
import { resourceLabel } from '../i18n/format'
import { RESOURCE_LIST } from '../render/resourceGlyphs'
import ResourceIcon from './ResourceIcon.vue'
import Segmented from './Segmented.vue'

/** How the map is drawn (and the UI language), in a menu docked to the map's bottom-left corner. */
const fills = computed<{ value: FillMode; label: string }[]>(() => [
  { value: 'teams', label: t('view.teams') },
  { value: 'vivid', label: t('view.vivid') },
  { value: 'muted', label: t('view.muted') },
  { value: 'off', label: t('view.off') },
])
</script>

<template>
  <MenuPopover class="view-menu" :label="t('panel.view')" :title="t('view.menuTitle')" placement="above-start" button-class="map-btn chrome-surface">
    <template #button><SlidersHorizontal :size="16" /><span class="menu-btn-label">{{ t('panel.view') }}</span></template>
    <div class="field">
      <span>{{ t('view.colours') }} <small class="muted">· {{ session.fillMode === 'teams' ? t('view.teamsHint') : t('view.coloursHint') }}</small></span>
      <Segmented v-model="session.fillMode" :options="fills" :label="t('view.colours')" />
    </div>
    <label class="toggle">
      <input v-model="session.aiGrey" type="checkbox" :disabled="session.fillMode === 'off'" />
      <span class="toggle-track" aria-hidden="true" />
      <span>{{ t('view.aiGrey') }} <small class="muted">{{ t('view.aiGreyHint') }}</small></span>
    </label>
    <label class="toggle">
      <input v-model="session.borders" type="checkbox" />
      <span class="toggle-track" aria-hidden="true" />
      <span>{{ t('view.borders') }}</span>
    </label>
    <label class="toggle">
      <input v-model="session.labels" type="checkbox" />
      <span class="toggle-track" aria-hidden="true" />
      <span>{{ t('view.labels') }} <small class="muted">{{ t('view.labelsHint') }}</small></span>
    </label>
    <label class="toggle">
      <input v-model="session.cities" type="checkbox" />
      <span class="toggle-track" aria-hidden="true" />
      <span>{{ t('view.cities') }} <small class="muted">{{ t('view.citiesHint') }}</small></span>
    </label>
    <label class="toggle">
      <input v-model="session.resources" type="checkbox" />
      <span class="toggle-track" aria-hidden="true" />
      <span>
        {{ t('view.resources') }} <small class="muted">{{ t('view.resourcesHint') }}</small>
        <small class="res-legend">
          <span v-for="r in RESOURCE_LIST" :key="r"><ResourceIcon :res="r" :size="15" />{{ resourceLabel(r) }}</span>
        </small>
      </span>
    </label>
    <div class="field menu-foot">
      <span>{{ t('view.language') }}</span>
      <Segmented v-model="locale" :options="LOCALES" :label="t('view.language')" />
    </div>
  </MenuPopover>
</template>
