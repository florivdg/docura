<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import PageLayout from '@/components/PageLayout.vue'
import DocumentsFilterBar from '@/components/documents/DocumentsFilterBar.vue'
import DocumentsTable from '@/components/documents/DocumentsTable.vue'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationFirst,
  PaginationItem,
  PaginationLast,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Check,
  FolderInput,
  RotateCcw,
  Star,
  StarOff,
  Tag,
  Trash2,
  X,
} from 'lucide-vue-next'
import { useDocumentsFilter } from '@/composables/useDocumentsFilter'
import { useMetadataOptions } from '@/composables/useMetadataOptions'
import { useProcessingEvents } from '@/composables/useProcessingEvents'
import { apiFetch } from '@/lib/api-fetch'

const {
  view,
  query,
  searchMode,
  selectedFolderIds,
  selectedTagIds,
  selectedCorrespondentIds,
  selectedStatuses,
  documents,
  loading,
  hasActiveFilters,
  fetchDocuments,
  clearFilters,
  sortColumn,
  sortOrder,
  currentPage,
  pageSize,
  totalCount,
  totalPages,
  toggleSort,
  goToPage,
  requestInputs,
} = useDocumentsFilter()

const pageTitle = computed(() => {
  switch (view.value) {
    case 'favorites':
      return 'Favoriten'
    case 'trash':
      return 'Papierkorb'
    case 'archive':
      return 'Archiv'
    default:
      return 'Dokumente'
  }
})

const emptyingTrash = ref(false)
const permanentDeleteOpen = ref(false)
const pendingDeleteId = ref<string | null>(null)
const trashRetentionDays = ref<number | null>(null)

type BulkAction =
  | 'move'
  | 'addTags'
  | 'trash'
  | 'restore'
  | 'favorite'
  | 'unfavorite'

const selectedIds = ref<string[]>([])
const bulkPending = ref(false)
const bulkFolderOpen = ref(false)
const bulkTagOpen = ref(false)
const bulkTrashOpen = ref(false)
const bulkTagIds = ref<string[]>([])
// Shared with DocumentsFilterBar - the filter bar's mount already loads them
const {
  folders: bulkFolders,
  tags: bulkTags,
  ensureLoaded: ensureBulkOptions,
} = useMetadataOptions()

function clearSelection() {
  selectedIds.value = []
}

async function runBulkAction(payload: {
  action: BulkAction
  folderId?: string | null
  tagIds?: string[]
}) {
  if (selectedIds.value.length === 0 || bulkPending.value) return

  bulkPending.value = true
  try {
    const res = await apiFetch('/api/documents/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...selectedIds.value], ...payload }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      console.error(
        'Massenaktion fehlgeschlagen:',
        data?.error ?? `HTTP ${res.status}`,
      )
      return
    }
    clearSelection()
    await fetchDocuments()
  } catch (err) {
    console.error('Massenaktion fehlgeschlagen:', err)
  } finally {
    bulkPending.value = false
  }
}

function toggleBulkTag(id: string) {
  if (bulkTagIds.value.includes(id)) {
    bulkTagIds.value = bulkTagIds.value.filter((t) => t !== id)
  } else {
    bulkTagIds.value = [...bulkTagIds.value, id]
  }
}

function handleBulkMove(folderId: string | null) {
  bulkFolderOpen.value = false
  void runBulkAction({ action: 'move', folderId })
}

function handleBulkAddTags() {
  if (bulkTagIds.value.length === 0) return
  const tagIds = [...bulkTagIds.value]
  bulkTagOpen.value = false
  bulkTagIds.value = []
  void runBulkAction({ action: 'addTags', tagIds })
}

function confirmBulkTrash() {
  bulkTrashOpen.value = false
  void runBulkAction({ action: 'trash' })
}

async function fetchTrashRetentionDays() {
  try {
    const res = await apiFetch('/api/documents/trash')
    if (res.ok) {
      const data = await res.json()
      trashRetentionDays.value = data.retentionDays
    }
  } catch {
    // fallback: leave null so the sentence is hidden
  }
}

async function handleEmptyTrash() {
  emptyingTrash.value = true
  try {
    const res = await apiFetch('/api/documents/trash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'empty' }),
    })
    if (res.ok) {
      void fetchDocuments()
    }
  } catch {
    // ignore
  } finally {
    emptyingTrash.value = false
  }
}

