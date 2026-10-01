<script setup lang="ts">
import { formatDocumentTimestamp } from '@/lib/document-date'
import ProcessingBadge from './ProcessingBadge.vue'
import { stepLabels } from '@/lib/processing'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { ProcessingJobData } from '@/lib/document-detail'
const { jobs } = defineProps<{ jobs: ProcessingJobData[] }>()
</script>
<template>
  <!-- Processing card -->
  <Card>
    <CardHeader>
      <CardTitle>Verarbeitung</CardTitle>
    </CardHeader>
    <CardContent>
      <template v-if="jobs.length === 0">
        <p class="text-muted-foreground text-sm">Keine Verarbeitungsvorgänge</p>
      </template>
      <div v-else class="space-y-3">
        <div v-for="(job, i) in jobs" :key="job.id">
          <Separator v-if="i > 0" class="mb-3" />
          <div class="flex items-start justify-between gap-2">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <ProcessingBadge :status="job.status" />
                <span v-if="job.step" class="text-muted-foreground text-xs">
                  {{ stepLabels[job.step] ?? job.step }}
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
        </div>
      </div>
    </CardContent>
  </Card>
</template>
