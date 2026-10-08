<script setup lang="ts">
import { ArrowRight, CloudOff, LayoutList, Lock, LogIn, Plus, Search } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { LOCALES, locale, t } from '../i18n'
import { createRoom, listRooms, recentRooms, roomIdFromInput, storePassword, type RoomSummary } from '../sync/rooms'
import Segmented from './Segmented.vue'
import Toasts from './Toasts.vue'

const title = ref('')
const password = ref('')
const creating = ref(false)
const createError = ref('')
const link = ref('')
const recent = recentRooms()
const linkId = computed(() => roomIdFromInput(link.value))
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

// ---------- every room on the server ----------
/** null while loading; 'offline' when the server can't be reached (then only this browser's recent rooms are shown). */
const rooms = ref<RoomSummary[] | 'offline' | null>(null)
const filter = ref('')
const visited = new Map(recent.map((r) => [r.id, r.openedAt]))

onMounted(async () => {
  rooms.value = (await listRooms()) ?? 'offline'
})

interface RoomRow {
  id: string
  title: string
  protected: boolean
  /** Last activity: last edit on the server, or when this browser last opened it (offline). */
  activeAt: number
  online: number
  visitedAt?: number
}

const rows = computed<RoomRow[]>(() => {
  const list: RoomRow[] =
    rooms.value === 'offline'
      ? recent.map((r) => ({ id: r.id, title: r.title, protected: false, activeAt: r.openedAt, online: 0, visitedAt: r.openedAt }))
      : (rooms.value ?? []).map((r) => ({ id: r.id, title: r.title, protected: r.protected, activeAt: r.updatedAt, online: r.online, visitedAt: visited.get(r.id) }))
  // Rooms with people in them first, then by last activity (the server's order).
  return list.sort((a, b) => Number(b.online > 0) - Number(a.online > 0))
})
const shown = computed(() => {
  const q = filter.value.trim().toLocaleLowerCase()
  return q ? rows.value.filter((r) => (r.title || t('plan.untitled')).toLocaleLowerCase().includes(q)) : rows.value
})

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

        <a class="lobby-offline" href="/local"><CloudOff :size="16" />{{ t('lobby.offline') }}</a>
      </div>

      <section class="lobby-card lobby-rooms" aria-labelledby="rooms-title">
        <div class="rooms-head">
          <h2 id="rooms-title"><LayoutList :size="18" />{{ rooms === 'offline' ? t('lobby.recent') : t('lobby.rooms') }}</h2>
          <span v-if="rows.length" class="badge">{{ rows.length }}</span>
          <label v-if="rows.length > 6" class="rooms-filter">
            <Search :size="15" />
            <input v-model="filter" type="search" :placeholder="t('lobby.filter')" :aria-label="t('lobby.filter')" autocomplete="off" />
          </label>
        </div>
        <p v-if="rooms === 'offline'" class="muted fine">{{ t('lobby.roomsOffline') }}</p>
        <p v-if="rooms === null" class="muted">{{ t('lobby.roomsLoading') }}</p>
        <p v-else-if="!rows.length" class="muted">{{ t('lobby.roomsEmpty') }}</p>
        <p v-else-if="!shown.length" class="muted">{{ t('lobby.noMatch', { q: filter.trim() }) }}</p>
        <ul v-else class="rooms">
          <li v-for="r in shown" :key="r.id">
            <a :href="`/r/${r.id}`" class="room-row" :class="{ live: r.online }">
              <span class="room-title">
                <Lock v-if="r.protected" :size="14" class="room-lock" :aria-label="t('lobby.protected')" />
                <strong>{{ r.title || t('plan.untitled') }}</strong>
              </span>
              <span class="room-meta">
                <span v-if="r.online" class="room-online"><span class="live-dot" />{{ t('lobby.online', { n: r.online }) }}</span>
                <span v-if="r.visitedAt" class="tag">{{ t('lobby.visited') }}</span>
                <small class="muted" :title="new Date(r.activeAt).toLocaleString(locale)">{{ t('lobby.active', { ago: ago(r.activeAt) }) }}</small>
              </span>
            </a>
          </li>
        </ul>
      </section>
    </div>

    <footer class="lobby-foot">
      <span class="beta">{{ t('beta.badge') }} {{ version }}</span>
      <a href="/impressum">{{ t('legal.impressum') }}</a>
      <a href="/datenschutz">{{ t('legal.privacy') }}</a>
    </footer>
    <div class="lobby-toasts"><Toasts /></div>
  </main>
</template>
