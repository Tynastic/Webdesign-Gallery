<script setup lang="ts">
import { ChevronLeft, ChevronRight, Lock, Plus, Trash2, UserCheck, X } from 'lucide-vue-next'
import { computed, nextTick, ref, watch } from 'vue'
import { assignPlayer, releasePlayer, setTeam, type Team } from '../../shared/lineup'
import type { Role } from '../../shared/match'
import { addPlayer, removePlayer } from '../../shared/schema'
import { useMatch } from '../composables/useMatch'
import { useYMap } from '../composables/useY'
import { t } from '../i18n'
import { teamLabel } from '../i18n/format'
import { TEAM_SWATCH } from '../map/teamColors'
import { confirmAction, toast } from '../state/feedback'
import { session } from '../state/session'
import ClassBadge from './ClassBadge.vue'
import { usePlanner } from './context'

/**
 * The line-up board: Axis on the left, Allies on the right, nations without a team
 * in between, and the players who have no nation yet underneath. Organizers (room
 * creator, admin) drag nations between teams and players onto nations, or use the
 * buttons and pickers on each card; everyone else sees the same board read-only.
 */
const open = defineModel<boolean>('open', { required: true })
const { data, catalog, plan, lineup, handle, planner } = usePlanner()
const { match, byTeam, nationName } = useMatch()
const players = useYMap(plan.players)
const ownership = useYMap(plan.ownership)
const organizer = handle.canOrganize
const lineupUndo = handle.lineupUndo

const dialog = ref<HTMLDialogElement | null>(null)
watch(
  open,
  async (v) => {
    if (!v) return dialog.value?.close()
    await nextTick()
    dialog.value?.showModal()
  },
  { flush: 'post', immediate: true },
)

/** Columns left to right; the arrows on a card move it one column over. */
const COLUMNS: (Team | null)[] = ['axis', null, 'allies']

const bench = computed(() => [...players.value.values()].filter((p) => !match.value.nationOf.has(p.id)).sort((a, b) => a.joinedAt - b.joinedAt))
/** Bench players asking for each nation. */
const wishes = computed(() => {
  const out = new Map<string, typeof bench.value>()
  for (const p of bench.value) if (p.wish) out.set(p.wish, [...(out.get(p.wish) ?? []), p])
  return out
})
const seatableWishes = computed(() => bench.value.filter((p) => p.wish && !match.value.roles.get(p.wish)?.player))

// ---------- team balance ----------
const owners = computed(() => catalog.owners(ownership.value.entries()))
const held = computed(() => {
  const c = new Map<string, number>()
  for (const o of owners.value) c.set(catalog.list[o].id, (c.get(catalog.list[o].id) ?? 0) + 1)
  return c
})
const balance = computed(() =>
  (['axis', 'allies'] as Team[]).map((team) => {
    const roles = byTeam.value.get(team)!
    return {
      team,
      nations: roles.length,
      players: roles.filter((r) => r.player).length,
      classes: [1, 2, 3].map((c) => roles.filter((r) => r.cls === c).length),
      provinces: roles.reduce((s, r) => s + (held.value.get(r.nation) ?? 0), 0),
    }
  }),
)
const totalProvinces = computed(() => Math.max(1, balance.value[0].provinces + balance.value[1].provinces))

/** Capital lost: its province is held by someone else. */
function capitalHolder(nation: string): string | null {
  const id = catalog.capitalOf.get(nation)
  if (id === undefined) return null
  const holder = catalog.list[owners.value[id]].id
  return holder === nation ? null : holder
}

// ---------- edits (organizers only; the server ignores anyone else's) ----------
function edit(fn: () => void, message?: string) {
  if (!organizer.value) return
  lineupUndo.stopCapturing()
  fn()
  lineupUndo.stopCapturing()
  if (message) toast(message, { label: t('common.undo'), run: () => lineupUndo.undo() })
}

function move(r: Role, dir: -1 | 1) {
  const i = COLUMNS.indexOf(r.team) + dir
  if (i < 0 || i >= COLUMNS.length) return
  edit(() => setTeam(lineup, [r.nation], COLUMNS[i]))
}

function seat(nation: string, player: string | null) {
  const name = player ? players.value.get(player)?.name : null
  edit(
    () => assignPlayer(lineup, nation, player),
    name ? t('lineup.seated', { name, nation: nationName(nation) }) : t('lineup.unseated', { nation: nationName(nation) }),
  )
}

function seatWishes() {
  const list = seatableWishes.value
  edit(() => {
    const taken = new Set<string>()
    for (const p of list) if (!taken.has(p.wish!)) (taken.add(p.wish!), assignPlayer(lineup, p.wish!, p.id))
  }, t('lineup.seatedWishes', { n: list.length }))
}

const newName = ref('')
function add() {
  if (!newName.value.trim() || !organizer.value) return
  handle.undo.stopCapturing()
  addPlayer(plan, newName.value)
  handle.undo.stopCapturing()
  newName.value = ''
}

