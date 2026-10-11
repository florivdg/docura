import type { APIRoute } from 'astro'
import { document } from '@/db/schema/documents'
import { desc } from 'drizzle-orm'
import {
  readDocumentFilters,
  filterValidationError,
  viewValidationError,
  readDocumentPagination,
} from '@/lib/document-filters'
import { jsonResponse } from '@/lib/json-response'
import {
  documentListCondition,
  loadTagsForDocuments,
  countDocuments,
  documentRowsQuery,
  documentSort,
} from '@/db/document-list'

export const GET: APIRoute = async ({ url }) => {
  const filters = readDocumentFilters(url.searchParams)
  const error =
    viewValidationError(filters.view) ?? filterValidationError(filters)
  if (error) return jsonResponse({ error }, 400)
  const {
    sortColumn,
    sortOrder,
    pageSize,
    offset,
    page: pageParam,
  } = readDocumentPagination(url.searchParams, 'createdAt')
  const whereClause = documentListCondition(filters)
  const pagination = {
    sortColumn,
    sortOrder,
    pageSize,
    offset,
    page: pageParam,
  }
  const total = await countDocuments(whereClause, filters)
  const rows = await documentRowsQuery({})
    .where(whereClause)
    .orderBy(documentSort(pagination, desc(document.createdAt)))
    .limit(pageSize)
    .offset(offset)

  const tagsByDoc = await loadTagsForDocuments(rows.map((r) => r.id))

  const documents = rows.map((r) => ({
    ...r,
    tags: tagsByDoc.get(r.id) ?? [],
  }))

  return jsonResponse({ documents, total, page: pageParam, pageSize })
}
