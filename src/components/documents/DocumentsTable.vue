<script setup lang="ts">
import { computed } from 'vue'
import { FileText, SearchX } from 'lucide-vue-next'
import type { DocumentRow, ViewType } from '@/composables/useDocumentsFilter'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import DocumentTableRow from './DocumentTableRow.vue'
import DocumentTableHeader from './DocumentTableHeader.vue'
import {
  selectionState,
  selectVisible,
  selectDocument,
} from '@/lib/document-selection'
const props = defineProps<{
  documents: DocumentRow[]
  loading: boolean
  hasActiveFilters?: boolean
  sortColumn: string | null
  sortOrder: string
  view?: ViewType
}>()

const emit = defineEmits<{
  sort: [column: string]
  restore: [id: string]
  permanentDelete: [id: string]
}>()

const selectedIds = defineModel<string[]>('selectedIds', { required: true })

const headerState = computed(() =>
  selectionState(props.documents, selectedIds.value),
)
function isSelected(id: string) {
  return selectedIds.value.includes(id)
}
function toggleAll(value: boolean | 'indeterminate') {
  selectedIds.value = selectVisible(props.documents, selectedIds.value, value)
}
function toggleRow(id: string, value: boolean | 'indeterminate') {
  selectedIds.value = selectDocument(id, selectedIds.value, value)
}

function emptyStateText(): string {
  switch (props.view) {
    case 'trash':
      return 'Der Papierkorb ist leer'
    case 'favorites':
      return 'Noch keine Favoriten vorhanden'
    case 'archive':
      return 'Kein Dokument archiviert'
    default:
      return 'Noch keine Dokumente vorhanden'
  }
}

const colCount = () => (props.view === 'trash' ? 10 : 9)
</script>

<template>
  <Table>
    <DocumentTableHeader
      :header-state="headerState"
      :empty="props.documents.length === 0"
      :sort-column="props.sortColumn"
      :sort-order="props.sortOrder"
      :view="props.view"
      @sort="emit('sort', $event)"
      @select-all="toggleAll"
    />
    <TableBody>
      <template v-if="props.loading">
        <TableRow v-for="i in 5" :key="i">
          <TableCell><Skeleton class="size-4 rounded-[4px]" /></TableCell>
          <TableCell>
            <div class="flex items-center gap-2">
              <Skeleton class="h-4 w-4" />
              <Skeleton class="h-4 w-32" />
            </div>
          </TableCell>
          <TableCell><Skeleton class="h-4 w-24" /></TableCell>
          <TableCell><Skeleton class="h-4 w-20" /></TableCell>
          <TableCell>
            <div class="flex gap-1">
              <Skeleton class="h-5 w-14" />
              <Skeleton class="h-5 w-14" />
            </div>
          </TableCell>
          <TableCell><Skeleton class="h-4 w-16" /></TableCell>
          <TableCell><Skeleton class="h-5 w-24" /></TableCell>
          <TableCell><Skeleton class="h-4 w-20" /></TableCell>
          <TableCell><Skeleton class="h-4 w-28" /></TableCell>
          <TableCell v-if="props.view === 'trash'">
            <Skeleton class="h-8 w-20" />
          </TableCell>
        </TableRow>
      </template>
      <template v-else-if="props.documents.length === 0">
        <TableEmpty :colspan="colCount()">
          <div class="flex flex-col items-center gap-2">
            <component
              :is="props.hasActiveFilters ? SearchX : FileText"
              class="text-muted-foreground size-8"
            />
            <p class="text-muted-foreground text-sm">
              {{
                props.hasActiveFilters
                  ? 'Keine Dokumente gefunden'
                  : emptyStateText()
              }}
            </p>
          </div>
        </TableEmpty>
      </template>
      <template v-else>
        <DocumentTableRow
          v-for="doc in props.documents"
          :key="doc.id"
          :doc="doc"
          :view="props.view"
          :selected="isSelected(doc.id)"
          @select="(value) => toggleRow(doc.id, value)"
          @restore="emit('restore', $event)"
          @permanent-delete="emit('permanentDelete', $event)"
        />
      </template>
    </TableBody>
  </Table>
</template>
