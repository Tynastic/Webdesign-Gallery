<script setup lang="ts">
import { Copy, KeyRound, Link, Share2, Trash2 } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { t } from '../i18n'
import { confirmAction, toast } from '../state/feedback'
import { deleteRoom, getRoom, ownerToken, roomUrl } from '../sync/rooms'
import { usePlanner } from './context'
import MenuPopover from './MenuPopover.vue'

/** Room facts and management in a top-bar menu (rooms only, not the offline plan). */
const { handle } = usePlanner()
const url = roomUrl(handle.room)
const isOwner = !!ownerToken(handle.room)
const open = ref(false)
const isProtected = ref(false)
const deleting = ref(false)

onMounted(async () => {
  isProtected.value = (await getRoom(handle.room))?.protected ?? false
})

async function copy() {
  try {
    await navigator.clipboard.writeText(url)
    toast(t('top.linkCopied'))
    open.value = false
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
  <MenuPopover v-model:open="open" class="room-menu" :label="t('panel.room')" :title="t('top.roomTitle')">
    <template #button><Share2 :size="15" /><span class="menu-btn-label">{{ t('panel.room') }}</span></template>
    <div class="room-link">
      <Link :size="14" />
      <input :value="url" readonly :aria-label="t('top.shareTitle')" @focus="($event.target as HTMLInputElement).select()" />
    </div>
    <button class="btn primary room-copy" @click="copy"><Copy :size="14" />{{ t('room.copy') }}</button>
    <p class="room-fact"><KeyRound :size="13" />{{ isProtected ? t('room.protected') : t('room.open') }}</p>
    <p class="muted fine">{{ t('room.expiry') }}</p>
    <div v-if="isOwner" class="menu-foot">
      <p class="muted fine">{{ t('room.owner') }}</p>
      <button class="btn danger-outline" :disabled="deleting" @click="remove"><Trash2 :size="14" />{{ t('room.delete') }}</button>
    </div>
  </MenuPopover>
</template>
