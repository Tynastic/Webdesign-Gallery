<script setup lang="ts">
import { CircleHelp, Cloud, CloudOff, Download, ImageDown, LoaderCircle, MessageSquareText, Redo2, Share2, Undo2, Upload } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, ref, shallowRef } from 'vue'
import { displayName, exportPlan, ImportError, importPlan, LOCAL_ORIGIN, type PlanSnapshot } from '../../shared/schema'
import { useUndoState } from '../composables/useY'
import { locale, t } from '../i18n'
import { downloadBlob, exportMapImage } from '../render/exportImage'
import { confirmAction, toast } from '../state/feedback'
import { session } from '../state/session'
import type { Peer } from '../sync/presence'
import { roomUrl } from '../sync/rooms'
import { usePlanner } from './context'
import SearchBox from './SearchBox.vue'
import { toolLabel } from './toolCatalog'

defineProps<{ meName: string }>()
defineEmits<{ help: []; identity: []; feedback: [] }>()
const { catalog, plan, undo, handle, planner } = usePlanner()
const undoState = useUndoState(undo)
const status = handle.status

const title = ref(String(plan.meta.get('title') ?? ''))
const onMeta = () => (title.value = String(plan.meta.get('title') ?? ''))
plan.meta.observe(onMeta)
onBeforeUnmount(() => plan.meta.unobserve(onMeta))
function saveTitle() {
  const next = title.value.trim() || t('plan.untitled')
  if (next !== plan.meta.get('title')) plan.doc.transact(() => plan.meta.set('title', next), LOCAL_ORIGIN)
  title.value = next
}

// ---------- presence ----------
const peers = shallowRef<Peer[]>(handle.presence.peers())
onBeforeUnmount(handle.presence.onChange(() => (peers.value = handle.presence.peers())))
const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
/** Clicking an avatar follows that player's view (click again, pan or zoom to stop). */
function toggleFollow(p: Peer) {
  session.following = session.following === p.clientId ? null : p.clientId
}

const statusInfo = computed(() =>
  ({
    local: { icon: CloudOff, text: t('conn.local'), title: t('conn.localTitle') },
    connecting: { icon: LoaderCircle, text: t('conn.connecting'), title: t('conn.connectingTitle') },
    connected: { icon: Cloud, text: t('conn.connected'), title: t('conn.connectedTitle') },
    offline: { icon: CloudOff, text: t('conn.offline'), title: t('conn.offlineTitle') },
    denied: { icon: CloudOff, text: t('conn.offline'), title: t('room.gone') },
  })[status.value],
)

async function share() {
  const url = roomUrl(handle.room)
  try {
    await navigator.clipboard.writeText(url)
    toast(t('top.linkCopied'))
  } catch {
    window.prompt(t('top.copyPrompt'), url)
  }
}

// ---------- file ----------
const exporting = ref(false)
async function exportPng() {
  const map = planner.value?.map
  if (!map || exporting.value) return
  exporting.value = true
  // Export the plan, not the editing state: hide selection halos, handles and hover outlines meanwhile.
  const selection = { object: session.selectedObject, province: session.selectedProvince }
  session.selectedObject = session.selectedProvince = null
  session.hoveredProvince = null
  await nextTick()
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  try {
    const title = String(plan.meta.get('title') ?? t('plan.untitled'))
    const date = new Date().toLocaleDateString(locale.value)
    const legend = [...plan.nations.values()].map((n) => ({ color: n.color, label: displayName(n, catalog.byId.get(n.id)?.name ?? n.id) }))
    const blob = await exportMapImage(map.getContainer(), [t('app.name'), title, date].join(' · '), legend)
    const slug = title.replace(/[^\w-]+/g, '-').toLowerCase() || 'plan'
    downloadBlob(blob, slug + '-' + new Date().toISOString().slice(0, 10) + '.png')
    toast(t('toast.pngSaved'))
  } catch (err) {
    toast(t('toast.pngFailed', { message: (err as Error).message }))
  } finally {
    session.selectedObject = selection.object
    session.selectedProvince = selection.province
    exporting.value = false
  }
}

