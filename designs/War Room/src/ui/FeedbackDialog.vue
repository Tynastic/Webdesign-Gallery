<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { computed, nextTick, ref, watch } from 'vue'
import { locale, t } from '../i18n'
import { toast } from '../state/feedback'
import { session } from '../state/session'
import Segmented from './Segmented.vue'

/** Tester feedback → POST /api/feedback (stored on the server, read via the admin API). */
const open = defineModel<boolean>('open', { required: true })
const dialog = ref<HTMLDialogElement | null>(null)
const textarea = ref<HTMLTextAreaElement | null>(null)

const kind = ref<'bug' | 'idea' | 'other'>('bug')
const message = ref('')
const contact = ref('')
const sending = ref(false)

const kinds = computed(() => [
  { value: 'bug' as const, label: t('feedback.bug') },
  { value: 'idea' as const, label: t('feedback.idea') },
  { value: 'other' as const, label: t('feedback.other') },
])

watch(open, async (v) => {
  if (!v) return dialog.value?.close()
  dialog.value?.showModal()
  await nextTick()
  textarea.value?.focus()
})

async function send() {
  if (!message.value.trim() || sending.value) return
  sending.value = true
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: kind.value,
        message: message.value.trim(),
        contact: contact.value.trim(),
        room: session.room === 'local' ? '' : session.room,
        path: location.pathname.replace(/^\/r\/.*/, '/r/…'),
        locale: locale.value,
        appVersion: __APP_VERSION__,
      }),
    })
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`)
    toast(t('feedback.thanks'))
    message.value = ''
    open.value = false
  } catch (err) {
    toast(t('feedback.failed', { message: (err as Error).message }))
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <dialog ref="dialog" class="dialog feedback" aria-labelledby="fb-title" @close="open = false">
    <form @submit.prevent="send">
      <header class="dialog-head">
        <h2 id="fb-title">{{ t('feedback.title') }}</h2>
        <button type="button" class="icon-btn" :aria-label="t('common.close')" @click="open = false"><X :size="18" /></button>
      </header>
      <p class="muted">{{ t('feedback.text') }}</p>
      <div class="field">
        <span>{{ t('feedback.kind') }}</span>
        <Segmented v-model="kind" :options="kinds" :label="t('feedback.kind')" />
      </div>
      <label class="field">
        <span>{{ t('feedback.message') }}</span>
        <textarea ref="textarea" v-model="message" rows="5" maxlength="4000" required :placeholder="t('feedback.placeholder')" />
      </label>
      <label class="field">
        <span>{{ t('feedback.contact') }}</span>
        <input v-model="contact" maxlength="200" :placeholder="t('feedback.contactPlaceholder')" autocomplete="email" />
      </label>
      <p class="muted fine">{{ t('feedback.privacy') }}</p>
      <div class="dialog-actions">
        <button type="button" class="btn big" @click="open = false">{{ t('common.cancel') }}</button>
        <button type="submit" class="btn primary big" :disabled="!message.trim() || sending">{{ sending ? t('feedback.sending') : t('feedback.send') }}</button>
      </div>
    </form>
  </dialog>
</template>
