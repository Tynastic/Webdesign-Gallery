<script setup lang="ts">
import { ArrowLeft, Lock, LogOut, RefreshCw, Search, ShieldCheck, Trash2 } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { LOCALES, locale, t } from '../i18n'
import { fmtBytes, relativeTime } from '../i18n/format'
import { confirmAction, toast } from '../state/feedback'
import { adminDeleteRooms, adminLogin, adminLogout, adminRooms, adminStatus, isAdmin, type AdminRoom } from '../sync/admin'
import ConfirmDialog from './ConfirmDialog.vue'
import Segmented from './Segmented.vue'
import Toasts from './Toasts.vue'

/**
 * Room management for the admin (/admin): every room on the server with what is
 * in it, so unused and abandoned ones are easy to find and delete, one by one or
 * several at once. Without an admin session it shows the login.
 */

// ---------- login ----------
const enabled = ref<boolean | null>(null)
const password = ref('')
const loginError = ref('')
onMounted(async () => {
  enabled.value = (await adminStatus())?.enabled ?? false
})
async function login() {
  loginError.value = ''
  try {
    await adminLogin(password.value)
    password.value = ''
  } catch (e) {
    loginError.value = t('admin.failed', { message: (e as Error).message })
  }
}

// ---------- rooms ----------
const rooms = ref<AdminRoom[] | null>(null)
const ttlDays = ref(90)
const loadError = ref('')
const loading = ref(false)
async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await adminRooms()
    rooms.value = res.rooms
    ttlDays.value = res.ttlDays
    const ids = new Set(res.rooms.map((r) => r.id))
    selected.value = new Set([...selected.value].filter((id) => ids.has(id)))
  } catch (e) {
    loadError.value = t('manage.loadFailed', { message: (e as Error).message })
  } finally {
    loading.value = false
  }
}
watch(isAdmin, (v) => v && load(), { immediate: true })

type Filter = 'all' | 'unused' | 'inactive'
const filter = ref<Filter>('all')
const inactiveDays = ref(30)
const query = ref('')
type Sort = 'activity' | 'created' | 'size' | 'title'
const sort = ref<Sort>('activity')

const now = ref(Date.now())
const isInactive = (r: AdminRoom) => now.value - r.updatedAt >= inactiveDays.value * 86_400_000
const filters = computed<{ value: Filter; label: string }[]>(() => [
  { value: 'all', label: t('manage.all', { n: rooms.value?.length ?? 0 }) },
  { value: 'unused', label: t('manage.unused', { n: rooms.value?.filter((r) => r.empty).length ?? 0 }) },
  { value: 'inactive', label: t('manage.inactive', { n: rooms.value?.filter(isInactive).length ?? 0 }) },
])

const shown = computed(() => {
  const q = query.value.trim().toLocaleLowerCase()
  const list = (rooms.value ?? []).filter(
    (r) =>
      (filter.value === 'all' || (filter.value === 'unused' ? r.empty : isInactive(r))) &&
      (!q || (r.title || t('plan.untitled')).toLocaleLowerCase().includes(q) || r.id.toLowerCase().includes(q)),
  )
  const by: Record<Sort, (a: AdminRoom, b: AdminRoom) => number> = {
    activity: (a, b) => a.updatedAt - b.updatedAt, // longest unused first: the ones to look at
    created: (a, b) => a.createdAt - b.createdAt,
    size: (a, b) => b.bytes - a.bytes,
    title: (a, b) => (a.title || '').localeCompare(b.title || '', locale.value),
  }
  return list.sort(by[sort.value])
})

const totals = computed(() => {
  const list = rooms.value ?? []
  return {
    online: list.reduce((s, r) => s + r.online, 0),
    bytes: list.reduce((s, r) => s + r.bytes, 0),
  }
})

// ---------- selection and deleting ----------
const selected = ref(new Set<string>())
const allShownSelected = computed(() => shown.value.length > 0 && shown.value.every((r) => selected.value.has(r.id)))
function toggle(id: string) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}
function toggleAll() {
  const next = new Set(selected.value)
  for (const r of shown.value) {
    if (allShownSelected.value) next.delete(r.id)
    else next.add(r.id)
  }
  selected.value = next
}

const deleting = ref(false)
async function remove(ids: string[]) {
  const list = (rooms.value ?? []).filter((r) => ids.includes(r.id))
  if (!list.length) return
  const online = list.filter((r) => r.online).length
  const title = list.length === 1 ? t('admin.deleteTitle', { title: list[0].title || t('plan.untitled') }) : t('manage.deleteManyTitle', { n: list.length })
  const text = [t('room.confirmText'), online ? t('manage.deleteOnline', { n: online }) : ''].filter(Boolean).join(' ')
  if (!(await confirmAction(title, text, t('room.delete')))) return
  deleting.value = true
  try {
    const { deleted } = await adminDeleteRooms(list.map((r) => r.id))
    toast(t('manage.deleted', { n: deleted }))
    selected.value = new Set([...selected.value].filter((id) => !ids.includes(id)))
    await load()
  } catch (e) {
    toast(t('room.deleteFailed', { message: (e as Error).message }))
  } finally {
    deleting.value = false
  }
}

function contentLine(r: AdminRoom): string {
  if (r.empty) return t('manage.empty')
  return [
    r.players && t('manage.players', { n: r.players, seated: r.seated }),
    r.planned && t('manage.planned', { n: r.planned }),
    r.drawings && t('manage.drawings', { n: r.drawings }),
    r.conquered && t('manage.conquered', { n: r.conquered }),
  ]
    .filter(Boolean)
    .join(' · ')
}
const date = (ms: number) => new Date(ms).toLocaleDateString(locale.value)
</script>

