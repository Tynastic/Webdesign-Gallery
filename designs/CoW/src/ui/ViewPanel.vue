<script setup lang="ts">
import { computed } from 'vue'
import { LOCALES, locale, t } from '../i18n'
import { session, type FillMode } from '../state/session'
import PanelSection from './PanelSection.vue'
import Segmented from './Segmented.vue'

const fills = computed<{ value: FillMode; label: string }[]>(() => [
  { value: 'vivid', label: t('view.vivid') },
  { value: 'muted', label: t('view.muted') },
  { value: 'off', label: t('view.off') },
])
</script>

<template>
  <PanelSection id="map-style" :title="t('panel.view')">
    <div class="field">
      <span>{{ t('view.language') }}</span>
      <Segmented v-model="locale" :options="LOCALES" :label="t('view.language')" />
    </div>
    <div class="field">
      <span>{{ t('view.colours') }} <small class="muted">· {{ t('view.coloursHint') }}</small></span>
      <Segmented v-model="session.fillMode" :options="fills" :label="t('view.colours')" />
    </div>
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
  </PanelSection>
</template>
