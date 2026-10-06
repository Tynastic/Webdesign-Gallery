<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { t } from '../i18n'
import { TOOLS, toolHelp, toolLabel } from './toolCatalog'

const open = defineModel<boolean>('open', { required: true })
const version = __APP_VERSION__
const dialog = ref<HTMLDialogElement | null>(null)
watch(open, (v) => (v ? dialog.value?.showModal() : dialog.value?.close()))

// Rebuilt on language change: key names are localised too (Strg, Entf, Umschalt …).
const general = computed<[string, string][]>(() => [
  [`${t('key.ctrl')} + Z / ${t('key.ctrl')} + ${t('key.shift')} + Z`, t('help.undo')],
  [t('key.del'), t('help.delete')],
  ['Esc', t('help.esc')],
  [`/ · ${t('key.ctrl')} + K`, t('help.search')],
  ['[ · ]', t('help.phases')],
  [t('key.altclick'), t('help.ping')],
  ['?', t('help.help')],
])
const paint = computed<[string, string][]>(() => [
  [`${t('key.click')} / ${t('key.drag')}`, t('help.paintDrag')],
  [t('key.clickPainted'), t('help.paintToggle')],
  [t('key.shiftclick'), t('help.paintShift')],
  [t('key.rightclick'), t('help.paintRight')],
  ['1 – 9 · 0', t('help.paintNumbers')],
  [t('key.holdSpace'), t('help.paintSpace')],
])
const draw = computed<[string, string][]>(() => [
  [t('key.click'), t('help.drawClick')],
  [`${t('key.dblclick')} · ${t('key.enter')}`, t('help.drawFinish')],
  [t('key.backspace'), t('help.drawBack')],
  [t('key.drag'), t('help.drawDrag')],
])
</script>

<template>
  <dialog ref="dialog" class="dialog help" aria-labelledby="help-title" @close="open = false" @click.self="open = false">
    <header class="dialog-head">
      <h2 id="help-title">{{ t('help.title') }}</h2>
      <button class="icon-btn" :aria-label="t('common.close')" @click="open = false"><X :size="18" /></button>
    </header>
    <div class="help-grid">
      <section>
        <h3>{{ t('help.tools') }}</h3>
        <dl class="keys">
          <template v-for="tool in TOOLS" :key="tool.id">
            <dt><kbd>{{ tool.key }}</kbd></dt>
            <dd><b>{{ toolLabel(tool.id) }}</b> — {{ toolHelp(tool.id) }}</dd>
          </template>
        </dl>
      </section>
      <section>
        <h3>{{ t('help.general') }}</h3>
        <dl class="keys">
          <template v-for="[k, v] in general" :key="k">
            <dt><kbd>{{ k }}</kbd></dt>
            <dd>{{ v }}</dd>
          </template>
        </dl>
        <h3>{{ t('help.paint') }}</h3>
        <dl class="keys">
          <template v-for="[k, v] in paint" :key="k">
            <dt><kbd>{{ k }}</kbd></dt>
            <dd>{{ v }}</dd>
          </template>
        </dl>
        <h3>{{ t('help.draw') }}</h3>
        <dl class="keys">
          <template v-for="[k, v] in draw" :key="k">
            <dt><kbd>{{ k }}</kbd></dt>
            <dd>{{ v }}</dd>
          </template>
        </dl>
      </section>
    </div>
    <p class="muted help-foot">{{ t('help.footPlanned') }} {{ t('help.footConquered') }} {{ t('help.footSync') }}</p>
    <p class="muted help-meta">
      {{ t('help.version', { version }) }} ·
      <a href="/impressum" target="_blank" rel="noopener">{{ t('legal.impressum') }}</a> ·
      <a href="/datenschutz" target="_blank" rel="noopener">{{ t('legal.privacy') }}</a>
    </p>
  </dialog>
</template>
