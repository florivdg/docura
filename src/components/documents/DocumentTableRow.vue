<script setup lang="ts">
import { formatDocumentTimestamp } from '@/lib/document-date'
import DocumentTagList from './DocumentTagList.vue'
import { FileText, Image, RotateCcw, Star, Trash2 } from 'lucide-vue-next'
import { formatFileSize, isImageMime } from '@/lib/format'
import type { DocumentRow, ViewType } from '@/composables/useDocumentsFilter'
import { TableCell, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import ProcessingBadge from './ProcessingBadge.vue'
const { doc, view, selected } = defineProps<{
  doc: DocumentRow
  view?: ViewType
  selected: boolean
}>()
const emit = defineEmits<{
  select: [value: boolean | 'indeterminate']
  restore: [id: string]
  permanentDelete: [id: string]
}>()

// Date-only values (YYYY-MM-DD) are rendered in UTC so the day never shifts
const dateOnlyFormatter = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
})

function formatDateOnly(dateStr: string): string {
  return dateOnlyFormatter.format(new Date(`${dateStr}T00:00:00Z`))
}
</script>
<template>
  <TableRow :data-state="selected ? 'selected' : undefined">
    <TableCell class="pr-0" @click.stop>
      <Checkbox
        :model-value="selected"
        :aria-label="`${doc.name} auswählen`"
        @update:model-value="(value) => emit('select', value)"
      />
    </TableCell>
    <TableCell>
      <div class="flex items-center gap-2">
        <Star
          v-if="doc.isFavorite"
          class="size-4 shrink-0 fill-yellow-400 text-yellow-400"
        />
        <component
          v-else
          :is="isImageMime(doc.mimeType) ? Image : FileText"
          class="text-muted-foreground size-4 shrink-0"
        />
        <a :href="`/documents/${doc.id}`" class="truncate hover:underline">
          {{ doc.name }}
        </a>
      </div>
    </TableCell>
    <TableCell>
      <span v-if="doc.correspondentName">{{ doc.correspondentName }}</span>
      <span v-else class="text-muted-foreground">—</span>
    </TableCell>
    <TableCell>
      <span v-if="doc.folderName">{{ doc.folderName }}</span>
      <span v-else class="text-muted-foreground">—</span>
    </TableCell>
    <TableCell>
      <DocumentTagList :tags="doc.tags" />
    </TableCell>
    <TableCell class="whitespace-nowrap">
      {{ formatFileSize(doc.fileSize) }}
    </TableCell>
    <TableCell>
      <ProcessingBadge
        v-if="doc.processingStatus"
        :status="doc.processingStatus"
        :step="doc.processingStep"
      />
      <span v-else class="text-muted-foreground">—</span>
    </TableCell>
    <TableCell class="whitespace-nowrap">
      <span v-if="doc.documentDate">{{
        formatDateOnly(doc.documentDate)
      }}</span>
      <span v-else class="text-muted-foreground">—</span>
    </TableCell>
    <TableCell class="whitespace-nowrap">
      {{
        view === 'trash' && doc.trashedAt
          ? formatDocumentTimestamp(doc.trashedAt)
          : formatDocumentTimestamp(doc.createdAt)
      }}
    </TableCell>
    <TableCell v-if="view === 'trash'" class="whitespace-nowrap">
      <div class="flex gap-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                class="size-8"
                @click="emit('restore', doc.id)"
              >
                <RotateCcw class="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Wiederherstellen</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                class="text-destructive hover:text-destructive size-8"
                @click="emit('permanentDelete', doc.id)"
              >
                <Trash2 class="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Endgültig löschen</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </TableCell>
  </TableRow>
</template>
