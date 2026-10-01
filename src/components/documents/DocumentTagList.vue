<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import type { DocumentTag } from '@/composables/useDocumentsFilter'
const { tags } = defineProps<{ tags: DocumentTag[] }>()
</script>
<template>
  <div v-if="tags.length > 0" class="flex flex-wrap gap-1">
    <Badge
      v-for="t in tags"
      :key="t.id"
      variant="outline"
      class="gap-1 text-xs"
    >
      <span
        v-if="t.color"
        class="size-2 shrink-0 rounded-full"
        :style="{ backgroundColor: t.color }"
      />
      {{ t.name }}
    </Badge>
  </div>
  <span v-else class="text-muted-foreground">—</span>
</template>
