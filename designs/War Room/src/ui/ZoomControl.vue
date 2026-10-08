<script setup lang="ts">
import { Minus, Plus } from 'lucide-vue-next'
import { t } from '../i18n'
import { session } from '../state/session'
import { usePlanner } from './context'

/** Zoom buttons in the map chrome's style (replaces Leaflet's own control). */
const { planner } = usePlanner()
</script>

<template>
  <div class="zoom-ctl chrome-surface" role="group" :aria-label="t('map.zoom')">
    <button class="chrome-btn" :disabled="session.zoomRange === 'min'" :title="`${t('map.zoomOut')} (−)`" :aria-label="t('map.zoomOut')" @click="planner?.zoom(-1)">
      <Minus :size="16" />
    </button>
    <span class="chrome-sep" />
    <button class="chrome-btn" :disabled="session.zoomRange === 'max'" :title="`${t('map.zoomIn')} (+)`" :aria-label="t('map.zoomIn')" @click="planner?.zoom(1)">
      <Plus :size="16" />
    </button>
  </div>
</template>
