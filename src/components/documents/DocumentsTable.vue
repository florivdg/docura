<script setup lang="ts">
import { computed } from 'vue'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock,
  FileText,
  Image,
  Loader2,
  Minus,
  RotateCcw,
  SearchX,
  Star,
  Trash2,
} from 'lucide-vue-next'
import { formatFileSize, isImageMime } from '@/lib/format'
import { statusConfig, stepLabels } from '@/lib/processing'
import type { DocumentRow, ViewType } from '@/composables/useDocumentsFilter'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

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

const headerState = computed<boolean | 'indeterminate'>(() => {
  const selected = new Set(selectedIds.value)
  const docs = props.documents
  if (docs.length > 0 && docs.every((doc) => selected.has(doc.id))) return true
  return docs.some((doc) => selected.has(doc.id)) ? 'indeterminate' : false
})

function isSelected(id: string): boolean {
  return selectedIds.value.includes(id)
}

function toggleAll(value: boolean | 'indeterminate') {
  if (value === true) {
    const visibleIds = props.documents.map((doc) => doc.id)
    selectedIds.value = [
      ...selectedIds.value.filter((id) => !visibleIds.includes(id)),
      ...visibleIds,
    ]
  } else {
    const visibleIds = new Set(props.documents.map((doc) => doc.id))
    selectedIds.value = selectedIds.value.filter((id) => !visibleIds.has(id))
  }
}

function toggleRow(id: string, value: boolean | 'indeterminate') {
  if (value === true) {
    if (!selectedIds.value.includes(id)) {
      selectedIds.value = [...selectedIds.value, id]
    }
  } else {
    selectedIds.value = selectedIds.value.filter((selected) => selected !== id)
  }
}

function sortIcon(column: string) {
  if (props.sortColumn !== column) return ArrowUpDown
  return props.sortOrder === 'asc' ? ArrowUp : ArrowDown
}

function ariaSort(column: string): 'ascending' | 'descending' | 'none' {
  if (props.sortColumn !== column) return 'none'
  return props.sortOrder === 'asc' ? 'ascending' : 'descending'
}

const dateFormatter = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function formatDate(dateStr: string): string {
  return dateFormatter.format(new Date(dateStr))
}

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
    <TableHeader>
      <TableRow>
        <TableHead class="w-[1%] pr-0">
          <Checkbox
            :model-value="headerState"
            :disabled="props.documents.length === 0"
            aria-label="Alle Dokumente auswählen"
            @update:model-value="toggleAll"
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
              props.view === 'trash'
                ? 'Nach Löschdatum sortieren'
                : 'Nach Hochladedatum sortieren'
            "
            @click="emit('sort', 'createdAt')"
          >
            {{ props.view === 'trash' ? 'Gelöscht am' : 'Hochgeladen' }}
            <component :is="sortIcon('createdAt')" class="size-3.5" />
          </button>
        </TableHead>
        <template v-if="props.view === 'trash'">
          <TableHead class="w-[1%]">Aktionen</TableHead>
        </template>
      </TableRow>
    </TableHeader>
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
        <TableRow
          v-for="doc in props.documents"
          :key="doc.id"
          :data-state="isSelected(doc.id) ? 'selected' : undefined"
        >
          <TableCell class="pr-0" @click.stop>
            <Checkbox
              :model-value="isSelected(doc.id)"
              :aria-label="`${doc.name} auswählen`"
              @update:model-value="(value) => toggleRow(doc.id, value)"
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
              <a
                :href="`/documents/${doc.id}`"
                class="truncate hover:underline"
              >
                {{ doc.name }}
              </a>
            </div>
          </TableCell>
          <TableCell>
            <span v-if="doc.correspondentName">{{
              doc.correspondentName
            }}</span>
            <span v-else class="text-muted-foreground">—</span>
          </TableCell>
          <TableCell>
            <span v-if="doc.folderName">{{ doc.folderName }}</span>
            <span v-else class="text-muted-foreground">—</span>
          </TableCell>
          <TableCell>
            <div v-if="doc.tags.length > 0" class="flex flex-wrap gap-1">
              <Badge
                v-for="t in doc.tags"
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
          </TableCell>
          <TableCell class="whitespace-nowrap">
            {{ formatFileSize(doc.fileSize) }}
          </TableCell>
          <TableCell>
            <template v-if="doc.processingStatus">
              <TooltipProvider v-if="doc.processingStep">
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Badge
                      :variant="
                        statusConfig[doc.processingStatus]?.variant ??
                        'secondary'
                      "
                      :class="statusConfig[doc.processingStatus]?.class"
                    >
                      <Clock
                        v-if="doc.processingStatus === 'pending'"
                        class="size-3"
                      />
                      <Loader2
                        v-else-if="doc.processingStatus === 'processing'"
                        class="size-3 animate-spin"
                      />
                      <CheckCircle2
                        v-else-if="doc.processingStatus === 'completed'"
                        class="size-3"
                      />
                      <CircleAlert
                        v-else-if="doc.processingStatus === 'failed'"
                        class="size-3"
                      />
                      {{
                        statusConfig[doc.processingStatus]?.label ??
                        doc.processingStatus
                      }}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    {{ stepLabels[doc.processingStep] ?? doc.processingStep }}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Badge
                v-else
                :variant="
                  statusConfig[doc.processingStatus]?.variant ?? 'secondary'
                "
                :class="statusConfig[doc.processingStatus]?.class"
              >
                <Clock
                  v-if="doc.processingStatus === 'pending'"
                  class="size-3"
                />
                <Loader2
                  v-else-if="doc.processingStatus === 'processing'"
                  class="size-3 animate-spin"
                />
                <CheckCircle2
                  v-else-if="doc.processingStatus === 'completed'"
                  class="size-3"
                />
                <CircleAlert
                  v-else-if="doc.processingStatus === 'failed'"
                  class="size-3"
                />
                {{
                  statusConfig[doc.processingStatus]?.label ??
                  doc.processingStatus
                }}
              </Badge>
            </template>
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
              props.view === 'trash' && doc.trashedAt
                ? formatDate(doc.trashedAt)
                : formatDate(doc.createdAt)
            }}
          </TableCell>
          <TableCell v-if="props.view === 'trash'" class="whitespace-nowrap">
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
    </TableBody>
  </Table>
</template>
