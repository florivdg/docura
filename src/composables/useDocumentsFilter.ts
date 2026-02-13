import { computed, ref, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { apiFetch } from '@/lib/api-fetch'

type SortColumn = 'name' | 'fileSize' | 'createdAt'
type SortOrder = 'asc' | 'desc'
const VALID_SORT_COLUMNS: SortColumn[] = ['name', 'fileSize', 'createdAt']
const VALID_PAGE_SIZES = [20, 50, 100] as const

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
  folderName: string | null
  tags: DocumentTag[]
  processingStatus: string | null
  processingStep: string | null
  processingError: string | null
  headline?: string | null
  similarity?: number | null
}

function parseUrlState() {
  const params = new URLSearchParams(window.location.search)
  const sortParam = params.get('sort')
  const orderParam = params.get('order')
  const pageParam = parseInt(params.get('page') ?? '1', 10)
  const sizeParam = parseInt(params.get('size') ?? '20', 10)
  return {
    query: params.get('q') ?? '',
    searchMode: (params.get('mode') === 'semantic'
      ? 'semantic'
      : 'fulltext') as 'fulltext' | 'semantic',
    folderIds: params.get('folders')?.split(',').filter(Boolean) ?? [],
    tagIds: params.get('tags')?.split(',').filter(Boolean) ?? [],
    statuses: params.get('status')?.split(',').filter(Boolean) ?? [],
    sortColumn:
      sortParam && VALID_SORT_COLUMNS.includes(sortParam as SortColumn)
        ? (sortParam as SortColumn)
        : null,
    sortOrder: (orderParam === 'asc' ? 'asc' : 'desc') as SortOrder,
    page: pageParam >= 1 ? pageParam : 1,
    pageSize: VALID_PAGE_SIZES.includes(
      sizeParam as (typeof VALID_PAGE_SIZES)[number],
    )
      ? sizeParam
      : 20,
  }
}

export function useDocumentsFilter() {
  // State (initialized from URL params)
  const initial = parseUrlState()
  const query = ref(initial.query)
  const searchMode = ref(initial.searchMode)
  const selectedFolderIds = ref(initial.folderIds)
  const selectedTagIds = ref(initial.tagIds)
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
      selectedStatuses.value.length > 0 ||
      sortColumn.value !== null,
  )

  function buildFilterParams(): URLSearchParams {
    const params = new URLSearchParams()
    if (selectedFolderIds.value.length > 0) {
      params.set('folderIds', selectedFolderIds.value.join(','))
    }
    if (selectedTagIds.value.length > 0) {
      params.set('tagIds', selectedTagIds.value.join(','))
    }
    if (selectedStatuses.value.length > 0) {
      params.set('status', selectedStatuses.value.join(','))
    }
    if (sortColumn.value) {
      params.set('sort', sortColumn.value)
      params.set('order', sortOrder.value)
    }
    params.set('page', String(currentPage.value))
    params.set('size', String(pageSize.value))
    return params
  }

  async function fetchDocuments() {
    fetchController?.abort()
    const controller = new AbortController()
    fetchController = controller

    loading.value = true
    try {
      const trimmedQuery = query.value.trim()
      const params = buildFilterParams()

      let url: string
      if (trimmedQuery) {
        params.set('q', trimmedQuery)
        params.set('mode', searchMode.value)
        url = `/api/documents/search?${params.toString()}`
      } else {
        url = params.toString()
          ? `/api/documents?${params.toString()}`
          : '/api/documents'
      }

      const res = await apiFetch(url, { signal: controller.signal })
      const data = await res.json()

      if (trimmedQuery) {
        documents.value = data.results ?? []
      } else {
        documents.value = data.documents ?? []
      }
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
    [selectedFolderIds, selectedTagIds, selectedStatuses],
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
    const params = new URLSearchParams()
    if (query.value.trim()) params.set('q', query.value.trim())
    if (searchMode.value !== 'fulltext') params.set('mode', searchMode.value)
    if (selectedFolderIds.value.length > 0)
      params.set('folders', selectedFolderIds.value.join(','))
    if (selectedTagIds.value.length > 0)
      params.set('tags', selectedTagIds.value.join(','))
    if (selectedStatuses.value.length > 0)
      params.set('status', selectedStatuses.value.join(','))
    if (sortColumn.value) {
      params.set('sort', sortColumn.value)
      if (sortOrder.value !== 'desc') params.set('order', sortOrder.value)
    }
    if (currentPage.value > 1) params.set('page', String(currentPage.value))
    if (pageSize.value !== 20) params.set('size', String(pageSize.value))

    const search = params.toString()
    const newUrl = search
      ? `${window.location.pathname}?${search}`
      : window.location.pathname
    history.replaceState(null, '', newUrl)
  }

  watch(
    [
      query,
      searchMode,
      selectedFolderIds,
      selectedTagIds,
      selectedStatuses,
      sortColumn,
      sortOrder,
      currentPage,
      pageSize,
    ],
    () => syncToUrl(),
    {
      deep: true,
    },
  )

  return {
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
  }
}
