<script setup lang="ts">
import { Copy, KeyRound, Link, Trash2 } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { t } from '../i18n'
import { confirmAction, toast } from '../state/feedback'
import { deleteRoom, getRoom, ownerToken, roomUrl } from '../sync/rooms'
import { usePlanner } from './context'
import PanelSection from './PanelSection.vue'

/** Room facts and management (rooms only, not the offline plan). */
const { handle } = usePlanner()
const url = roomUrl(handle.room)
const isOwner = !!ownerToken(handle.room)
const isProtected = ref(false)
const deleting = ref(false)

onMounted(async () => {
  isProtected.value = (await getRoom(handle.room))?.protected ?? false
})

async function copy() {
  try {
    await navigator.clipboard.writeText(url)
    toast(t('top.linkCopied'))
  } catch {
    window.prompt(t('top.copyPrompt'), url)
  }
}

async function remove() {
  if (!(await confirmAction(t('room.confirmTitle'), t('room.confirmText'), t('room.delete')))) return
  deleting.value = true
  try {
    await deleteRoom(handle.room)
    location.assign('/')
  } catch (err) {
    toast(t('room.deleteFailed', { message: (err as Error).message }))
    deleting.value = false
  }
}
</script>

<template>
  <PanelSection id="room" :title="t('panel.room')">
    <div class="room-link">
      <Link :size="14" />
      <input :value="url" readonly :aria-label="t('top.shareTitle')" @focus="($event.target as HTMLInputElement).select()" />
      <button class="icon-btn sm" :title="t('room.copy')" :aria-label="t('room.copy')" @click="copy"><Copy :size="14" /></button>
    </div>
    <p class="room-fact"><KeyRound :size="13" />{{ isProtected ? t('room.protected') : t('room.open') }}</p>
    <p class="muted fine">{{ t('room.expiry') }}</p>
    <template v-if="isOwner">
      <p class="muted fine">{{ t('room.owner') }}</p>
      <button class="btn danger-outline" :disabled="deleting" @click="remove"><Trash2 :size="14" />{{ t('room.delete') }}</button>
    </template>
  </PanelSection>
</template>
