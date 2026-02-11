<script setup lang="ts">
import { computed } from 'vue'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatFileSize } from '@/lib/format'

interface TypeBreakdown {
  mimeType: string
  count: number
  totalSize: number
}

const props = defineProps<{
  documentsByType: TypeBreakdown[]
  loading: boolean
}>()

const typeLabels: Record<string, { label: string; color: string }> = {
  'application/pdf': { label: 'PDF', color: '#ef4444' },
  'image/png': { label: 'PNG', color: '#3b82f6' },
  'image/jpeg': { label: 'JPG', color: '#f59e0b' },
  'image/webp': { label: 'WebP', color: '#8b5cf6' },
  'image/tiff': { label: 'TIFF', color: '#10b981' },
}

function getTypeInfo(mimeType: string) {
  return typeLabels[mimeType] ?? { label: mimeType, color: '#6b7280' }
}

const maxCount = computed(() =>
  Math.max(1, ...props.documentsByType.map((d) => d.count)),
)
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Dokumentenübersicht</CardTitle>
      <CardDescription> Verteilung nach Dateityp </CardDescription>
    </CardHeader>
    <CardContent>
      <!-- Loading -->
      <div v-if="loading" class="space-y-4">
        <div v-for="i in 4" :key="i" class="space-y-2">
          <div class="flex items-center justify-between">
            <Skeleton class="h-3.5 w-16" />
            <Skeleton class="h-3 w-24" />
          </div>
          <Skeleton class="h-2 w-full rounded-full" />
        </div>
      </div>

      <!-- Empty -->
      <div
        v-else-if="documentsByType.length === 0"
        class="flex h-[250px] items-center justify-center rounded-lg border border-dashed"
      >
        <p class="text-muted-foreground text-sm">
          Noch keine Dokumente vorhanden
        </p>
      </div>

      <!-- Data -->
      <div v-else class="space-y-4">
        <div v-for="item in documentsByType" :key="item.mimeType">
          <div class="mb-1.5 flex items-center justify-between text-sm">
            <div class="flex items-center gap-2">
              <span
                class="size-2.5 shrink-0 rounded-full"
                :style="{ backgroundColor: getTypeInfo(item.mimeType).color }"
              />
              <span class="font-medium">{{
                getTypeInfo(item.mimeType).label
              }}</span>
            </div>
            <span class="text-muted-foreground text-xs">
              {{ item.count }}
              {{ item.count === 1 ? 'Dokument' : 'Dokumente' }} ·
              {{ formatFileSize(item.totalSize) }}
            </span>
          </div>
          <div class="bg-muted h-2 overflow-hidden rounded-full">
            <div
              class="h-full rounded-full transition-all"
              :style="{
                width: `${(item.count / maxCount) * 100}%`,
                backgroundColor: getTypeInfo(item.mimeType).color,
              }"
            />
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
