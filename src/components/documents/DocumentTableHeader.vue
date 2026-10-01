<script setup lang="ts">
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Minus } from 'lucide-vue-next'
import type { ViewType } from '@/composables/useDocumentsFilter'
import { TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
const { headerState, empty, sortColumn, sortOrder, view } = defineProps<{
  headerState: boolean | 'indeterminate'
  empty: boolean
  sortColumn: string | null
  sortOrder: string
  view?: ViewType
}>()
const emit = defineEmits<{
  sort: [column: string]
  selectAll: [value: boolean | 'indeterminate']
}>()
function sortIcon(column: string) {
  if (sortColumn !== column) return ArrowUpDown
  return sortOrder === 'asc' ? ArrowUp : ArrowDown
}

function ariaSort(column: string): 'ascending' | 'descending' | 'none' {
  if (sortColumn !== column) return 'none'
  return sortOrder === 'asc' ? 'ascending' : 'descending'
}
</script>
<template>
  <TableHeader>
    <TableRow>
      <TableHead class="w-[1%] pr-0">
        <Checkbox
          :model-value="headerState"
          :disabled="empty"
          aria-label="Alle Dokumente auswählen"
          @update:model-value="(value) => emit('selectAll', value)"
        >
          <template #default="{ state }">
            <Minus v-if="state === 'indeterminate'" class="size-3.5" />
            <Check v-else class="size-3.5" />
          </template>
        </Checkbox>
      </TableHead>
      <TableHead :aria-sort="ariaSort('name')">
        <button
          class="hover:text-foreground inline-flex items-center gap-1 transition-colors"
          aria-label="Nach Name sortieren"
          @click="emit('sort', 'name')"
        >
          Name <component :is="sortIcon('name')" class="size-3.5" />
        </button>
      </TableHead>
      <TableHead>Korrespondent</TableHead>
      <TableHead>Ordner</TableHead>
      <TableHead>Tags</TableHead>
      <TableHead :aria-sort="ariaSort('fileSize')">
        <button
          class="hover:text-foreground inline-flex items-center gap-1 transition-colors"
          aria-label="Nach Größe sortieren"
          @click="emit('sort', 'fileSize')"
        >
          Größe <component :is="sortIcon('fileSize')" class="size-3.5" />
        </button>
      </TableHead>
      <TableHead>Status</TableHead>
      <TableHead>Belegdatum</TableHead>
      <TableHead :aria-sort="ariaSort('createdAt')">
        <button
          class="hover:text-foreground inline-flex items-center gap-1 transition-colors"
          :aria-label="
            view === 'trash'
              ? 'Nach Löschdatum sortieren'
              : 'Nach Hochladedatum sortieren'
          "
          @click="emit('sort', 'createdAt')"
        >
          {{ view === 'trash' ? 'Gelöscht am' : 'Hochgeladen' }}
          <component :is="sortIcon('createdAt')" class="size-3.5" />
        </button>
      </TableHead>
      <template v-if="view === 'trash'">
        <TableHead class="w-[1%]">Aktionen</TableHead>
      </template>
    </TableRow>
  </TableHeader>
</template>
