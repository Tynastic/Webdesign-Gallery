<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { t } from '../i18n'
import { feedback } from '../state/feedback'

const dialog = ref<HTMLDialogElement | null>(null)
const cancelBtn = ref<HTMLButtonElement | null>(null)

watch(
  () => feedback.confirm,
  async (c) => {
    if (c) {
      dialog.value?.showModal()
      await nextTick()
      cancelBtn.value?.focus() // safe default for destructive actions
    } else dialog.value?.close()
  },
)

const answer = (ok: boolean) => feedback.confirm?.resolve(ok)
</script>

<template>
  <dialog ref="dialog" class="dialog confirm" aria-labelledby="confirm-title" @cancel.prevent="answer(false)">
    <template v-if="feedback.confirm">
      <h2 id="confirm-title">{{ feedback.confirm.title }}</h2>
      <p>{{ feedback.confirm.message }}</p>
      <div class="dialog-actions">
        <button ref="cancelBtn" class="btn" @click="answer(false)">{{ t('common.cancel') }}</button>
        <button class="btn danger" @click="answer(true)">{{ feedback.confirm.confirmLabel }}</button>
      </div>
    </template>
  </dialog>
</template>
