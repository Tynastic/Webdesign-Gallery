<script setup lang="ts">
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-vue-next'
import { nextTick, ref } from 'vue'
import { addPhase, removePhase, renamePhase } from '../../shared/schema'
import { useYArray, useYMap } from '../composables/useY'
import { t } from '../i18n'
import { confirmAction, toast } from '../state/feedback'
import { session } from '../state/session'
import { usePlanner } from './context'

const { plan, undo } = usePlanner()
const phases = useYArray(plan.phases)
const objects = useYMap(plan.objects)
const assignments = useYMap(plan.assignments)

const editing = ref<string | null>(null)
const draft = ref('')
const editInput = ref<HTMLInputElement[]>([])

function step(dir: 1 | -1) {
  const list = phases.value
  const i = session.activePhase ? list.findIndex((p) => p.id === session.activePhase) : -1
  const next = i + dir
  session.activePhase = next < 0 || next >= list.length ? null : list[next].id
}

async function add() {
  const id = addPhase(plan, t('phase.default', { n: phases.value.length + 1 }))
  session.activePhase = id
  await startEdit(id)
}

async function startEdit(id: string) {
  editing.value = id
  draft.value = phases.value.find((p) => p.id === id)?.name ?? ''
  await nextTick()
  editInput.value[0]?.select()
}

function commit() {
  if (editing.value && draft.value.trim()) renamePhase(plan, editing.value, draft.value.trim())
  editing.value = null
}

async function remove(id: string, name: string) {
  const used =
    [...objects.value.values()].filter((o) => o.phaseId === id).length + [...assignments.value.values()].filter((a) => a.phaseId === id).length
  if (used && !(await confirmAction(t('phase.confirmTitle', { name }), t('phase.confirmText', { n: used }), t('common.delete')))) return
  removePhase(plan, id)
  if (session.activePhase === id) session.activePhase = null
  toast(t('phase.deleted', { name }), { label: t('common.undo'), run: () => undo.undo() })
}
</script>

<template>
  <div class="phase-bar" role="toolbar" :aria-label="t('phase.bar')">
    <template v-if="phases.length">
      <button class="icon-btn sm" :title="`${t('phase.prev')} ([)`" :aria-label="t('phase.prev')" @click="step(-1)"><ChevronLeft :size="16" /></button>
      <button class="phase-chip" :aria-pressed="session.activePhase === null" :title="t('phase.allTitle')" @click="session.activePhase = null">{{ t('phase.all') }}</button>
      <div v-for="(p, i) in phases" :key="p.id" class="phase-chip-wrap">
        <input
          v-if="editing === p.id"
          ref="editInput"
          v-model="draft"
          class="phase-input"
          :aria-label="t('phase.nameLabel')"
          maxlength="32"
          @blur="commit"
          @keydown.enter="commit"
          @keydown.esc="editing = null"
        />
        <button
          v-else
          class="phase-chip"
          :aria-pressed="session.activePhase === p.id"
          :title="t('phase.chipTitle', { name: p.name })"
          @click="session.activePhase = p.id"
          @dblclick="startEdit(p.id)"
        >
          <span class="phase-num">{{ i + 1 }}</span>{{ p.name }}
        </button>
        <button
          v-if="session.activePhase === p.id && editing !== p.id"
          class="phase-del"
          :aria-label="t('phase.deleteAria', { name: p.name })"
          :title="t('phase.delete')"
          @click="remove(p.id, p.name)"
        >
          <X :size="12" />
        </button>
      </div>
      <button class="icon-btn sm" :title="`${t('phase.next')} (])`" :aria-label="t('phase.next')" @click="step(1)"><ChevronRight :size="16" /></button>
      <span class="to-sep" />
    </template>
    <button class="phase-add" :title="t('phase.addTitle')" @click="add">
      <Plus :size="14" />{{ phases.length ? t('phase.add') : t('phase.addFirst') }}
    </button>
  </div>
</template>
