<script setup lang="ts">
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import ActivityItem from '@/components/activity/ActivityItem.vue'
import type { ActivityGroup } from '@/lib/activity'

defineProps<{
  entries: ActivityGroup[]
  loading: boolean
}>()

/** „ und 11 weitere“ after the first document of a batch. */
const others = (group: ActivityGroup) =>
  group.count > 1 ? ` und ${group.count - 1} weitere` : ''
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Letzte Aktivität</CardTitle>
      <CardDescription>
        Wer hat zuletzt welche Dokumente geändert
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
        v-else-if="entries.length === 0"
        class="flex h-[250px] items-center justify-center rounded-lg border border-dashed"
      >
        <p class="text-muted-foreground text-sm">Noch keine Aktivitäten</p>
      </div>

      <!-- Data -->
      <ul v-else class="space-y-1">
        <ActivityItem
          v-for="group in entries"
          :key="`${group.batchId}-${group.action}-${group.actorName}`"
          :activity="group"
          class="rounded-md px-2 py-2"
        >
          <p class="text-muted-foreground truncate text-xs">
            <a
              v-if="group.document.id"
              :href="`/documents/${group.document.id}`"
              class="hover:text-foreground font-medium underline-offset-2 hover:underline"
              >{{ group.document.name }}</a
            ><span v-else>{{ group.document.name }} (gelöscht)</span
            >{{ others(group) }}
          </p>
        </ActivityItem>
      </ul>
    </CardContent>
  </Card>
</template>
