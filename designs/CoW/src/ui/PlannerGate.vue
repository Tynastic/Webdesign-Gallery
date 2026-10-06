<script setup lang="ts">
import { KeyRound } from 'lucide-vue-next'
import { markRaw, onMounted, ref, shallowRef } from 'vue'
import { t } from '../i18n'
import { NationCatalog } from '../map/nations'
import type { MapData, NationsFile } from '../map/types'
import { session } from '../state/session'
import { AuthError, openPlan, type PlanHandle } from '../sync/planDoc'
import { getRoom, rememberRoom, storedPassword, storePassword } from '../sync/rooms'
import Planner from './Planner.vue'

/** Loads map data and opens the plan (offline or a room, with password gate); lazily loaded with the planner. */
const props = defineProps<{ room: string }>()
const data = shallowRef<MapData | null>(null)
const catalog = shallowRef<NationCatalog | null>(null)
const handle = shallowRef<PlanHandle | null>(null)
const error = ref<string | null>(null)
const status = ref(t('splash.loading'))

// Password gate for protected rooms.
const needPassword = ref(false)
const password = ref('')
const passwordError = ref('')
let roomTitle = ''

const mapData = (async () => {
  const base = import.meta.env.BASE_URL
  const [d, n]: [MapData, NationsFile] = await Promise.all([
    fetch(`${base}data/provinces.json`).then((r) => r.json()),
    fetch(`${base}data/nations.json`).then((r) => r.json()),
  ])
  data.value = Object.freeze(d)
  catalog.value = markRaw(new NationCatalog(d, n))
})()

async function open(room: string, pw?: string) {
  const h = markRaw(openPlan(room, { password: pw, title: roomTitle || undefined }))
  try {
    status.value = room === 'local' ? t('splash.openingLocal') : t('splash.joining')
    await Promise.all([h.ready, mapData])
    session.room = room
    handle.value = h
    if (room !== 'local') rememberRoom(room, String(h.plan.meta.get('title') ?? roomTitle))
  } catch (e) {
    h.destroy()
    if (e instanceof AuthError) {
      // The room's existence was checked via the API first, so a rejected connection means a wrong password
      // (Hocuspocus only reports a generic "permission-denied" to clients).
      storePassword(room, '')
      needPassword.value = true
      passwordError.value = t('gate.wrong')
      return
    }
    error.value = t('error.open', { message: (e as Error).message })
  }
}

async function submitPassword() {
  if (!password.value) return
  needPassword.value = false
  storePassword(props.room, password.value)
  await open(props.room, password.value)
}

onMounted(async () => {
  if (props.room === 'local') return open('local')
  const info = await getRoom(props.room)
  if (info && !info.exists) {
    error.value = t('error.roomMissing')
    return
  }
  roomTitle = info?.title ?? ''
  const pw = storedPassword(props.room)
  // Offline (info === null): open the cached copy; it syncs once the server is reachable.
  if (info?.protected && !pw) needPassword.value = true
  else await open(props.room, pw)
})
</script>

<template>
  <Planner v-if="data && catalog && handle" :data="data" :catalog="catalog" :handle="handle" />
  <div v-else class="splash" role="status" aria-live="polite">
    <div class="splash-mark">{{ t('app.name') }}</div>
    <form v-if="needPassword" class="gate" @submit.prevent="submitPassword">
      <KeyRound :size="22" class="gate-icon" />
      <h1>{{ t('gate.title') }}</h1>
      <p class="muted">{{ t('gate.text') }}</p>
      <input v-model="password" type="password" autocomplete="current-password" :placeholder="t('gate.placeholder')" :aria-label="t('gate.placeholder')" autofocus />
      <p v-if="passwordError" class="err">{{ passwordError }}</p>
      <button class="btn primary big" type="submit" :disabled="!password">{{ t('gate.join') }}</button>
      <a class="muted small-link" href="/">{{ t('gate.back') }}</a>
    </form>
    <template v-else-if="error">
      <p class="err">{{ error }}</p>
      <a class="btn big" href="/">{{ t('error.toLobby') }}</a>
    </template>
    <template v-else>
      <div class="splash-bar"><span /></div>
      <p>{{ status }}</p>
    </template>
  </div>
</template>