function exportFile() {
  const snap = exportPlan(plan)
  const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${snap.title.replace(/[^\w-]+/g, '-').toLowerCase() || 'plan'}-${snap.exportedAt.slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
  toast(t('file.exported', { title: snap.title }))
}

const fileInput = ref<HTMLInputElement | null>(null)
async function importFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  try {
    const snap = JSON.parse(await file.text()) as PlanSnapshot
    const params = { title: snap.title, objects: snap.objects?.length ?? 0, planned: Object.keys(snap.assignments ?? {}).length }
    const ok = await confirmAction(
      t('file.confirmTitle'),
      t(handle.room === 'local' ? 'file.confirmText' : 'file.confirmTextRoom', params),
      t('file.confirmOk'),
    )
    if (!ok) return
    undo.stopCapturing()
    importPlan(plan, snap, { title: t('plan.untitled'), layerName: t('layer.general') })
    undo.stopCapturing()
    session.selectedObject = session.selectedProvince = null
    session.activePhase = null
    session.activeLayer = plan.layers.keys().next().value ?? 'general'
    if (session.me && !plan.nations.has(session.me)) session.me = null
    toast(t('file.imported', { title: snap.title }), { label: t('common.undo'), run: () => undo.undo() })
  } catch (err) {
    const message = err instanceof ImportError ? t(err.code === 'not-a-plan' ? 'file.notAPlan' : 'file.newer') : (err as Error).message
    toast(t('file.importFailed', { message }))
  }
}
</script>

<template>
  <header class="topbar">
    <a class="brand" href="/" :title="t('top.lobby')" :aria-label="t('top.lobby')">
      <svg class="brand-mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18 L12 5 L21 18" /><path d="M8 18 L12 12 L16 18" /></svg>
      <span class="brand-name">{{ t('app.name') }}</span>
    </a>
    <input
      v-model="title"
      class="plan-title"
      :aria-label="t('top.title')"
      :title="t('top.rename')"
      maxlength="80"
      @blur="saveTitle"
      @keydown.enter="($event.target as HTMLInputElement).blur()"
    />
    <span class="conn" :class="status" :title="statusInfo.title" role="status">
      <component :is="statusInfo.icon" :size="14" :class="{ spin: status === 'connecting' }" />{{ statusInfo.text }}
    </span>
    <SearchBox />
    <div class="topbar-actions">
      <div v-if="handle.room !== 'local'" class="presence" :aria-label="t('top.people')">
        <button
          v-for="p in peers.slice(0, 6)"
          :key="p.clientId"
          class="avatar"
          :style="{ '--c': p.state.user.color }"
          :class="{ following: session.following === p.clientId }"
          :title="t('top.followTitle', { name: p.state.user.name, tool: p.state.tool ? toolLabel(p.state.tool) : t('top.viewing') })"
          :aria-label="t('top.followAria', { name: p.state.user.name })"
          :aria-pressed="session.following === p.clientId"
          @click="toggleFollow(p)"
        >
          {{ initials(p.state.user.name) }}
        </button>
        <span v-if="peers.length > 6" class="avatar more">+{{ peers.length - 6 }}</span>
        <button class="btn share" :title="t('top.shareTitle')" @click="share"><Share2 :size="15" />{{ t('top.share') }}</button>
      </div>
      <button class="me-chip" :title="t('top.identity')" @click="$emit('identity')">{{ meName }}</button>
      <div class="btn-group" role="group" :aria-label="t('top.history')">
        <button class="icon-btn" :disabled="!undoState.canUndo" :title="t('common.withKeys', { label: t('top.undo'), keys: `${t('key.ctrl')}+Z` })" :aria-label="t('top.undo')" @click="undo.undo()"><Undo2 :size="18" /></button>
        <button class="icon-btn" :disabled="!undoState.canRedo" :title="t('common.withKeys', { label: t('top.redo'), keys: `${t('key.ctrl')}+${t('key.shift')}+Z` })" :aria-label="t('top.redo')" @click="undo.redo()"><Redo2 :size="18" /></button>
      </div>
      <div class="btn-group file-group" role="group" :aria-label="t('top.file')">
        <button class="icon-btn" :title="t('top.export')" :aria-label="t('top.export')" @click="exportFile"><Download :size="18" /></button>
        <button class="icon-btn" :title="t('top.import')" :aria-label="t('top.import')" @click="fileInput?.click()"><Upload :size="18" /></button>
        <button class="icon-btn" :disabled="exporting" :title="t('top.png')" :aria-label="t('top.png')" @click="exportPng"><ImageDown :size="18" /></button>
        <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="importFile" />
      </div>
      <button class="icon-btn" :title="t('top.feedback')" :aria-label="t('top.feedback')" @click="$emit('feedback')"><MessageSquareText :size="18" /></button>
      <button class="icon-btn" :title="t('common.withKeys', { label: t('top.help'), keys: '?' })" :aria-label="t('top.help')" @click="$emit('help')"><CircleHelp :size="18" /></button>
    </div>
  </header>
</template>
