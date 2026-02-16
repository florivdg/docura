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
import { Trash2 } from 'lucide-vue-next'
import { useDocumentsFilter } from '@/composables/useDocumentsFilter'
import { useProcessingEvents } from '@/composables/useProcessingEvents'
import { apiFetch } from '@/lib/api-fetch'

const {
  view,
  query,
  searchMode,
  selectedFolderIds,
  selectedTagIds,
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

    <DocumentsTable
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
