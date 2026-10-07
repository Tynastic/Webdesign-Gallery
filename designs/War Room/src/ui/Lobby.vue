<script setup lang="ts">
import { ArrowRight, CloudOff, LogIn, Plus, X } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { LOCALES, locale, t } from '../i18n'
import { createRoom, forgetRoom, recentRooms, roomIdFromInput, storePassword } from '../sync/rooms'
import FeedbackDialog from './FeedbackDialog.vue'
import Segmented from './Segmented.vue'
import Toasts from './Toasts.vue'

const title = ref('')
const password = ref('')
const creating = ref(false)
const createError = ref('')
const link = ref('')
const recent = ref(recentRooms())
const linkId = computed(() => roomIdFromInput(link.value))
const feedbackOpen = ref(false)
const version = __APP_VERSION__

async function create() {
  creating.value = true
  createError.value = ''
  try {
    const id = await createRoom(title.value.trim() || t('plan.untitled'), password.value)
    storePassword(id, password.value)
    location.assign(`/r/${id}`)
  } catch (e) {
    createError.value = t('lobby.createError', { message: (e as Error).message })
    creating.value = false
  }
}

function join() {
  if (linkId.value) location.assign(`/r/${linkId.value}`)
}

function forget(id: string) {
  forgetRoom(id)
  recent.value = recentRooms()
}

/** "5 minutes ago" / "vor 5 Minuten" in the current language. */
function ago(time: number) {
  const rtf = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' })
  const minutes = Math.round((time - Date.now()) / 60000)
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  return Math.abs(hours) < 48 ? rtf.format(hours, 'hour') : rtf.format(Math.round(hours / 24), 'day')
}
</script>

<template>
  <main class="lobby">
    <div class="lobby-lang">
      <Segmented v-model="locale" :options="LOCALES" :label="t('lobby.language')" />
    </div>
    <header class="lobby-head">
      <svg class="brand-mark lg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18 L12 5 L21 18" /><path d="M8 18 L12 12 L16 18" /></svg>
      <h1>{{ t('app.name') }}</h1>
      <p class="lobby-tagline">{{ t('app.tagline') }}</p>
      <p>{{ t('lobby.intro') }}</p>
    </header>

    <div class="lobby-grid">
      <form class="lobby-card" @submit.prevent="create">
        <h2><Plus :size="18" />{{ t('lobby.new') }}</h2>
        <label class="field">
          <span>{{ t('lobby.name') }}</span>
          <input v-model="title" maxlength="80" :placeholder="t('lobby.namePlaceholder')" autocomplete="off" />
        </label>
        <label class="field">
          <span>{{ t('lobby.password') }} <small class="muted">· {{ t('lobby.optional') }}</small></span>
          <input v-model="password" type="password" maxlength="128" autocomplete="new-password" :placeholder="t('lobby.passwordPlaceholder')" />
        </label>
        <p v-if="createError" class="err">{{ createError }}</p>
        <button class="btn primary big" type="submit" :disabled="creating">{{ creating ? t('lobby.creating') : t('lobby.create') }}<ArrowRight :size="16" /></button>
        <p class="muted fine">{{ t('lobby.createHint') }}</p>
      </form>

      <div class="lobby-col">
        <form class="lobby-card" @submit.prevent="join">
          <h2><LogIn :size="18" />{{ t('lobby.join') }}</h2>
          <input v-model="link" class="big-input" :placeholder="t('lobby.linkPlaceholder')" :aria-label="t('lobby.linkPlaceholder')" autocomplete="off" />
          <button class="btn big" type="submit" :disabled="!linkId">{{ t('lobby.joinButton') }}</button>
        </form>

        <section v-if="recent.length" class="lobby-card">
          <h2>{{ t('lobby.recent') }}</h2>
          <ul class="recent">
            <li v-for="r in recent" :key="r.id">
              <a :href="`/r/${r.id}`">
                <strong>{{ r.title || t('plan.untitled') }}</strong>
                <small class="muted">{{ ago(r.openedAt) }}</small>
              </a>
              <button class="icon-btn" :aria-label="t('lobby.forgetAria', { title: r.title })" :title="t('lobby.forget')" @click="forget(r.id)"><X :size="16" /></button>
            </li>
          </ul>
        </section>

        <a class="lobby-offline" href="/local"><CloudOff :size="16" />{{ t('lobby.offline') }}</a>
      </div>
    </div>

    <footer class="lobby-foot">
      <span class="beta">{{ t('beta.badge') }} {{ version }}</span>
      <button class="link-btn" @click="feedbackOpen = true">{{ t('top.feedback') }}</button>
      <a href="/impressum">{{ t('legal.impressum') }}</a>
      <a href="/datenschutz">{{ t('legal.privacy') }}</a>
    </footer>
    <FeedbackDialog v-model:open="feedbackOpen" />
    <div class="lobby-toasts"><Toasts /></div>
  </main>
</template>