<template>
  <main class="admin-page">
    <header class="admin-head">
      <a class="btn ghost" href="/"><ArrowLeft :size="16" />{{ t('manage.back') }}</a>
      <h1><ShieldCheck :size="22" />{{ t('manage.title') }}</h1>
      <div class="admin-head-actions">
        <Segmented v-model="locale" :options="LOCALES" :label="t('lobby.language')" />
        <button v-if="isAdmin" class="btn" @click="adminLogout"><LogOut :size="15" />{{ t('admin.logout') }}</button>
      </div>
    </header>

    <!-- Login -->
    <form v-if="!isAdmin" class="lobby-card admin-login" @submit.prevent="login">
      <h2><ShieldCheck :size="18" />{{ t('admin.title') }}</h2>
      <template v-if="enabled === false">
        <p class="muted">{{ t('manage.disabled') }}</p>
      </template>
      <template v-else>
        <p class="muted fine">{{ t('admin.text') }}</p>
        <input v-model="password" type="password" autocomplete="current-password" :placeholder="t('admin.password')" :aria-label="t('admin.password')" autofocus />
        <p v-if="loginError" class="err">{{ loginError }}</p>
        <button class="btn primary big" type="submit" :disabled="!password">{{ t('admin.submit') }}</button>
      </template>
    </form>

    <!-- Rooms -->
    <section v-else class="lobby-card admin-rooms" aria-labelledby="manage-rooms">
      <div class="admin-summary">
        <h2 id="manage-rooms">{{ t('manage.rooms', { n: rooms?.length ?? 0 }) }}</h2>
        <span class="muted">{{ t('manage.summary', { online: totals.online, size: fmtBytes(totals.bytes) }) }}</span>
        <button class="icon-btn" :disabled="loading" :title="t('manage.refresh')" :aria-label="t('manage.refresh')" @click="(now = Date.now()), load()">
          <RefreshCw :size="16" :class="{ spin: loading }" />
        </button>
      </div>
      <p class="muted fine">{{ t('manage.ttl', { n: ttlDays }) }}</p>

      <div class="admin-filters">
        <Segmented v-model="filter" :options="filters" :label="t('manage.filter')" />
        <label v-if="filter === 'inactive'" class="to-field">
          {{ t('manage.inactiveFor') }}
          <input v-model.number="inactiveDays" type="number" min="1" max="3650" />
          {{ t('manage.days') }}
        </label>
        <label class="rooms-filter">
          <Search :size="15" />
          <input v-model="query" type="search" :placeholder="t('lobby.filter')" :aria-label="t('lobby.filter')" autocomplete="off" />
        </label>
        <label class="admin-sort">
          {{ t('manage.sort') }}
          <select v-model="sort">
            <option value="activity">{{ t('manage.sortActivity') }}</option>
            <option value="created">{{ t('manage.sortCreated') }}</option>
            <option value="size">{{ t('manage.sortSize') }}</option>
            <option value="title">{{ t('manage.sortTitle') }}</option>
          </select>
        </label>
      </div>
      <p v-if="filter === 'unused'" class="muted fine">{{ t('manage.unusedHint') }}</p>

      <p v-if="loadError" class="err">{{ loadError }}</p>
      <p v-else-if="rooms === null" class="muted">{{ t('lobby.roomsLoading') }}</p>
      <p v-else-if="!shown.length" class="muted">{{ t('manage.none') }}</p>
      <template v-else>
        <div class="admin-bulk" :class="{ active: selected.size }">
          <label class="admin-check">
            <input type="checkbox" :checked="allShownSelected" :aria-label="t('manage.selectAll')" @change="toggleAll" />
            {{ selected.size ? t('manage.selected', { n: selected.size }) : t('manage.selectAll') }}
          </label>
          <button class="btn danger" :disabled="!selected.size || deleting" @click="remove([...selected])"><Trash2 :size="15" />{{ t('manage.deleteSelected', { n: selected.size }) }}</button>
        </div>
        <ul class="admin-list">
          <li v-for="r in shown" :key="r.id" class="admin-row" :class="{ checked: selected.has(r.id), live: r.online }">
            <input type="checkbox" :checked="selected.has(r.id)" :aria-label="t('manage.select', { title: r.title || t('plan.untitled') })" @change="toggle(r.id)" />
            <div class="admin-room">
              <a :href="`/r/${r.id}`" class="admin-room-title">
                <Lock v-if="r.protected" :size="13" :aria-label="t('lobby.protected')" />
                <strong>{{ r.title || t('plan.untitled') }}</strong>
              </a>
              <small :class="r.empty ? 'admin-empty' : 'muted'">{{ contentLine(r) }}</small>
            </div>
            <div class="admin-meta">
              <span v-if="r.online" class="room-online"><span class="live-dot" />{{ t('lobby.online', { n: r.online }) }}</span>
              <span :title="new Date(r.updatedAt).toLocaleString(locale)">{{ t('lobby.active', { ago: relativeTime(r.updatedAt, now) }) }}</span>
              <small class="muted">{{ t('manage.created', { date: date(r.createdAt) }) }} · {{ fmtBytes(r.bytes) }}</small>
            </div>
            <button class="icon-btn danger" :disabled="deleting" :title="t('admin.deleteRoom')" :aria-label="t('admin.deleteRoom')" @click="remove([r.id])"><Trash2 :size="15" /></button>
          </li>
        </ul>
      </template>
    </section>
    <div class="lobby-toasts"><Toasts /></div>
    <ConfirmDialog />
  </main>
</template>
