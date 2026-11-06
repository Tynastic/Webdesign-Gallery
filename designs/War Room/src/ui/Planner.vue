<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect, type Component } from 'vue'
import { importLineup } from '../../shared/lineup'
import { deleteObjects, legacyLineup, LOCAL_ORIGIN } from '../../shared/schema'
import { useMap } from '../composables/useMap'
import { useMatch } from '../composables/useMatch'
import { useYArray, useYMap } from '../composables/useY'
import { t, tm } from '../i18n'
import type { NationCatalog } from '../map/nations'
import type { MapData } from '../map/types'
import { toast } from '../state/feedback'
import { loadPlayer, savePlayer, session, takeLegacyNation, type ToolId } from '../state/session'
import type { PlanHandle } from '../sync/planDoc'
import { CloudOff, Eye, Info, X } from 'lucide-vue-next'
import ConfirmDialog from './ConfirmDialog.vue'
import { providePlanner } from './context'
import HelpDialog from './HelpDialog.vue'
import Inspector from './Inspector.vue'
import JoinDialog from './JoinDialog.vue'
import LayersPanel from './LayersPanel.vue'
import LineupDialog from './LineupDialog.vue'
import MapLegend from './MapLegend.vue'
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
const { plan, lineup, undo, presence, room, match: matchState, canOrganize } = props.handle

const mapEl = ref<HTMLElement | null>(null)
const planner = useMap(mapEl, props.data, props.catalog, plan, undo, presence, matchState, { lineup })
providePlanner({ data: props.data, catalog: props.catalog, plan, lineup, undo, handle: props.handle, planner })

const { match, role, label, playerNations } = useMatch({ handle: props.handle, catalog: props.catalog })
const players = useYMap(plan.players)
const phases = useYArray(plan.phases)
const helpOpen = ref(false)
const status = props.handle.status

/**
 * Rooms from before v0.5 kept players as nicknames on nations. The first organizer
 * to open such a room turns them into players and line-up slots (once).
 */
function migrateLegacyRoster() {
  if (!canOrganize.value || lineup.meta.get('legacyMigrated') || lineup.slots.size) return
  const legacy = legacyLineup(plan.nations.values())
  plan.doc.transact(() => legacy.players.forEach((p) => plan.players.set(p.id, p)), LOCAL_ORIGIN)
  importLineup(lineup, legacy.slots)
  lineup.doc.transact(() => lineup.meta.set('legacyMigrated', true), LOCAL_ORIGIN)
  undo.clear()
  props.handle.lineupUndo.clear()
}
migrateLegacyRoster()
watch(canOrganize, migrateLegacyRoster)

// Which player I am is remembered per room; ask when unknown (spectating is allowed).
session.player = loadPlayer(room)
if (!session.player) {
  // Before v0.5 this browser remembered a nation: continue as its player.
  const nation = takeLegacyNation(room)
  session.player = (nation && matchState.current.roles.get(nation)?.player?.id) || null
}
if (session.player && !plan.players.has(session.player)) session.player = null
const joinOpen = ref(!session.player)
let joinedAt = 0
// Synchronous: the line-up change from seating myself is handled in the same flush.
watch(
  joinOpen,
  (open) => {
    if (!open) joinedAt = Date.now()
  },
  { flush: 'sync' },
)
if (!plan.layers.has(session.activeLayer)) session.activeLayer = plan.layers.keys().next().value ?? 'general'
if (session.activePhase && !plan.phases.toArray().some((p) => p.id === session.activePhase)) session.activePhase = null
session.me = matchState.current.nationOf.get(session.player ?? '') ?? null
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
  () => session.player,
  (p) => savePlayer(room, p),
)
// My player was removed (or an import replaced the players): ask again.
watch(players, (list) => {
  if (session.player && !list.has(session.player)) {
    session.player = null
    joinOpen.value = true
  }
})
// The nation I play follows the line-up, which organizers may change at any time.
watch(
  () => (session.player ? (match.value.nationOf.get(session.player) ?? null) : null),
  (me, before) => {
    session.me = me
    if (session.assignNation === before || session.assignNation === null) session.assignNation = me
    if (session.ownNation === before || session.ownNation === null) session.ownNation = me
    // Tell me when an organizer seats me; not when I just picked the nation myself.
    if (me && before !== undefined && me !== before && Date.now() - joinedAt > 1500) toast(t('match.nowPlaying', { nation: props.catalog.byId.get(me)?.name ?? me }))
  },
  { immediate: true },
)

// Tell everyone in the room who I am.
watchEffect(() => {
  const me = role(session.me)
  const player = session.player ? players.value.get(session.player) : undefined
  presence.setUser({
    name: player?.name || t('me.spectator'),
    nation: session.me,
    color: me?.color ?? '#9a9a84',
    team: me?.team ?? null,
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
  if (helpOpen.value || joinOpen.value || session.lineupOpen) return
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
  if (e.key.toLowerCase() === 'l') return void (session.lineupOpen = true)
  if (e.key === '[') return stepPhase(-1)
  if (e.key === ']') return stepPhase(1)
  if ((session.tool === 'assign' || session.tool === 'own') && /^[0-9]$/.test(e.key)) {
    const ids = playerNations.value.map((r) => r.nation)
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

const meName = () => {
  const player = session.player ? players.value.get(session.player) : undefined
  if (!player) return t('me.spectator')
  return session.me ? label(session.me) : t('me.bench', { name: player.name })
}
</script>

<template>
  <div class="shell">
    <TopBar :me-name="meName()" @help="helpOpen = true" @identity="joinOpen = true" @lineup="session.lineupOpen = true" />
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
          <div class="chrome-right">
            <MapLegend />
            <ZoomControl />
          </div>
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
    <LineupDialog v-model:open="session.lineupOpen" />
    <ConfirmDialog />
  </div>
</template>
