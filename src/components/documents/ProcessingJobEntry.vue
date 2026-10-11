<script setup lang="ts">
import { computed } from 'vue'
import { formatDocumentTimestamp } from '@/lib/document-date'
import { stepLabels } from '@/lib/processing'
import type { ProcessingJobData } from '@/lib/document-detail'
import ProcessingBadge from './ProcessingBadge.vue'

/** One run in the processing history: status, kind, step and error. */
const { job } = defineProps<{ job: ProcessingJobData }>()

const details = computed(() =>
  [
    job.kind === 'embedding' ? 'Nur Einbettung' : null,
    job.step ? (stepLabels[job.step] ?? job.step) : null,
  ].filter((detail) => detail !== null),
)
</script>

<template>
  <div class="flex items-start justify-between gap-2">
    <div class="space-y-1">
      <div class="flex items-center gap-2">
        <ProcessingBadge :status="job.status" />
        <span
          v-for="detail in details"
          :key="detail"
          class="text-muted-foreground text-xs"
        >
          {{ detail }}
        </span>
      </div>
      <p v-if="job.errorMessage" class="text-destructive text-xs">
        {{ job.errorMessage }}
      </p>
    </div>
    <span class="text-muted-foreground shrink-0 text-xs">
      {{ formatDocumentTimestamp(job.createdAt) }}
    </span>
  </div>
</template>
