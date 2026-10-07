<script setup lang="ts">
import { computed } from 'vue'
import { useYMap } from '../composables/useY'
import { t } from '../i18n'
import { session } from '../state/session'
import { usePlanner } from './context'
import ObjectInspector from './ObjectInspector.vue'
import PanelSection from './PanelSection.vue'
import ProvincePanel from './ProvincePanel.vue'

const { plan } = usePlanner()
const objects = useYMap(plan.objects)
const object = computed(() => (session.selectedObject ? objects.value.get(session.selectedObject) : undefined))
</script>

<template>
  <PanelSection id="inspector" :title="t('panel.inspector')" :collapsible="false">
    <ObjectInspector v-if="object" :key="object.id" :object="object" />
    <ProvincePanel v-else-if="session.selectedProvince !== null" :id="session.selectedProvince" />
    <div v-else class="empty-state">
      <p>{{ t('inspector.empty') }}</p>
      <ul class="quick-tips">
        <li><kbd>P</kbd> {{ t('tips.assign') }} · <kbd>C</kbd> {{ t('tips.own') }}</li>
        <li><kbd>A</kbd> {{ t('tips.arrow') }} · <kbd>F</kbd> {{ t('tips.front') }}</li>
        <li><kbd>U</kbd> {{ t('tips.unit') }} · <kbd>O</kbd> {{ t('tips.objective') }}</li>
        <li><kbd>{{ t('key.altclick') }}</kbd> {{ t('tips.ping') }}</li>
        <li>{{ t('tips.select') }} · <kbd>?</kbd> {{ t('tips.help') }}</li>
      </ul>
    </div>
  </PanelSection>
</template>
