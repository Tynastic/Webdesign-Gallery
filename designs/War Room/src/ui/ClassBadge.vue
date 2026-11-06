<script setup lang="ts">
import type { NationClass } from '../../shared/points'
import { t } from '../i18n'
import { fmtPoints } from '../i18n/format'
import { PRICES } from '../../shared/points'

/** Nation class I (large) … III (small). */
defineProps<{ cls: NationClass }>()
const ROMAN = ['I', 'II', 'III'] as const
</script>

<template>
  <span class="cls-badge" :title="t('class.title', { n: String(cls), province: fmtPoints(PRICES[cls][0]), city: fmtPoints(PRICES[cls][1]) })">{{ ROMAN[cls - 1] }}</span>
</template>
