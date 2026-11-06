<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { parseRoute } from '../sync/rooms'
import Lobby from './Lobby.vue'

/** Tiny router. The planner (Leaflet, Yjs, map code) is loaded only when a plan is opened. */
const route = parseRoute()
const PlannerGate = defineAsyncComponent(() => import('./PlannerGate.vue'))
const LegalPage = defineAsyncComponent(() => import('./LegalPage.vue'))
const AdminPage = defineAsyncComponent(() => import('./AdminPage.vue'))
</script>

<template>
  <Lobby v-if="route.kind === 'lobby'" />
  <LegalPage v-else-if="route.kind === 'legal'" :page="route.page" />
  <AdminPage v-else-if="route.kind === 'admin'" />
  <PlannerGate v-else :room="route.kind === 'room' ? route.id : 'local'" />
</template>
