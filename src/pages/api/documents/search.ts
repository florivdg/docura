import { fulltextExpressions } from '@/db/fulltext-expressions'
import type { APIRoute } from 'astro'
import type { SQL } from 'drizzle-orm'
import { and, isNotNull, sql } from 'drizzle-orm'

import { document } from '@/db/schema/documents'
import { generateEmbedding } from '@/worker/clients/ollama'
import {
  readDocumentFilters,
  filterValidationError,
  viewValidationError,
  readDocumentPagination,
  MIN_QUERY_LENGTH,
  type DocumentFilters,
  type DocumentPagination,
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
  const query = url.searchParams.get('q')?.trim()
  const mode = url.searchParams.get('mode') || 'fulltext'
  const filterParams = readDocumentFilters(url.searchParams)
  const error =
    filterValidationError(filterParams) ??
    viewValidationError(filterParams.view)
  if (error) return jsonResponse({ error }, 400)
  const paginationParams = readDocumentPagination(url.searchParams)
  if (!query)
    return jsonResponse({
      results: [],
      total: 0,
      page: 1,
      pageSize: paginationParams.pageSize,
    })
  return mode === 'semantic'
    ? handleSemanticSearch(query, paginationParams, filterParams)
    : handleFulltextSearch(query, paginationParams, filterParams)
}

function buildSearchResponse(
  rows: Array<{ id: string } & Record<string, unknown>>,
  tagsByDoc: Map<string, { id: string; name: string; color: string | null }[]>,
  total: number,
  pagination: DocumentPagination,
) {
  const results = rows.map((r) => ({
    ...r,
    tags: tagsByDoc.get(r.id) ?? [],
  }))

  return jsonResponse({
    results,
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
  })
}

async function handleFulltextSearch(
  query: string,
  pagination: DocumentPagination,
  filterParams: DocumentFilters,
) {
  if (query.length < MIN_QUERY_LENGTH) {
    return jsonResponse({
      results: [],
      total: 0,
      page: pagination.page,
      pageSize: pagination.pageSize,
    })
  }

  const { relevanceScore, headlineSql } = fulltextExpressions(query)
  return executeSearch(
    { headline: headlineSql, relevance: relevanceScore },
    documentListCondition(filterParams, query),
    filterParams,
    pagination,
    sql`relevance DESC`,
  )
}

async function handleSemanticSearch(
  query: string,
  pagination: DocumentPagination,
  filterParams: DocumentFilters,
) {
  let queryVector: number[]
  try {
    const embeddings = await generateEmbedding(query)
    queryVector = embeddings[0]
  } catch {
    return jsonResponse(
      {
        error: 'Semantische Suche nicht verfügbar (Ollama nicht erreichbar)',
      },
      503,
    )
  }

  const vectorLiteral = `[${queryVector.join(',')}]`

  const whereClause = and(
    isNotNull(document.embedding),
    documentListCondition(filterParams),
  )

  return executeSearch(
    {
      similarity:
        sql<number>`1 - (${document.embedding} <=> ${vectorLiteral}::vector)`.as(
          'similarity',
        ),
    },
    whereClause,
    filterParams,
    pagination,
    sql`${document.embedding} <=> ${vectorLiteral}::vector`,
  )
}

async function executeSearch(
  fields: Record<string, SQL.Aliased>,
  whereClause: SQL | undefined,
  filters: DocumentFilters,
  pagination: DocumentPagination,
  fallback: SQL,
) {
  const total = await countDocuments(whereClause, filters)
  const rows = await documentRowsQuery(fields)
    .where(whereClause)
    .orderBy(documentSort(pagination, fallback))
    .limit(pagination.pageSize)
    .offset(pagination.offset)
  const tagsByDoc = await loadTagsForDocuments(rows.map((row) => row.id))
  return buildSearchResponse(rows, tagsByDoc, total, pagination)
}
