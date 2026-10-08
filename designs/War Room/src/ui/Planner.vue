<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect, type Component } from 'vue'
import { deleteObjects, displayName } from '../../shared/schema'
import { useMap } from '../composables/useMap'
import { useYArray, useYMap } from '../composables/useY'
import { t, tm } from '../i18n'
import type { NationCatalog } from '../map/nations'
import type { MapData } from '../map/types'
import { toast } from '../state/feedback'
import { loadMe, saveMe, session, type ToolId } from '../state/session'
import type { PlanHandle } from '../sync/planDoc'
import { CloudOff, Eye, Info, X } from 'lucide-vue-next'
import ConfirmDialog from './ConfirmDialog.vue'
import { providePlanner } from './context'
import HelpDialog from './HelpDialog.vue'
import Inspector from './Inspector.vue'
import JoinDialog from './JoinDialog.vue'
import LayersPanel from './LayersPanel.vue'
import MapViewMenu from './MapViewMenu.vue'
import NationsPanel from './NationsPanel.vue'
import PhaseBar from './PhaseBar.vue'
import PointsPanel from './PointsPanel.vue'
import Toasts from './Toasts.vue'
import { TOOL_BY_KEY, toolLabel } from './toolCatalog'
import Toolbar from './Toolbar.vue'
import ToolOptions from './ToolOptions.vue'
import TopBar from './TopBar.vue'
import ZoomControl from './ZoomControl.vue'

const props = defineProps<{ data: MapData; catalog: NationCatalog; handle: PlanHandle }>()
const { plan, undo, presence, room } = props.handle

const mapEl = ref<HTMLElement | null>(null)
const planner = useMap(mapEl, props.data, props.catalog, plan, undo, presence)
providePlanner({ data: props.data, catalog: props.catalog, plan, undo, handle: props.handle, planner })

const roster = useYMap(plan.nations)
const phases = useYArray(plan.phases)
const helpOpen = ref(false)
const status = props.handle.status

// Which nation I play is remembered per room; ask when unknown (spectating is allowed).
session.me = loadMe(room)
if (session.me && !plan.nations.has(session.me)) session.me = null
const joinOpen = ref(!session.me)
if (!plan.layers.has(session.activeLayer)) session.activeLayer = plan.layers.keys().next().value ?? 'general'
if (session.activePhase && !plan.phases.toArray().some((p) => p.id === session.activePhase)) session.activePhase = null
session.assignNation = session.me
session.ownNation = session.me

// The point counter follows the phase bar: one phase = that day, "All" = every day.
watch(
  () => session.activePhase,
  (id) => (session.pointsPhases = id ? [id] : []),
)

// ---------- sidebar: the panels that matter for the active tool, most relevant first ----------
type PanelId = 'inspector' | 'nations' | 'points' | 'layers'
const PANELS: Record<PanelId, Component> = { inspector: Inspector, nations: NationsPanel, points: PointsPanel, layers: LayersPanel }
const ALL_PANELS: PanelId[] = ['inspector', 'nations', 'points', 'layers']
function panelsFor(tool: ToolId): PanelId[] {
  switch (tool) {
    case 'assign':
      return ['points', 'inspector', 'nations']
    case 'own':
      return ['inspector', 'nations', 'points']
    case 'select':
    case 'measure':
    case 'ping':
      return ALL_PANELS
    default: // drawing tools: what is drawn, and where it goes
      return ['inspector', 'layers']
  }
}
// Pinging is a one-shot from whatever tool was active; keep that tool's panels meanwhile.
let lastTool: ToolId = session.tool
const sidePanels = computed(() => {
  if (session.tool !== 'ping') lastTool = session.tool
  const ids = panelsFor(lastTool)
  // Outside the select tool the inspector only shows up when there is something to inspect.
  const inspecting = lastTool === 'select' || session.selectedObject !== null || session.selectedProvince !== null
  return ids.filter((id) => id !== 'inspector' || inspecting).map((id) => ({ id, component: PANELS[id] }))
})

watch(
  () => session.me,
  (me) => {
    saveMe(room, me)
    if (me) {
      session.assignNation ??= me
      session.ownNation ??= me
    }
  },
)

// Tell everyone in the room who I am.
watchEffect(() => {
  const me = session.me
  const entry = me ? roster.value.get(me) : undefined
  const nation = me ? props.catalog.byId.get(me) : undefined
  presence.setUser({
    name: entry?.nickname || nation?.name || t('me.spectator'),
    nation: me,
    color: entry?.color ?? '#9a9a84',
  })
})

// Pings from teammates that land off-screen get a toast with a way to go there.
const offPing = presence.onPing((p) => {
  if (p.self || planner.value?.isVisible(p.x, p.y)) return
  toast(t('toast.pinged', { name: p.user.name }), { label: t('common.show'), run: () => planner.value?.flyToPoint(p.x, p.y) }, 7000)
})
onBeforeUnmount(offPing)

