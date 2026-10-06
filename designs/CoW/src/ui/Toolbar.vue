<script setup lang="ts">
import { t } from '../i18n'
import { session } from '../state/session'
import { TOOL_GROUPS, toolHelp, toolLabel } from './toolCatalog'
</script>

<template>
  <nav class="toolbar" :aria-label="t('planner.tools')">
    <template v-for="(group, gi) in TOOL_GROUPS" :key="gi">
      <div v-if="gi" class="toolbar-sep" role="separator" />
      <button
        v-for="tool in group"
        :key="tool.id"
        class="tool-btn"
        :class="{ active: session.tool === tool.id }"
        :aria-pressed="session.tool === tool.id"
        :aria-label="t('toolbar.button', { label: toolLabel(tool.id), key: tool.key })"
        @click="session.tool = tool.id"
      >
        <component :is="tool.icon" :size="20" :stroke-width="1.9" />
        <span class="tool-key" aria-hidden="true">{{ tool.key }}</span>
        <span class="tool-tip" role="tooltip">
          <b>{{ toolLabel(tool.id) }}</b> <kbd>{{ tool.key }}</kbd>
          <small>{{ toolHelp(tool.id) }}</small>
        </span>
      </button>
    </template>
  </nav>
</template>
