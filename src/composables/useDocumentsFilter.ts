import { computed, ref, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { apiFetch } from '@/lib/api-fetch'

export type { ViewType } from '@/lib/document-url'
import {
  parseDocumentUrl,
  documentUrlParams,
  documentRequest,
  type ViewType,
  type SortColumn,
  type SortOrder,
} from '@/lib/document-url'
export interface DocumentTag {
  id: string
  name: string
  color: string | null
}

export interface DocumentRow {
  id: string
  name: string
  mimeType: string
  fileSize: number
  createdAt: string
  updatedAt: string
  documentDate: string | null
  folderName: string | null
  correspondentName: string | null
  tags: DocumentTag[]
  processingStatus: string | null
  processingStep: string | null
  processingError: string | null
  isFavorite: boolean
  archivedAt: string | null
  trashedAt: string | null
  headline?: string | null
  similarity?: number | null
}

export function useDocumentsFilter() {
  // State (initialized from URL params)
  const initial = parseDocumentUrl(window.location.search)
  const view = ref<ViewType>(initial.view)
  const query = ref(initial.query)
  const searchMode = ref(initial.searchMode)
  const selectedFolderIds = ref(initial.folderIds)
  const selectedTagIds = ref(initial.tagIds)
  const selectedCorrespondentIds = ref(initial.correspondentIds)
  const selectedStatuses = ref(initial.statuses)

  const sortColumn = ref<SortColumn | null>(initial.sortColumn)
  const sortOrder = ref<SortOrder>(initial.sortOrder)
  const currentPage = ref(initial.page)
  const pageSize = ref<20 | 50 | 100>(initial.pageSize as 20 | 50 | 100)
  const totalCount = ref(0)
  const totalPages = computed(() =>
    Math.max(1, Math.ceil(totalCount.value / pageSize.value)),
  )

  // Data
  const documents = ref<DocumentRow[]>([])
  const loading = ref(false)
  let fetchController: AbortController | null = null
  let clearingFilters = false

  // Computed
  const hasActiveFilters = computed(
    () =>
      query.value.trim().length > 0 ||
      selectedFolderIds.value.length > 0 ||
      selectedTagIds.value.length > 0 ||
      selectedCorrespondentIds.value.length > 0 ||
      selectedStatuses.value.length > 0 ||
      sortColumn.value !== null,
  )

  function filterState() {
    return {
      view: view.value,
      query: query.value,
      searchMode: searchMode.value,
      folderIds: selectedFolderIds.value,
      tagIds: selectedTagIds.value,
      correspondentIds: selectedCorrespondentIds.value,
      statuses: selectedStatuses.value,
      sortColumn: sortColumn.value,
      sortOrder: sortOrder.value,
      page: currentPage.value,
      pageSize: pageSize.value,
    }
  }

  async function fetchDocuments() {
    fetchController?.abort()
    const controller = new AbortController()
    fetchController = controller

    loading.value = true
    try {
      const { url, resultKey } = documentRequest(filterState())

      const res = await apiFetch(url, { signal: controller.signal })
      const data = await res.json()

      documents.value = data[resultKey] ?? []
      totalCount.value = data.total ?? 0
      if (currentPage.value > totalPages.value && totalPages.value > 0) {
        currentPage.value = totalPages.value
        return fetchDocuments()
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      documents.value = []
    } finally {
      loading.value = false
    }
  }

  function clearFilters() {
    clearingFilters = true
    query.value = ''
    selectedFolderIds.value = []
    selectedTagIds.value = []
    selectedCorrespondentIds.value = []
    selectedStatuses.value = []
    sortColumn.value = null
    sortOrder.value = 'desc'
    currentPage.value = 1
    pageSize.value = 20
    clearingFilters = false
    void fetchDocuments()
  }

  function toggleSort(column: SortColumn) {
    if (sortColumn.value === column) {
      const initialOrder = column === 'name' ? 'asc' : 'desc'
      if (sortOrder.value === initialOrder) {
        sortOrder.value = initialOrder === 'asc' ? 'desc' : 'asc'
      } else {
        sortColumn.value = null // 3rd click → back to default
      }
    } else {
      sortColumn.value = column
      sortOrder.value = column === 'name' ? 'asc' : 'desc'
    }
  }

  function goToPage(page: number) {
    const clamped = Math.max(1, Math.min(page, totalPages.value))
    if (clamped === currentPage.value) return
    currentPage.value = clamped
    void fetchDocuments()
  }

  const debouncedFetch = useDebounceFn(fetchDocuments, 300)

  // Watch view - immediate fetch
  watch(view, () => {
    if (clearingFilters) return
    currentPage.value = 1
    void fetchDocuments()
  })

  // Watch query with debounce
  watch(query, () => {
    if (clearingFilters) return
    currentPage.value = 1
    void debouncedFetch()
  })

  // Watch searchMode - immediate fetch if query is present
  watch(searchMode, () => {
    if (clearingFilters) return
    if (query.value.trim()) {
      currentPage.value = 1
      void fetchDocuments()
    }
  })

  // Watch filters - immediate fetch
  watch(
    [
      selectedFolderIds,
      selectedTagIds,
      selectedCorrespondentIds,
      selectedStatuses,
    ],
    () => {
      if (clearingFilters) return
      currentPage.value = 1
      void fetchDocuments()
    },
    { deep: true },
  )

  // Watch sort changes
  watch([sortColumn, sortOrder], () => {
    if (clearingFilters) return
    currentPage.value = 1
    void fetchDocuments()
  })

  // Watch pageSize changes
  watch(pageSize, () => {
    if (clearingFilters) return
    currentPage.value = 1
    void fetchDocuments()
  })

  // Sync state to URL params
  function syncToUrl() {
    const params = documentUrlParams(filterState())
    const search = params.toString()
    const newUrl = search
      ? `${window.location.pathname}?${search}`
      : window.location.pathname
    history.replaceState(null, '', newUrl)
  }

  // Every input that changes the fetched result set — also the tuple consumers
  // watch to invalidate result-bound state (e.g. the bulk selection).
  const requestInputs = [
    view,
    query,
    searchMode,
    selectedFolderIds,
    selectedTagIds,
    selectedCorrespondentIds,
    selectedStatuses,
    sortColumn,
    sortOrder,
    currentPage,
    pageSize,
  ]

  watch(requestInputs, () => syncToUrl(), {
    deep: true,
  })

  return {
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
  }
}
