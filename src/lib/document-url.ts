export type ViewType = 'all' | 'favorites' | 'trash' | 'archive'
export type SortColumn = 'name' | 'fileSize' | 'createdAt'
export type SortOrder = 'asc' | 'desc'
const VALID_SORT_COLUMNS: SortColumn[] = ['name', 'fileSize', 'createdAt']
const VALID_VIEWS: ViewType[] = ['all', 'favorites', 'trash', 'archive']
const VALID_PAGE_SIZES = [20, 50, 100] as const

export function parseDocumentUrl(search: string) {
  const params = new URLSearchParams(search)
  const viewParam = params.get('view') as ViewType | null
  const sortParam = params.get('sort')
  const orderParam = params.get('order')
  const pageParam = parseInt(params.get('page') ?? '1', 10)
  const sizeParam = parseInt(params.get('size') ?? '20', 10)
  return {
    view:
      viewParam && VALID_VIEWS.includes(viewParam)
        ? viewParam
        : ('all' as ViewType),
    query: params.get('q') ?? '',
    searchMode: (params.get('mode') === 'semantic'
      ? 'semantic'
      : 'fulltext') as 'fulltext' | 'semantic',
    folderIds: params.get('folders')?.split(',').filter(Boolean) ?? [],
    tagIds: params.get('tags')?.split(',').filter(Boolean) ?? [],
    correspondentIds:
      params.get('correspondents')?.split(',').filter(Boolean) ?? [],
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

type DocumentUrlState = ReturnType<typeof parseDocumentUrl>

function commonParams(state: DocumentUrlState, api: boolean): URLSearchParams {
  const params = new URLSearchParams()
  if (state.view !== 'all') params.set('view', state.view)
  const lists = [
    [api ? 'folderIds' : 'folders', state.folderIds],
    [api ? 'tagIds' : 'tags', state.tagIds],
    [api ? 'correspondentIds' : 'correspondents', state.correspondentIds],
    ['status', state.statuses],
  ] as const
  for (const [key, values] of lists)
    if (values.length) params.set(key, values.join(','))
  if (state.sortColumn) params.set('sort', state.sortColumn)
  return params
}

export function documentUrlParams(state: DocumentUrlState): URLSearchParams {
  const params = commonParams(state, false)
  if (state.query.trim()) params.set('q', state.query.trim())
  if (state.searchMode !== 'fulltext') params.set('mode', state.searchMode)
  if (state.sortColumn && state.sortOrder !== 'desc')
    params.set('order', state.sortOrder)
  if (state.page > 1) params.set('page', String(state.page))
  if (state.pageSize !== 20) params.set('size', String(state.pageSize))
  return params
}

export function documentApiParams(state: DocumentUrlState): URLSearchParams {
  const params = commonParams(state, true)
  if (state.sortColumn) params.set('order', state.sortOrder)
  params.set('page', String(state.page))
  params.set('size', String(state.pageSize))
  return params
}

export function documentRequest(state: DocumentUrlState): {
  url: string
  resultKey: 'results' | 'documents'
} {
  const params = documentApiParams(state)
  const query = state.query.trim()
  if (query) {
    params.set('q', query)
    params.set('mode', state.searchMode)
    return { url: `/api/documents/search?${params}`, resultKey: 'results' }
  }
  return { url: `/api/documents?${params}`, resultKey: 'documents' }
}
