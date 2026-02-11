<script setup lang="ts">
import { FileText, FolderOpen, HardDrive, Tag } from 'lucide-vue-next'

import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatFileSize } from '@/lib/format'

defineProps<{
  stats: {
    documentCount: number
    folderCount: number
    tagCount: number
    totalStorageBytes: number
  } | null
  loading: boolean
}>()
</script>

<template>
  <div
    class="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4"
  >
    <Card class="@container/card">
      <CardHeader>
        <CardDescription>Dokumente</CardDescription>
        <CardTitle
          class="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl"
        >
          <Skeleton v-if="loading" class="h-8 w-16" />
          <template v-else>{{ stats?.documentCount ?? 0 }}</template>
        </CardTitle>
      </CardHeader>
      <CardFooter class="flex-col items-start gap-1.5 text-sm">
        <div class="line-clamp-1 flex gap-2 font-medium">
          <FileText class="size-4" /> Gesamt hochgeladen
        </div>
        <div class="text-muted-foreground">PDF, PNG, JPG und mehr</div>
      </CardFooter>
    </Card>
    <Card class="@container/card">
      <CardHeader>
        <CardDescription>Ordner</CardDescription>
        <CardTitle
          class="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl"
        >
          <Skeleton v-if="loading" class="h-8 w-12" />
          <template v-else>{{ stats?.folderCount ?? 0 }}</template>
        </CardTitle>
      </CardHeader>
      <CardFooter class="flex-col items-start gap-1.5 text-sm">
        <div class="line-clamp-1 flex gap-2 font-medium">
          <FolderOpen class="size-4" /> Zur Organisation
        </div>
        <div class="text-muted-foreground">Verschachtelte Ordnerstruktur</div>
      </CardFooter>
    </Card>
    <Card class="@container/card">
      <CardHeader>
        <CardDescription>Tags</CardDescription>
        <CardTitle
          class="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl"
        >
          <Skeleton v-if="loading" class="h-8 w-12" />
          <template v-else>{{ stats?.tagCount ?? 0 }}</template>
        </CardTitle>
      </CardHeader>
      <CardFooter class="flex-col items-start gap-1.5 text-sm">
        <div class="line-clamp-1 flex gap-2 font-medium">
          <Tag class="size-4" /> Kategorien erstellt
        </div>
        <div class="text-muted-foreground">Farbige Tags zur Kennzeichnung</div>
      </CardFooter>
    </Card>
    <Card class="@container/card">
      <CardHeader>
        <CardDescription>Speicherplatz</CardDescription>
        <CardTitle
          class="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl"
        >
          <Skeleton v-if="loading" class="h-8 w-20" />
          <template v-else>{{
            formatFileSize(stats?.totalStorageBytes ?? 0)
          }}</template>
        </CardTitle>
      </CardHeader>
      <CardFooter class="flex-col items-start gap-1.5 text-sm">
        <div class="line-clamp-1 flex gap-2 font-medium">
          <HardDrive class="size-4" /> Belegt
        </div>
        <div class="text-muted-foreground">Lokaler Speicher</div>
      </CardFooter>
    </Card>
  </div>
</template>