async function handleRestore(id: string) {
  try {
    const res = await apiFetch(`/api/documents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashedAt: null }),
    })
    if (res.ok) {
      void fetchDocuments()
    }
  } catch {
    // ignore
  }
}

function handlePermanentDelete(id: string) {
  pendingDeleteId.value = id
  permanentDeleteOpen.value = true
}

async function confirmPermanentDelete() {
  const id = pendingDeleteId.value
  if (!id) return
  try {
    const res = await apiFetch(`/api/documents/${id}?permanent=true`, {
      method: 'DELETE',
    })
    if (res.ok) {
      void fetchDocuments()
    }
  } catch {
    // ignore
  } finally {
    permanentDeleteOpen.value = false
    pendingDeleteId.value = null
  }
}

const debouncedRefetch = useDebounceFn(fetchDocuments, 500)

useProcessingEvents((event) => {
  if (event.type === 'step_change') {
    const doc = documents.value.find((d) => d.id === event.documentId)
    if (doc) {
      doc.processingStatus = event.status
      doc.processingStep = event.step
    } else {
      void debouncedRefetch()
    }
  } else if (event.type === 'completed') {
    const doc = documents.value.find((d) => d.id === event.documentId)
    if (doc) {
      doc.processingStatus = 'completed'
      doc.processingStep = null
    }
    void debouncedRefetch()
  } else if (event.type === 'failed') {
    const doc = documents.value.find((d) => d.id === event.documentId)
    if (doc) {
      doc.processingStatus = 'failed'
      doc.processingStep = null
      doc.processingError = event.errorMessage ?? null
    } else {
      void debouncedRefetch()
    }
  }
})

function onDocumentUploaded() {
  void fetchDocuments()
}

watch(
  view,
  (newView) => {
    if (newView === 'trash' && trashRetentionDays.value === null) {
      void fetchTrashRetentionDays()
    }
  },
  { immediate: true },
)

// Selection is bound to the current result set - drop it whenever it changes
watch(requestInputs, () => clearSelection(), { deep: true })

// Prune stale selections whenever a fetch replaces the result set.
// Shallow on purpose: fetchDocuments() reassigns documents.value wholesale,
// while live processing events only mutate row fields in place.
watch(documents, (docs) => {
  if (selectedIds.value.length === 0) return
  const ids = new Set(docs.map((d) => d.id))
  const pruned = selectedIds.value.filter((id) => ids.has(id))
  if (pruned.length !== selectedIds.value.length) {
    selectedIds.value = pruned
  }
})

watch(bulkFolderOpen, (open) => {
  if (open) void ensureBulkOptions()
})

watch(bulkTagOpen, (open) => {
  if (open) {
    bulkTagIds.value = []
    void ensureBulkOptions()
  }
})

onMounted(() => {
  void fetchDocuments()
  window.addEventListener('document-uploaded', onDocumentUploaded)
})

onUnmounted(() => {
  window.removeEventListener('document-uploaded', onDocumentUploaded)
})
</script>

<template>
  <PageLayout :title="pageTitle">
    <DocumentsFilterBar
      v-model:query="query"
      v-model:search-mode="searchMode"
      v-model:folder-ids="selectedFolderIds"
      v-model:tag-ids="selectedTagIds"
      v-model:correspondent-ids="selectedCorrespondentIds"
      v-model:statuses="selectedStatuses"
      :has-active-filters="hasActiveFilters"
      @clear="clearFilters"
    />

    <!-- Trash info bar -->
    <div
      v-if="view === 'trash' && !loading && documents.length > 0"
      class="border-destructive/30 bg-destructive/5 flex items-center justify-between rounded-lg border px-4 py-3"
    >
      <p v-if="trashRetentionDays" class="text-muted-foreground text-sm">
        Dokumente im Papierkorb werden nach {{ trashRetentionDays }} Tagen
        automatisch gelöscht.
      </p>
      <AlertDialog>
        <AlertDialogTrigger as-child>
          <Button variant="destructive" size="sm" :disabled="emptyingTrash">
            <Trash2 class="size-4" />
            Papierkorb leeren
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Papierkorb leeren?</AlertDialogTitle>
            <AlertDialogDescription>
              Alle Dokumente im Papierkorb werden endgültig gelöscht. Diese
              Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              @click="handleEmptyTrash"
            >
              Endgültig löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>

    <!-- Bulk action bar -->
    <div
      v-if="selectedIds.length > 0"
      class="bg-muted/40 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2"
    >
      <span class="text-sm font-medium">
        {{ selectedIds.length }} ausgewählt
      </span>

      <template v-if="view === 'trash'">
        <Button
          variant="outline"
          size="sm"
          :disabled="bulkPending"
          @click="runBulkAction({ action: 'restore' })"
        >
          <RotateCcw class="size-4" />
          Wiederherstellen
        </Button>
      </template>

      <template v-else>
        <!-- Move to folder -->
        <Popover v-model:open="bulkFolderOpen">
          <PopoverTrigger as-child>
            <Button variant="outline" size="sm" :disabled="bulkPending">
              <FolderInput class="size-4" />
              In Ordner verschieben
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" class="w-[240px] p-0">
            <Command>
              <CommandInput placeholder="Ordner suchen…" />
              <CommandList>
                <CommandEmpty>Nicht gefunden</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="Kein Ordner"
                    @select.prevent="handleBulkMove(null)"
                  >
                    <span class="text-muted-foreground">Kein Ordner</span>
                  </CommandItem>
                  <CommandItem
                    v-for="f in bulkFolders"
                    :key="f.id"
                    :value="f.name"
                    @select.prevent="handleBulkMove(f.id)"
                  >
                    {{ f.name }}
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <!-- Add tags -->
        <Popover v-model:open="bulkTagOpen">
          <PopoverTrigger as-child>
            <Button variant="outline" size="sm" :disabled="bulkPending">
              <Tag class="size-4" />
              Tags hinzufügen
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" class="w-[240px] p-0">
            <Command>
              <CommandInput placeholder="Tags suchen…" />
              <CommandList>
                <CommandEmpty>Nicht gefunden</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    v-for="t in bulkTags"
                    :key="t.id"
                    :value="t.name"
                    @select.prevent="toggleBulkTag(t.id)"
                  >
                    <Check
                      class="size-3.5"
                      :class="
                        bulkTagIds.includes(t.id) ? 'opacity-100' : 'opacity-0'
                      "
                    />
                    <span
                      v-if="t.color"
                      class="size-2.5 shrink-0 rounded-full"
                      :style="{ backgroundColor: t.color }"
                    />
                    {{ t.name }}
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
            <div class="border-t p-2">
              <Button
                size="sm"
                class="w-full"
                :disabled="bulkTagIds.length === 0 || bulkPending"
                @click="handleBulkAddTags"
              >
                Tags hinzufügen
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <Button
          variant="outline"
          size="sm"
          :disabled="bulkPending"
          @click="runBulkAction({ action: 'favorite' })"
        >
          <Star class="size-4" />
          Favorisieren
        </Button>
        <Button
          variant="outline"
          size="sm"
          :disabled="bulkPending"
          @click="runBulkAction({ action: 'unfavorite' })"
        >
          <StarOff class="size-4" />
          Favorit entfernen
        </Button>

        <AlertDialog v-model:open="bulkTrashOpen">
          <AlertDialogTrigger as-child>
            <Button variant="destructive" size="sm" :disabled="bulkPending">
              <Trash2 class="size-4" />
              In den Papierkorb
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {{ selectedIds.length }} Dokument{{
                  selectedIds.length !== 1 ? 'e' : ''
                }}
                in den Papierkorb verschieben?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Die Dokumente werden in den Papierkorb verschoben und können
                dort wiederhergestellt werden.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction
                class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                @click="confirmBulkTrash"
              >
                In den Papierkorb
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </template>

      <Button
        variant="ghost"
        size="icon"
        class="ml-auto size-8"
        aria-label="Auswahl aufheben"
        title="Auswahl aufheben"
        @click="clearSelection"
      >
        <X class="size-4" />
      </Button>
    </div>

    <DocumentsTable
      v-model:selected-ids="selectedIds"
      :documents="documents"
      :loading="loading"
      :has-active-filters="hasActiveFilters"
      :sort-column="sortColumn"
      :sort-order="sortOrder"
      :view="view"
      @sort="
        (col: string) => toggleSort(col as 'name' | 'fileSize' | 'createdAt')
      "
      @restore="handleRestore"
      @permanent-delete="handlePermanentDelete"
    />
    <div
      v-if="!loading && documents.length > 0"
      class="flex items-center justify-between"
    >
      <div class="text-muted-foreground flex items-center gap-2 text-sm">
        <span>{{ totalCount }} Dokument{{ totalCount !== 1 ? 'e' : '' }}</span>
        <span class="text-muted-foreground/50">|</span>
        <span>Zeilen pro Seite:</span>
        <Select
          :model-value="String(pageSize)"
          @update:model-value="
            (v) => {
              pageSize = Number(v) as 20 | 50 | 100
            }
          "
        >
          <SelectTrigger class="h-8 w-[80px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="20">20</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Pagination
        v-if="totalPages > 1"
        :total="totalCount"
        :items-per-page="pageSize"
        :page="currentPage"
        :sibling-count="1"
        @update:page="goToPage"
      >
        <PaginationContent v-slot="{ items }">
          <PaginationFirst />
          <PaginationPrevious />
          <template v-for="(item, index) in items" :key="index">
            <PaginationItem
              v-if="item.type === 'page'"
              :value="item.value"
              :is-active="item.value === currentPage"
            >
              {{ item.value }}
            </PaginationItem>
            <PaginationEllipsis v-else :index="index" />
          </template>
          <PaginationNext />
          <PaginationLast />
        </PaginationContent>
      </Pagination>
    </div>
    <template #overlay>
      <AlertDialog v-model:open="permanentDeleteOpen">
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dokument endgültig löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Das Dokument wird unwiderruflich gelöscht. Diese Aktion kann nicht
              rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              @click="confirmPermanentDelete"
            >
              Endgültig löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </template>
  </PageLayout>
</template>
