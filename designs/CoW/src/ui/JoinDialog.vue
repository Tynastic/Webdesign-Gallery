<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { addNation, updateNation } from '../../shared/schema'
import { useYMap } from '../composables/useY'
import { t } from '../i18n'
import { session } from '../state/session'
import { usePlanner } from './context'
import NationSelect from './NationSelect.vue'

/** "Which nation do you play?" — asked once per room; changeable later from the top bar. */
const open = defineModel<boolean>('open', { required: true })
const { catalog, plan, undo } = usePlanner()
const roster = useYMap(plan.nations)

const dialog = ref<HTMLDialogElement | null>(null)
const nickname = ref('')
const choice = ref('')
const nameInput = ref<HTMLInputElement | null>(null)

watch(
  open,
  async (v) => {
    if (!v) return dialog.value?.close()
    choice.value = session.me ?? ''
    nickname.value = (session.me && plan.nations.get(session.me)?.nickname) || ''
    await nextTick()
    dialog.value?.showModal()
    nameInput.value?.focus()
  },
  { flush: 'post', immediate: true },
)

const claimed = computed(() => (choice.value ? roster.value.get(choice.value) : undefined))
const takenBy = computed(() => (claimed.value?.nickname && claimed.value.nickname !== nickname.value.trim() ? claimed.value.nickname : ''))

function pick(id: string) {
  choice.value = id
  const entry = plan.nations.get(id)
  if (entry?.nickname && !nickname.value.trim()) nickname.value = entry.nickname
}

function confirm() {
  const id = choice.value
  if (!id) return
  const name = nickname.value.trim()
  undo.stopCapturing()
  if (!plan.nations.has(id)) addNation(plan, id, name)
  else if (name && plan.nations.get(id)!.nickname !== name) updateNation(plan, id, { nickname: name })
  undo.stopCapturing()
  session.me = id
  open.value = false
}

function spectate() {
  session.me = null
  open.value = false
}
</script>

<template>
  <dialog ref="dialog" class="dialog join" aria-labelledby="join-title" @cancel.prevent="spectate">
    <form @submit.prevent="confirm">
      <h2 id="join-title">{{ t('join.title') }}</h2>
      <p class="muted">{{ t('join.text') }}</p>

      <label class="field">
        <span>{{ t('join.nickname') }}</span>
        <input ref="nameInput" v-model="nickname" maxlength="24" :placeholder="t('join.nickPlaceholder')" autocomplete="nickname" />
      </label>

      <div v-if="roster.size" class="field">
        <span>{{ t('join.inPlan') }}</span>
        <div class="join-grid" role="radiogroup" :aria-label="t('join.inPlan')">
          <button
            v-for="n in roster.values()"
            :key="n.id"
            type="button"
            class="join-opt"
            role="radio"
            :aria-checked="choice === n.id"
            @click="pick(n.id)"
          >
            <span class="dot lg" :style="{ background: n.color }" />
            <span class="join-opt-text">
              <strong>{{ catalog.byId.get(n.id)?.name ?? n.id }}</strong>
              <small>{{ n.nickname || t('join.noPlayer') }}</small>
            </span>
          </button>
        </div>
      </div>

      <label class="field">
        <span>{{ roster.size ? t('join.other') : t('join.nation') }}</span>
        <NationSelect :model-value="roster.has(choice) ? '' : choice" :label="t('join.nation')" :placeholder="t('join.choose')" :exclude="[...roster.keys()]" @update:model-value="pick" />
      </label>

      <p v-if="takenBy" class="warn-text">{{ t('join.taken', { name: takenBy }) }}</p>

      <div class="dialog-actions spread">
        <button type="button" class="btn ghost big" @click="spectate">{{ t('join.watch') }}</button>
        <button type="submit" class="btn primary big" :disabled="!choice">{{ t('join.as', { nation: catalog.byId.get(choice)?.name ?? '…' }) }}</button>
      </div>
    </form>
  </dialog>
</template>
