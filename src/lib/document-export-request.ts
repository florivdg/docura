import { ApiValidationError } from './api-validation-error'
import { MAX_IDS } from './document-bulk'
import {
  filterValidationError,
  MIN_QUERY_LENGTH,
  readDocumentFilters,
  viewValidationError,
  type DocumentFilters,
} from './document-filters'
import { uuidList } from './request-validation'

/**
 * Which documents to export: explicit `ids` (a selection) win over the list
 * filters; otherwise the view, filters and full-text query of the list.
 */
export interface ExportSelection {
  ids: string[] | null
  filters: DocumentFilters
  query: string
}

function readIds(raw: string): string[] {
  return uuidList(raw.split(',').filter(Boolean), {
    emptyMessage: 'Keine Dokumente ausgewählt',
    invalidMessage: 'Ungültige Dokument-ID',
    max: { count: MAX_IDS, label: 'Dokumente' },
  })
}

function queryValidationError(params: URLSearchParams, query: string) {
  if (!query) return null
  if (params.get('mode') === 'semantic')
    return 'Semantische Suche kann nicht exportiert werden'
  return query.length < MIN_QUERY_LENGTH
    ? `Suchbegriff muss mindestens ${MIN_QUERY_LENGTH} Zeichen lang sein`
    : null
}

/** Parses the export query string; invalid input throws a 400. */
export function readExportSelection(params: URLSearchParams): ExportSelection {
  const filters = readDocumentFilters(params)
  const rawIds = params.get('ids')
  if (rawIds !== null) return { ids: readIds(rawIds), filters, query: '' }
  const query = params.get('q')?.trim() ?? ''
  const error =
    viewValidationError(filters.view) ??
    filterValidationError(filters) ??
    queryValidationError(params, query)
  if (error) throw new ApiValidationError(error)
  return { ids: null, filters, query }
}
