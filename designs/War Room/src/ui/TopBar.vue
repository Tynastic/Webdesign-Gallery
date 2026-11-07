<script setup lang="ts">
import { CircleHelp, Cloud, CloudOff, Download, ImageDown, LoaderCircle, Redo2, Undo2, Upload, Users } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, ref, shallowRef } from 'vue'
import { exportLineup, importLineup, TEAMS } from '../../shared/lineup'
import { PLAYABLE } from '../../shared/points'
import { exportPlan, ImportError, importPlan, LOCAL_ORIGIN, type PlanSnapshot } from '../../shared/schema'
import { useMatch } from '../composables/useMatch'
import { useUndoState } from '../composables/useY'
import { locale, t } from '../i18n'
import { teamLabel } from '../i18n/format'
import { TEAM_SWATCH } from '../map/teamColors'
import { downloadBlob, exportMapImage } from '../render/exportImage'
import { confirmAction, toast } from '../state/feedback'
import { session } from '../state/session'
import type { Peer } from '../sync/presence'
import { usePlanner } from './context'
import RoomMenu from './RoomMenu.vue'
import SearchBox from './SearchBox.vue'
import { toolLabel } from './toolCatalog'

defineProps<{ meName: string }>()
defineEmits<{ help: []; identity: []; lineup: [] }>()
const { plan, lineup, undo, handle, planner } = usePlanner()
const { byTeam, label, myRole, playersTotal } = useMatch()
const myTeamColor = computed(() => (myRole.value?.team ? TEAM_SWATCH[myRole.value.team] : null))
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
    // Legend: the nations with a player that are in the exported view, team by team, in the colour the map shows.
    const inView = planner.value!.nationsInView()
    const legend = ([...TEAMS, null] as const).flatMap((team) =>
      byTeam.value
        .get(team)!
        .filter((r) => r.player && inView.has(r.nation))
        .map((r, i) => ({ color: planner.value!.markColor(r.nation), label: (i === 0 && team ? `${teamLabel(team)}: ` : '') + label(r.nation) })),
    )
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
  const snap = exportPlan(plan, exportLineup(lineup))
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
    const slots = importPlan(plan, snap, { title: t('plan.untitled'), layerName: t('layer.general') })
    undo.stopCapturing()
    // The line-up is the organizers' to change; everyone else keeps the current one.
    const lineupApplied = !!slots && handle.canOrganize.value
    if (lineupApplied) {
      handle.lineupUndo.stopCapturing()
      importLineup(lineup, slots)
      handle.lineupUndo.stopCapturing()
    }
    session.selectedObject = session.selectedProvince = null
    session.activePhase = null
    session.activeLayer = plan.layers.keys().next().value ?? 'general'
    toast(t(slots && !lineupApplied ? 'file.importedNoLineup' : 'file.imported', { title: snap.title }), {
      label: t('common.undo'),
      run: () => {
        undo.undo()
        if (lineupApplied) handle.lineupUndo.undo()
      },
    })
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
      <component :is="statusInfo.icon" :size="14" :class="{ spin: status === 'connecting' }" /><span class="conn-text">{{ statusInfo.text }}</span>
    </span>
    <SearchBox />
    <div class="topbar-actions">
      <div v-if="handle.room !== 'local'" class="presence" :aria-label="t('top.people')">
        <button
          v-for="p in peers.slice(0, 6)"
          :key="p.clientId"
          class="avatar"
          :style="{ '--c': p.state.user.color, '--t': p.state.user.team ? TEAM_SWATCH[p.state.user.team] : 'var(--line-strong)' }"
          :class="{ following: session.following === p.clientId }"
          :title="t('top.followTitle', { name: p.state.user.nation ? label(p.state.user.nation) : p.state.user.name, tool: p.state.tool ? toolLabel(p.state.tool) : t('top.viewing') })"
          :aria-label="t('top.followAria', { name: p.state.user.name })"
          :aria-pressed="session.following === p.clientId"
          @click="toggleFollow(p)"
        >
          {{ initials(p.state.user.name) }}
        </button>
        <span v-if="peers.length > 6" class="avatar more">+{{ peers.length - 6 }}</span>
        <RoomMenu />
      </div>
      <button class="btn lineup-btn" :title="t('top.lineupTitle')" @click="$emit('lineup')">
        <Users :size="15" /><span class="menu-btn-label">{{ t('top.lineup') }}</span><span class="lineup-count">{{ playersTotal }}/{{ PLAYABLE.length }}</span>
      </button>
      <button class="me-chip" :title="t('top.identity')" @click="$emit('identity')">
        <span v-if="myTeamColor" class="team-swatch" :style="{ background: myTeamColor }" :title="teamLabel(myRole!.team)" /><span class="me-name">{{ meName }}</span>
      </button>
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
      <button class="icon-btn" :title="t('common.withKeys', { label: t('top.help'), keys: '?' })" :aria-label="t('top.help')" @click="$emit('help')"><CircleHelp :size="18" /></button>
    </div>
  </header>
</template>
