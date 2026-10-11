<script setup lang="ts">
import { computed } from 'vue'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { QueueSummary } from '@/lib/system-status'
import { formatDateTime } from '@/lib/format'

const { queue } = defineProps<{ queue: QueueSummary | null }>()

const rows = computed(() =>
  queue
    ? [
        { label: 'Ausstehend', value: queue.pending },
        { label: 'In Verarbeitung', value: queue.processing },
      ]
    : [],
)
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Warteschlange</CardTitle>
    </CardHeader>
    <CardContent>
      <p v-if="!queue" class="text-muted-foreground text-sm">
        Ohne Datenbankverbindung nicht verfügbar.
      </p>
      <dl v-else class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
        <template v-for="row in rows" :key="row.label">
          <dt class="text-muted-foreground">{{ row.label }}</dt>
          <dd class="text-right font-medium tabular-nums">{{ row.value }}</dd>
        </template>
        <dt class="text-muted-foreground">Fehlgeschlagen</dt>
        <dd class="text-right font-medium tabular-nums">
          <a
            v-if="queue.failed > 0"
            href="/documents?status=failed"
            class="text-destructive underline-offset-4 hover:underline"
          >
            {{ queue.failed }}
          </a>
          <template v-else>0</template>
        </dd>
        <dt class="text-muted-foreground pl-3">
          davon mit geplantem erneuten Versuch
        </dt>
        <dd class="text-right font-medium tabular-nums">
          {{ queue.failedRetrying }}
        </dd>
        <dt class="text-muted-foreground">Ältester ausstehender Auftrag</dt>
        <dd class="text-right font-medium">
          {{ formatDateTime(queue.oldestPendingAt) }}
        </dd>
      </dl>
    </CardContent>
  </Card>
</template>