async function remove(id: string) {
  const p = players.value.get(id)
  if (!p || !organizer.value) return
  const nation = match.value.nationOf.get(id)
  if (!(await confirmAction(t('lineup.removeTitle', { name: p.name }), nation ? t('lineup.removeSeated', { nation: nationName(nation) }) : t('lineup.removeText'), t('common.remove'))))
    return
  edit(() => releasePlayer(lineup, id))
  removePlayer(plan, id)
}

// ---------- drag and drop ----------
type Drag = { kind: 'nation' | 'player'; id: string } | null
const drag = ref<Drag>(null)
const over = ref<string | null>(null)

function start(e: DragEvent, kind: 'nation' | 'player', id: string) {
  if (!organizer.value) return e.preventDefault()
  drag.value = { kind, id }
  e.dataTransfer?.setData('text/plain', id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
function end() {
  drag.value = null
  over.value = null
}
function allow(e: DragEvent, target: string, kinds: ('nation' | 'player')[]) {
  if (!drag.value || !kinds.includes(drag.value.kind)) return
  e.preventDefault()
  over.value = target
}
function dropOnColumn(team: Team | null) {
  const d = drag.value
  end()
  if (d?.kind === 'nation') edit(() => setTeam(lineup, [d.id], team))
}
function dropOnNation(nation: string) {
  const d = drag.value
  end()
  if (d?.kind === 'player') seat(nation, d.id)
}
function dropOnBench() {
  const d = drag.value
  end()
  const nation = d?.kind === 'player' ? match.value.nationOf.get(d.id) : undefined
  if (nation) seat(nation, null)
}

function show(nation: string) {
  open.value = false
  const id = catalog.capitalOf.get(nation)
  if (id !== undefined) planner.value?.flyToProvince(id)
}

const provinceCount = data.provinces.length
</script>

<template>
  <dialog ref="dialog" class="dialog lineup" aria-labelledby="lineup-title" @close="open = false" @cancel="open = false">
    <div class="dialog-head">
      <h2 id="lineup-title">{{ t('lineup.title') }}</h2>
      <button class="icon-btn" :aria-label="t('common.close')" :title="t('common.close')" @click="open = false"><X :size="18" /></button>
    </div>
    <p v-if="organizer" class="muted lineup-intro">{{ t('lineup.textOrganizer') }}</p>
    <p v-else class="lineup-readonly"><Lock :size="14" />{{ t('lineup.readOnly') }}</p>

    <div class="lineup-balance" :aria-label="t('lineup.balance')">
      <div v-for="b in balance" :key="b.team" class="balance-team" :class="`team-${b.team}`">
        <span class="team-swatch" :style="{ background: TEAM_SWATCH[b.team] }" />
        <strong>{{ teamLabel(b.team) }}</strong>
        <span class="balance-facts">
          {{ t('lineup.players', { n: b.players, of: b.nations }) }} ·
          <span class="balance-classes" :title="t('lineup.classesTitle')">I {{ b.classes[0] }} · II {{ b.classes[1] }} · III {{ b.classes[2] }}</span> ·
          {{ t('lineup.provinces', { n: b.provinces }) }}
        </span>
      </div>
      <div class="balance-bar" aria-hidden="true" :title="t('lineup.provincesTitle', { n: provinceCount })">
        <span :style="{ width: `${(balance[0].provinces / totalProvinces) * 100}%`, background: TEAM_SWATCH.axis }" />
        <span :style="{ width: `${(balance[1].provinces / totalProvinces) * 100}%`, background: TEAM_SWATCH.allies }" />
      </div>
    </div>

    <div class="lineup-cols">
      <section
        v-for="(team, ci) in COLUMNS"
        :key="team ?? 'none'"
        class="lineup-col"
        :class="[`team-${team ?? 'none'}`, { over: over === `col-${team}` }]"
        :aria-label="teamLabel(team)"
        @dragover="allow($event, `col-${team}`, ['nation'])"
        @dragleave="over = null"
        @drop.prevent="dropOnColumn(team)"
      >
        <header class="lineup-col-head">
          <span class="team-swatch" :style="{ background: team ? TEAM_SWATCH[team] : TEAM_SWATCH.open }" />
          <h3>{{ teamLabel(team) }}</h3>
          <span class="badge">{{ byTeam.get(team)!.length }}</span>
        </header>
        <p v-if="!byTeam.get(team)!.length" class="lineup-empty">{{ organizer ? t('lineup.dropHere') : t('lineup.noNations') }}</p>
        <ul class="lineup-cards">
          <li
            v-for="r in byTeam.get(team)"
            :key="r.nation"
            class="lineup-card"
            :data-nation="r.nation"
            :class="{ ai: !r.player, over: over === `nation-${r.nation}`, me: r.nation === session.me }"
            :draggable="organizer"
            @dragstart="start($event, 'nation', r.nation)"
            @dragend="end"
            @dragover.stop="allow($event, `nation-${r.nation}`, ['player'])"
            @drop.stop.prevent="dropOnNation(r.nation)"
          >
            <div class="lc-top">
              <span class="dot" :style="{ background: r.color }" :title="t('nations.colourTitle')" />
              <button class="lc-name" :title="t('lineup.showCapital')" @click="show(r.nation)">{{ nationName(r.nation) }}</button>
              <span v-if="capitalHolder(r.nation)" class="lc-lost" :title="t('nations.capitalLost', { nation: nationName(capitalHolder(r.nation)!) })">★</span>
              <ClassBadge :cls="r.cls" />
            </div>
            <div class="lc-player">
              <select v-if="organizer" :value="r.player?.id ?? ''" :aria-label="t('lineup.playerOf', { nation: nationName(r.nation) })" @change="seat(r.nation, ($event.target as HTMLSelectElement).value || null)">
                <option value="">{{ t('lineup.ai') }}</option>
                <option v-if="r.player" :value="r.player.id">{{ r.player.name }}</option>
                <option v-for="p in bench" :key="p.id" :value="p.id">{{ p.name }}{{ p.wish === r.nation ? ` ★ ${t('lineup.wish')}` : '' }}</option>
              </select>
              <span
                v-else
                class="lc-player-name"
                :class="{ ai: !r.player }"
              >{{ r.player?.name ?? t('lineup.ai') }}</span>
              <span
                v-if="organizer && r.player"
                class="lc-handle"
                draggable="true"
                :title="t('lineup.dragPlayer')"
                @dragstart.stop="start($event, 'player', r.player.id)"
                @dragend="end"
              >⠿</span>
            </div>
            <div v-if="organizer" class="lc-move">
              <button v-if="ci > 0" class="icon-btn sm" :title="t('lineup.moveTo', { team: teamLabel(COLUMNS[ci - 1]) })" :aria-label="t('lineup.moveTo', { team: teamLabel(COLUMNS[ci - 1]) })" @click="move(r, -1)"><ChevronLeft :size="14" /></button>
              <button v-if="ci < COLUMNS.length - 1" class="icon-btn sm" :title="t('lineup.moveTo', { team: teamLabel(COLUMNS[ci + 1]) })" :aria-label="t('lineup.moveTo', { team: teamLabel(COLUMNS[ci + 1]) })" @click="move(r, 1)"><ChevronRight :size="14" /></button>
            </div>
            <div v-if="!r.player && wishes.get(r.nation)" class="lc-wishes">
              <span>{{ t('lineup.wishedBy') }}</span>
              <button
                v-for="p in wishes.get(r.nation)"
                :key="p.id"
                class="chip"
                :disabled="!organizer"
                :title="organizer ? t('lineup.seatWish', { name: p.name, nation: nationName(r.nation) }) : ''"
                @click="seat(r.nation, p.id)"
              >
                {{ p.name }}
              </button>
            </div>
          </li>
        </ul>
      </section>
    </div>

    <section
      class="lineup-bench"
      :class="{ over: over === 'bench' }"
      @dragover="allow($event, 'bench', ['player'])"
      @dragleave="over = null"
      @drop.prevent="dropOnBench"
    >
      <header class="lineup-col-head">
        <h3>{{ t('lineup.bench') }}</h3>
        <span class="badge">{{ bench.length }}</span>
        <button v-if="organizer && seatableWishes.length" class="btn" :title="t('lineup.seatWishesTitle')" @click="seatWishes"><UserCheck :size="14" />{{ t('lineup.seatWishes', { n: seatableWishes.length }) }}</button>
      </header>
      <p v-if="!bench.length" class="lineup-empty">{{ t('lineup.benchEmpty') }}</p>
      <ul class="bench-list">
        <li
          v-for="p in bench"
          :key="p.id"
          class="bench-player"
          :class="{ me: p.id === session.player }"
          :draggable="organizer"
          @dragstart="start($event, 'player', p.id)"
          @dragend="end"
        >
          <strong>{{ p.name }}</strong>
          <small v-if="p.wish">{{ t('lineup.wants', { nation: nationName(p.wish) }) }}</small>
          <button v-if="organizer" class="icon-btn sm danger" :title="t('lineup.remove', { name: p.name })" :aria-label="t('lineup.remove', { name: p.name })" @click="remove(p.id)"><Trash2 :size="13" /></button>
        </li>
      </ul>
      <form v-if="organizer" class="bench-add" @submit.prevent="add">
        <input v-model="newName" maxlength="24" :placeholder="t('lineup.addPlaceholder')" :aria-label="t('lineup.addPlaceholder')" />
        <button class="btn" type="submit" :disabled="!newName.trim()"><Plus :size="14" />{{ t('common.add') }}</button>
      </form>
      <p v-if="organizer" class="muted fine">{{ t('lineup.dragHint') }}</p>
    </section>
  </dialog>
</template>
