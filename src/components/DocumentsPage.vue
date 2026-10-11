<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useThrottleFn } from '@vueuse/core'
import PageLayout from '@/components/PageLayout.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import StatusMessage from '@/components/StatusMessage.vue'
import DocumentsBulkBar from '@/components/documents/DocumentsBulkBar.vue'
import DocumentsFilterBar from '@/components/documents/DocumentsFilterBar.vue'
import DocumentsPagination from '@/components/documents/DocumentsPagination.vue'
import DocumentsTable from '@/components/documents/DocumentsTable.vue'
import TrashInfoBar from '@/components/documents/TrashInfoBar.vue'
import { useApiRequest } from '@/composables/useApiRequest'
import { useBulkDocumentActions } from '@/composables/useBulkDocumentActions'
import { useDocumentsFilter } from '@/composables/useDocumentsFilter'
import { useProcessingEvents } from '@/composables/useProcessingEvents'
import { apiFetch } from '@/lib/api-fetch'
import { applyListProcessingEvent } from '@/lib/document-processing-event'

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

const VIEW_TITLES: Record<string, string> = {
  favorites: 'Favoriten',
  trash: 'Papierkorb',
  archive: 'Archiv',
}
const pageTitle = computed(() => VIEW_TITLES[view.value] ?? 'Dokumente')
const hasResults = computed(() => !loading.value && documents.value.length > 0)

const permanentDeleteOpen = ref(false)
const pendingDeleteId = ref<string | null>(null)
const trashRetentionDays = ref<number | null>(null)

const {
  selectedIds,
  bulkPending,
  bulkError,
  bulkNotice,
  clearSelection,
  runBulkAction,
} = useBulkDocumentActions(documents, fetchDocuments, requestInputs)

// Separate request states, so restoring a row does not spin the trash button.
const trashRequest = useApiRequest()
const rowRequest = useApiRequest()
const emptyingTrash = trashRequest.pending
const listError = computed(
  () => bulkError.value || trashRequest.error.value || rowRequest.error.value,
)

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

/** Runs a mutating request and reloads the list when it succeeded. */
async function mutateAndRefetch(
  request: ReturnType<typeof useApiRequest>,
  url: string,
  fallback: string,
  init: { method: string; body?: unknown },
) {
  if (await request.run(url, fallback, init)) await fetchDocuments()
}

function handleEmptyTrash() {
  return mutateAndRefetch(
    trashRequest,
    '/api/documents/trash',
    'Fehler beim Leeren des Papierkorbs.',
    { method: 'POST', body: { action: 'empty' } },
  )
}

function handleRestore(id: string) {
  return mutateAndRefetch(
    rowRequest,
    `/api/documents/${id}`,
    'Fehler beim Wiederherstellen des Dokuments.',
    { method: 'PATCH', body: { trashedAt: null } },
  )
}

function handlePermanentDelete(id: string) {
  pendingDeleteId.value = id
  permanentDeleteOpen.value = true
}

async function confirmPermanentDelete() {
  const id = pendingDeleteId.value
  if (!id) return
  await mutateAndRefetch(
    rowRequest,
    `/api/documents/${id}?permanent=true`,
    'Fehler beim endgültigen Löschen des Dokuments.',
    { method: 'DELETE' },
  )
  permanentDeleteOpen.value = false
  pendingDeleteId.value = null
}

// At most one refetch per interval, however many events arrive.
const throttledRefetch = useThrottleFn(fetchDocuments, 2000, true)

useProcessingEvents((event) => {
  if (applyListProcessingEvent(documents.value, event)) void throttledRefetch()
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
      v-model:correspondent-ids="selectedCorrespondentIds"
      v-model:statuses="selectedStatuses"
      :has-active-filters="hasActiveFilters"
      @clear="clearFilters"
    />

    <TrashInfoBar
      v-if="view === 'trash' && hasResults"
      :retention-days="trashRetentionDays"
      :emptying="emptyingTrash"
      @empty="handleEmptyTrash"
    />

    <DocumentsBulkBar
      v-if="selectedIds.length > 0"
      :count="selectedIds.length"
      :trash-view="view === 'trash'"
      :pending="bulkPending"
      @action="runBulkAction"
      @clear="clearSelection"
    />

    <StatusMessage
      v-if="listError || bulkNotice"
      :error="listError"
      :notice="bulkNotice"
    />

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
    <DocumentsPagination
      v-if="hasResults"
      v-model:page-size="pageSize"
      :total-count="totalCount"
      :current-page="currentPage"
      :total-pages="totalPages"
      @page="goToPage"
    />
    <template #overlay>
      <ConfirmDialog
        v-model:open="permanentDeleteOpen"
        title="Dokument endgültig löschen?"
        description="Das Dokument wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden."
        confirm-label="Endgültig löschen"
        destructive
        @confirm="confirmPermanentDelete"
      />
    </template>
  </PageLayout>
</template>
