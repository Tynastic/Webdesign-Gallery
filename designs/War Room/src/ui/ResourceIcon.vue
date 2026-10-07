<script setup lang="ts">
import type { Resource } from '../map/types'
import { GLYPH_HALO, RESOURCE_GLYPHS } from '../render/resourceGlyphs'

/** The map's resource glyph (wheat ear, ingot, drop) for use in the UI. */
withDefaults(defineProps<{ res: Resource; size?: number }>(), { size: 14 })
</script>

<template>
  <svg class="res-icon" viewBox="0 0 24 24" :width="size" :height="size" aria-hidden="true">
    <path :d="RESOURCE_GLYPHS[res].d" :fill="RESOURCE_GLYPHS[res].color" :stroke="GLYPH_HALO" stroke-width="4" stroke-linejoin="round" paint-order="stroke" />
  </svg>
</template>
