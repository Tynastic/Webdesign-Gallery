<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { t } from '../i18n'
import { dismiss, feedback } from '../state/feedback'
</script>

<template>
  <TransitionGroup tag="div" name="toast" class="toasts" role="status" aria-live="polite">
    <div v-for="item in feedback.toasts" :key="item.id" class="toast">
      <span>{{ item.message }}</span>
      <button
        v-if="item.action"
        class="toast-action"
        @click="
          item.action.run();
          dismiss(item.id)
        "
      >
        {{ item.action.label }}
      </button>
      <button class="icon-btn sm" :aria-label="t('common.dismiss')" @click="dismiss(item.id)"><X :size="14" /></button>
    </div>
  </TransitionGroup>
</template>
