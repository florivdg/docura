<script setup lang="ts">
import { watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useDocumentActivity } from '@/composables/useDocumentActivity'
import ActivityItem from '@/components/activity/ActivityItem.vue'

/** The document's audit trail; a new `revision` reloads it. */
const { documentId, revision = 0 } = defineProps<{
  documentId: string
  revision?: number
}>()

const { entries, loading, error, hasMore, loadMore, refresh } =
  useDocumentActivity(documentId)

watch(
  () => revision,
  () => void refresh(),
)
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Verlauf</CardTitle>
    </CardHeader>
    <CardContent class="space-y-3">
      <div v-if="loading && entries.length === 0" class="space-y-3">
        <Skeleton v-for="i in 3" :key="i" class="h-10 w-full" />
      </div>
      <p
        v-else-if="error && entries.length === 0"
        class="text-destructive text-sm"
      >
        {{ error }}
      </p>
      <p v-else-if="entries.length === 0" class="text-muted-foreground text-sm">
        Noch keine Einträge
      </p>
      <ul v-else class="space-y-3">
        <ActivityItem
          v-for="entry in entries"
          :key="entry.id"
          :activity="entry"
        />
      </ul>
      <p v-if="error && entries.length > 0" class="text-destructive text-sm">
        {{ error }}
      </p>
      <Button
        v-if="hasMore"
        variant="outline"
        size="sm"
        class="w-full"
        :disabled="loading"
        @click="loadMore"
      >
        Mehr anzeigen
      </Button>
    </CardContent>
  </Card>
</template>
