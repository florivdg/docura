<script setup lang="ts">
import {
  CheckCircle2,
  CircleAlert,
  Clock,
  FileText,
  Image,
  Loader2,
} from 'lucide-vue-next'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { isImageMime } from '@/lib/format'
import { statusConfig } from '@/lib/processing'

interface RecentDocument {
  id: string
  name: string
  mimeType: string
  fileSize: number
  createdAt: string
  folderName: string | null
  processingStatus: string | null
}

defineProps<{
  documents: RecentDocument[]
  loading: boolean
}>()

const rtf = new Intl.RelativeTimeFormat('de-DE', { numeric: 'auto' })

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffSec = Math.round((then - now) / 1000)

  if (Math.abs(diffSec) < 60) return rtf.format(diffSec, 'second')
  const diffMin = Math.round(diffSec / 60)
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute')
  const diffHr = Math.round(diffMin / 60)
  if (Math.abs(diffHr) < 24) return rtf.format(diffHr, 'hour')
  const diffDay = Math.round(diffHr / 24)
  if (Math.abs(diffDay) < 30) return rtf.format(diffDay, 'day')
  const diffMonth = Math.round(diffDay / 30)
  if (Math.abs(diffMonth) < 12) return rtf.format(diffMonth, 'month')
  return rtf.format(Math.round(diffDay / 365), 'year')
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Letzte Aktivität</CardTitle>
      <CardDescription>
        Übersicht über die letzten Dokumentenaktivitäten
      </CardDescription>
    </CardHeader>
    <CardContent>
      <!-- Loading -->
      <div v-if="loading" class="space-y-3">
        <div v-for="i in 5" :key="i" class="flex items-center gap-3">
          <Skeleton class="size-8 shrink-0 rounded-md" />
          <div class="flex-1 space-y-1.5">
            <Skeleton class="h-3.5 w-3/4" />
            <Skeleton class="h-3 w-1/2" />
          </div>
          <Skeleton class="h-3 w-16 shrink-0" />
        </div>
      </div>

      <!-- Empty -->
      <div
        v-else-if="documents.length === 0"
        class="flex h-[250px] items-center justify-center rounded-lg border border-dashed"
      >
        <p class="text-muted-foreground text-sm">
          Noch keine Dokumente vorhanden
        </p>
      </div>

      <!-- Data -->
      <div v-else class="space-y-1">
        <a
          v-for="doc in documents"
          :key="doc.id"
          :href="`/documents/${doc.id}`"
          class="hover:bg-accent flex items-center gap-3 rounded-md px-2 py-2 transition-colors"
        >
          <div
            class="bg-muted flex size-8 shrink-0 items-center justify-center rounded-md"
          >
            <component
              :is="isImageMime(doc.mimeType) ? Image : FileText"
              class="text-muted-foreground size-4"
            />
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">{{ doc.name }}</p>
            <div class="text-muted-foreground flex items-center gap-2 text-xs">
              <span v-if="doc.folderName">{{ doc.folderName }}</span>
              <Badge
                v-if="doc.processingStatus"
                :variant="
                  statusConfig[doc.processingStatus]?.variant ?? 'secondary'
                "
                :class="statusConfig[doc.processingStatus]?.class"
                class="h-4 gap-0.5 px-1 text-[10px]"
              >
                <Clock
                  v-if="doc.processingStatus === 'pending'"
                  class="size-2.5"
                />
                <Loader2
                  v-else-if="doc.processingStatus === 'processing'"
                  class="size-2.5 animate-spin"
                />
                <CheckCircle2
                  v-else-if="doc.processingStatus === 'completed'"
                  class="size-2.5"
                />
                <CircleAlert
                  v-else-if="doc.processingStatus === 'failed'"
                  class="size-2.5"
                />
                {{
                  statusConfig[doc.processingStatus]?.label ??
                  doc.processingStatus
                }}
              </Badge>
            </div>
          </div>
          <span class="text-muted-foreground shrink-0 text-xs">
            {{ relativeTime(doc.createdAt) }}
          </span>
        </a>
      </div>
    </CardContent>
  </Card>
</template>
