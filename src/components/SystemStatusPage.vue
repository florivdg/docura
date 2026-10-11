<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useIntervalFn } from '@vueuse/core'
import { RefreshCw } from 'lucide-vue-next'
import PageLayout from '@/components/PageLayout.vue'
import StatusMessage from '@/components/StatusMessage.vue'
import QueueStatsCard from '@/components/system/QueueStatsCard.vue'
import ServiceStatusCard from '@/components/system/ServiceStatusCard.vue'
import { Button } from '@/components/ui/button'
import { useApiRequest } from '@/composables/useApiRequest'
import type { SystemStatus } from '@/lib/system-status'
import { formatDateTime } from '@/lib/format'
import { serviceCards } from '@/lib/system-status-view'

const POLL_INTERVAL_MS = 15_000

const status = ref<SystemStatus | null>(null)
const { pending, error, run } = useApiRequest()
const cards = computed(() => (status.value ? serviceCards(status.value) : []))

async function load() {
  const result = await run<SystemStatus>(
    '/api/system/status',
    'Der Systemstatus konnte nicht geladen werden.',
  )
  if (result) status.value = result
}

// Background tabs do not poll.
useIntervalFn(() => {
  if (!document.hidden) void load()
}, POLL_INTERVAL_MS)
onMounted(load)
</script>

<template>
  <PageLayout title="System">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-muted-foreground text-sm">
        <template v-if="status">
          Stand: {{ formatDateTime(status.checkedAt) }} · aktualisiert sich alle
          {{ POLL_INTERVAL_MS / 1000 }} Sekunden
        </template>
      </p>
      <Button variant="outline" size="sm" :disabled="pending" @click="load">
        <RefreshCw class="size-4" :class="{ 'animate-spin': pending }" />
        Aktualisieren
      </Button>
    </div>
    <StatusMessage v-if="error" :error="error" notice="" />
    <div v-if="status" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <ServiceStatusCard v-for="card in cards" :key="card.key" :card="card" />
      <QueueStatsCard :queue="status.queue" />
    </div>
  </PageLayout>
</template>
