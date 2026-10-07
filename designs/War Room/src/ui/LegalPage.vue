<script setup lang="ts">
import { ArrowLeft } from 'lucide-vue-next'
import { ref, watchEffect } from 'vue'
import { locale, t } from '../i18n'

/**
 * Impressum / Datenschutz. The content is operator-provided HTML from the
 * server's legal directory (trusted, edited by whoever runs the instance).
 */
const props = defineProps<{ page: 'impressum' | 'datenschutz' }>()
const html = ref<string | null>(null)
const missing = ref(false)

watchEffect(async () => {
  const res = await fetch(`/api/legal/${props.page}?lang=${locale.value}`).catch(() => null)
  missing.value = !res?.ok
  html.value = res?.ok ? await res.text() : null
})
</script>

<template>
  <main class="legal">
    <a class="legal-back" href="/"><ArrowLeft :size="16" />{{ t('legal.back') }}</a>
    <h1>{{ page === 'impressum' ? t('legal.impressum') : t('legal.privacy') }}</h1>
    <p v-if="missing" class="muted">{{ t('legal.missing') }}</p>
    <article v-else-if="html" class="legal-body" v-html="html" />
  </main>
</template>
