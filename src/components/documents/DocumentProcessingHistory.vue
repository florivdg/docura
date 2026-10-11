<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { ProcessingJobData } from '@/lib/document-detail'
import ProcessingJobEntry from './ProcessingJobEntry.vue'
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
          <ProcessingJobEntry :job="job" />
        </div>
      </div>
    </CardContent>
  </Card>
</template>