// ---------- follow another player's view ----------
const followedName = ref('')
let lastView = ''
function syncFollow() {
  const id = session.following
  if (id === null) return
  const peer = presence.peers().find((p) => p.clientId === id)
  if (!peer) {
    toast(t('follow.gone', { name: followedName.value }))
    session.following = null
    return
  }
  followedName.value = peer.state.user.name
  const view = peer.state.view
  const key = view ? `${view.x},${view.y},${view.z}` : ''
  if (view && key !== lastView) {
    lastView = key
    planner.value?.followView(view)
  }
}
onBeforeUnmount(presence.onChange(syncFollow))
watch(
  () => session.following,
  () => {
    lastView = ''
    syncFollow()
  },
)

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.isContentEditable
}

function deleteSelection() {
  const id = session.selectedObject
  const obj = id ? plan.objects.get(id) : undefined
  if (!obj) return
  if (obj.locked) return toast(t('toast.locked'))
  undo.stopCapturing()
  deleteObjects(plan, [obj.id])
  undo.stopCapturing()
  session.selectedObject = null
  toast(t('toast.deleted', { what: toolLabel(obj.type) }), { label: t('common.undo'), run: () => undo.undo() })
}

function stepPhase(dir: 1 | -1) {
  const list = phases.value
  if (!list.length) return
  const i = session.activePhase ? list.findIndex((p) => p.id === session.activePhase) : -1
  const next = i + dir
  session.activePhase = next < 0 || next >= list.length ? null : list[next].id
}

function onKey(e: KeyboardEvent) {
  if (helpOpen.value || joinOpen.value) return
  if (isTyping(e)) {
    if (e.key === 'Escape') (e.target as HTMLElement).blur()
    return
  }
  const mod = e.ctrlKey || e.metaKey
  if (planner.value?.handleKey(e)) return e.preventDefault()

  if (mod && e.key.toLowerCase() === 'z') {
    e.shiftKey ? undo.redo() : undo.undo()
    return e.preventDefault()
  }
  if (mod && e.key.toLowerCase() === 'y') {
    undo.redo()
    return e.preventDefault()
  }
  if (mod || e.altKey) return

  if (e.key === 'Delete' || e.key === 'Backspace') return deleteSelection()
  if (e.key === 'Escape') {
    if (session.tool !== 'select') session.tool = 'select'
    else session.selectedObject = session.selectedProvince = null
    return
  }
  if (e.key === '?') return void (helpOpen.value = true)
  if (e.key === '[') return stepPhase(-1)
  if (e.key === ']') return stepPhase(1)
  if ((session.tool === 'assign' || session.tool === 'own') && /^[0-9]$/.test(e.key)) {
    const ids = [...roster.value.keys()]
    const pick = e.key === '0' ? null : (ids[Number(e.key) - 1] ?? undefined)
    if (pick === undefined) return
    if (session.tool === 'assign') session.assignNation = pick
    else session.ownNation = pick
    return
  }
  const tool = TOOL_BY_KEY.get(e.key.toLowerCase())
  if (tool) session.tool = tool
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

const meName = () => (session.me ? displayName(roster.value.get(session.me), props.catalog.byId.get(session.me)?.name ?? session.me) : t('me.spectator'))
</script>

<template>
  <div class="shell">
    <TopBar :me-name="meName()" @help="helpOpen = true" @identity="joinOpen = true" />
    <Toolbar />

    <main class="stage" :class="`tool-${session.tool}`">
      <div ref="mapEl" class="map" role="application" :aria-label="t('planner.map')" />
      <!-- Floating chrome in two stacks that flow around each other instead of overlapping. -->
      <div class="map-chrome">
        <div class="chrome-top">
          <ToolOptions />
          <div class="chrome-notices">
            <div v-if="session.following !== null && followedName" class="follow-banner" role="status">
              <Eye :size="15" />{{ t('follow.banner', { name: followedName }) }}
              <button class="btn" @click="session.following = null"><X :size="14" />{{ t('follow.stop') }}</button>
            </div>
            <Toasts />
          </div>
        </div>
        <!-- Bottom line: View menu and phase bar, the status line beside them when it fits (else above), zoom at the right. -->
        <div class="chrome-bottom">
          <div class="chrome-left">
            <div class="chrome-row">
              <MapViewMenu />
              <PhaseBar />
            </div>
            <div class="statusbar chrome-surface" role="status" aria-live="polite"><Info :size="15" class="statusbar-icon" />{{ tm(session.hint) || t('status.ready') }}</div>
          </div>
          <ZoomControl />
        </div>
      </div>
      <div v-if="status === 'denied'" class="gone-overlay" role="alertdialog" aria-live="assertive">
        <CloudOff :size="28" />
        <p>{{ t('room.gone') }}</p>
        <a class="btn primary big" href="/">{{ t('gate.back') }}</a>
      </div>
    </main>

    <aside class="sidebar" :aria-label="t('planner.panels')">
      <component :is="p.component" v-for="p in sidePanels" :key="p.id" />
    </aside>

    <HelpDialog v-model:open="helpOpen" />
    <JoinDialog v-model:open="joinOpen" />
    <ConfirmDialog />
  </div>
</template>
