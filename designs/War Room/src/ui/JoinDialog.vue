<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { assignPlayer, TEAMS, type Team } from '../../shared/lineup'
import { addPlayer, cleanName, updatePlayer } from '../../shared/schema'
import { useMatch } from '../composables/useMatch'
import { useYMap } from '../composables/useY'
import { t } from '../i18n'
import { teamLabel } from '../i18n/format'
import { session } from '../state/session'
import ClassBadge from './ClassBadge.vue'
import { usePlanner } from './context'

/**
 * "Who are you?" — asked once per room; changeable later from the identity chip.
 * Pick yourself if an organizer already listed you, or sign up with the nation you
 * would like. Organizers seat themselves directly; everyone else's wish shows up
 * in the line-up for an organizer to allot.
 */
const open = defineModel<boolean>('open', { required: true })
const { plan, lineup, undo, handle } = usePlanner()
const { match, role, nationName, byTeam } = useMatch()
const players = useYMap(plan.players)
const canOrganize = handle.canOrganize

const dialog = ref<HTMLDialogElement | null>(null)
const nameInput = ref<HTMLInputElement | null>(null)
/** An existing player picked from the list, or null for signing up as someone new. */
const existing = ref<string | null>(null)
const name = ref('')
const wish = ref<string | null>(null)

watch(
  open,
  async (v) => {
    if (!v) return dialog.value?.close()
    existing.value = session.player && plan.players.has(session.player) ? session.player : null
    name.value = ''
    wish.value = existing.value ? (plan.players.get(existing.value)?.wish ?? null) : null
    await nextTick()
    dialog.value?.showModal()
    if (!existing.value) nameInput.value?.focus()
  },
  { flush: 'post', immediate: true },
)

const playerList = computed(() =>
  [...players.value.values()]
    .map((p) => ({ ...p, nation: match.value.nationOf.get(p.id) ?? null }))
    .sort((a, b) => Number(!!b.nation) - Number(!!a.nation) || a.name.localeCompare(b.name)),
)
/** The picked player already plays a nation: nothing to choose. */
const seatedNation = computed(() => (existing.value ? (match.value.nationOf.get(existing.value) ?? null) : null))
const choosingNation = computed(() => !seatedNation.value)
const free = (nation: string) => !role(nation)?.player
const sameName = computed(() => {
  const n = cleanName(name.value).toLocaleLowerCase()
  return n ? playerList.value.find((p) => p.name.toLocaleLowerCase() === n) : undefined
})
/** Organizers seat themselves on a free nation right away. */
const seatsNow = computed(() => canOrganize.value && !!wish.value && free(wish.value) && choosingNation.value)

const groups = computed(() =>
  ([...TEAMS, null] as (Team | null)[]).map((team) => ({ team, roles: byTeam.value.get(team)! })).filter((g) => g.roles.length),
)

function pickExisting(id: string) {
  existing.value = existing.value === id ? null : id
  wish.value = existing.value ? (plan.players.get(existing.value)?.wish ?? null) : null
  if (!existing.value) nextTick(() => nameInput.value?.focus())
}

function toggleWish(nation: string) {
  if (!free(nation)) return
  wish.value = wish.value === nation ? null : nation
}

const canConfirm = computed(() => !!existing.value || !!cleanName(name.value))
const confirmLabel = computed(() => {
  if (existing.value && seatedNation.value) return t('join.continueAs', { name: plan.players.get(existing.value)?.name ?? '' })
  if (seatsNow.value) return t('join.as', { nation: nationName(wish.value!) })
  return existing.value ? t('join.save') : t('join.signUp')
})

function confirm() {
  if (!canConfirm.value) return
  undo.stopCapturing()
  let id = existing.value
  if (id) {
    if (choosingNation.value && plan.players.get(id)?.wish !== wish.value) updatePlayer(plan, id, { wish: wish.value })
  } else id = addPlayer(plan, name.value, wish.value)
  undo.stopCapturing()
  if (seatsNow.value) {
    handle.lineupUndo.stopCapturing()
    assignPlayer(lineup, wish.value!, id)
  }
  session.player = id
  open.value = false
}

function spectate() {
  session.player = null
  open.value = false
}
</script>

<template>
  <dialog ref="dialog" class="dialog join" aria-labelledby="join-title" @cancel.prevent="spectate">
    <form @submit.prevent="confirm">
      <h2 id="join-title">{{ t('join.title') }}</h2>
      <p class="muted">{{ t('join.text') }}</p>

      <div v-if="playerList.length" class="field">
        <span>{{ t('join.listed') }}</span>
        <div class="join-players" role="radiogroup" :aria-label="t('join.listed')">
          <button
            v-for="p in playerList"
            :key="p.id"
            type="button"
            class="join-player"
            role="radio"
            :aria-checked="existing === p.id"
            @click="pickExisting(p.id)"
          >
            <span class="dot" :style="{ background: p.nation ? role(p.nation)?.color : 'transparent' }" />
            <strong>{{ p.name }}</strong>
            <small>{{ p.nation ? nationName(p.nation) : t('join.bench') }}</small>
          </button>
        </div>
      </div>

      <label v-if="!existing" class="field">
        <span>{{ playerList.length ? t('join.newName') : t('join.nickname') }}</span>
        <input ref="nameInput" v-model="name" maxlength="24" :placeholder="t('join.nickPlaceholder')" autocomplete="nickname" />
      </label>
      <p v-if="!existing && sameName" class="warn-text">{{ t('join.nameTaken', { name: sameName.name }) }}</p>

      <div v-if="choosingNation" class="field join-wish">
        <span>{{ t('join.wish') }} <small class="muted">· {{ canOrganize ? t('join.wishOrganizer') : t('join.wishHint') }}</small></span>
        <div class="join-teams">
          <div v-for="g in groups" :key="g.team ?? 'none'" class="join-team" :class="`team-${g.team ?? 'none'}`">
            <h3>{{ teamLabel(g.team) }}</h3>
            <div class="join-grid" role="radiogroup" :aria-label="teamLabel(g.team)">
              <button
                v-for="r in g.roles"
                :key="r.nation"
                type="button"
                class="join-opt"
                :data-nation="r.nation"
                role="radio"
                :aria-checked="wish === r.nation"
                :disabled="!!r.player"
                :title="r.player ? t('join.takenBy', { name: r.player.name }) : ''"
                @click="toggleWish(r.nation)"
              >
                <span class="join-opt-text">
                  <strong>{{ nationName(r.nation) }}</strong>
                  <small>{{ r.player ? r.player.name : t('join.free') }}</small>
                </span>
                <ClassBadge :cls="r.cls" />
              </button>
            </div>
          </div>
        </div>
      </div>
      <p v-else-if="seatedNation" class="join-seated">{{ t('join.seated', { nation: nationName(seatedNation) }) }}</p>

      <div class="dialog-actions spread">
        <button type="button" class="btn ghost big" @click="spectate">{{ t('join.watch') }}</button>
        <button type="submit" class="btn primary big" :disabled="!canConfirm">{{ confirmLabel }}</button>
      </div>
    </form>
  </dialog>
</template>
