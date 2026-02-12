<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import AppSidebar from '@/components/AppSidebar.vue'
import SiteHeader from '@/components/SiteHeader.vue'
import DocumentsFilterBar from '@/components/documents/DocumentsFilterBar.vue'
import DocumentsTable from '@/components/documents/DocumentsTable.vue'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
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
import { useDocumentsFilter } from '@/composables/useDocumentsFilter'
import { useProcessingEvents } from '@/composables/useProcessingEvents'

const {
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

onMounted(() => {
  void fetchDocuments()
  window.addEventListener('document-uploaded', onDocumentUploaded)
})

onUnmounted(() => {
  window.removeEventListener('document-uploaded', onDocumentUploaded)
})
</script>

<template>
  <SidebarProvider>
    <AppSidebar />
    <SidebarInset>
      <SiteHeader title="Dokumente" />
      <div class="flex flex-1 flex-col">
        <div class="flex flex-col gap-4 p-4 md:gap-6 md:p-6">
          <DocumentsFilterBar
            v-model:query="query"
            v-model:search-mode="searchMode"
            v-model:folder-ids="selectedFolderIds"
            v-model:tag-ids="selectedTagIds"
            v-model:statuses="selectedStatuses"
            :has-active-filters="hasActiveFilters"
            @clear="clearFilters"
          />
          <DocumentsTable
            :documents="documents"
            :loading="loading"
            :has-active-filters="hasActiveFilters"
            :sort-column="sortColumn"
            :sort-order="sortOrder"
            @sort="
              (col: string) =>
                toggleSort(col as 'name' | 'fileSize' | 'createdAt')
            "
          />
          <div
            v-if="!loading && documents.length > 0"
            class="flex items-center justify-between"
          >
            <div class="text-muted-foreground flex items-center gap-2 text-sm">
              <span
                >{{ totalCount }} Dokument{{
                  totalCount !== 1 ? 'e' : ''
                }}</span
              >
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
        </div>
      </div>
    </SidebarInset>
  </SidebarProvider>
</template>
