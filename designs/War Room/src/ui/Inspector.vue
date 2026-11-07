<script setup lang="ts">
import { computed } from 'vue'
import { useYMap } from '../composables/useY'
import { t } from '../i18n'
import { touchScreen } from '../state/device'
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
      <ul v-if="touchScreen" class="quick-tips">
        <li>{{ t('tips.touch.tools') }}</li>
        <li>{{ t('tips.touch.select') }}</li>
        <li>{{ t('tips.touch.pan') }}</li>
        <li>{{ t('tips.touch.ping') }}</li>
      </ul>
      <ul v-else class="quick-tips">
        <li><kbd>P</kbd> {{ t('tips.assign') }} · <kbd>C</kbd> {{ t('tips.own') }}</li>
        <li><kbd>A</kbd> {{ t('tips.arrow') }} · <kbd>F</kbd> {{ t('tips.front') }}</li>
        <li><kbd>U</kbd> {{ t('tips.unit') }} · <kbd>O</kbd> {{ t('tips.objective') }}</li>
        <li><kbd>{{ t('key.altclick') }}</kbd> {{ t('tips.ping') }}</li>
        <li>{{ t('tips.select') }} · <kbd>?</kbd> {{ t('tips.help') }}</li>
      </ul>
    </div>
  </PanelSection>
</template>
