import { isValidUUID, VALID_STATUSES } from './api-utils'
import type { SortColumn, SortOrder } from './document-url'

export interface DocumentFilters {
  folderIds: string[]
  tagIds: string[]
  correspondentIds: string[]
  statuses: string[]
  view: string
}

export function readDocumentFilters(params: URLSearchParams): DocumentFilters {
  const list = (key: string) =>
    params.get(key)?.split(',').filter(Boolean) ?? []
  return {
    folderIds: list('folderIds'),
    tagIds: list('tagIds'),
    correspondentIds: list('correspondentIds'),
    statuses: list('status'),
    view: params.get('view') ?? 'all',
  }
}

export function filterValidationError(filters: DocumentFilters): string | null {
  const ids = [
    [filters.folderIds, 'Ungültige Ordner-ID in Filter'],
    [filters.tagIds, 'Ungültige Tag-ID in Filter'],
    [filters.correspondentIds, 'Ungültige Korrespondenten-ID in Filter'],
  ] as const
  for (const [values, message] of ids) {
    if (values.some((id) => !isValidUUID(id))) return message
  }
  if (filters.statuses.some((status) => !VALID_STATUSES.has(status)))
    return 'Ungültiger Status in Filter'
  return null
}

export function viewValidationError(view: string): string | null {
  return ['all', 'favorites', 'trash', 'archive'].includes(view)
    ? null
    : 'Ungültiger View-Parameter'
}

export interface DocumentPagination {
  sortColumn: SortColumn | null
  sortOrder: SortOrder
  pageSize: number
  offset: number
  page: number
}

export function readDocumentPagination(
  params: URLSearchParams,
  defaultSort: SortColumn | null = null,
): DocumentPagination {
  const sort = params.get('sort')
  const sortColumn = ['name', 'fileSize', 'createdAt'].includes(sort ?? '')
    ? (sort as SortColumn)
    : defaultSort
  const parsedPage = parseInt(params.get('page') ?? '1', 10)
  const page = Number.isFinite(parsedPage) ? Math.max(parsedPage, 1) : 1
  const size = parseInt(params.get('size') ?? '20', 10)
  const pageSize = [20, 50, 100].includes(size) ? size : 20
  return {
    sortColumn,
    sortOrder: params.get('order') === 'asc' ? 'asc' : 'desc',
    pageSize,
    offset: (page - 1) * pageSize,
    page,
  }
}
