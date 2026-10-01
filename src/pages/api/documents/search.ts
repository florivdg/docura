import { fulltextExpressions } from '@/db/fulltext-expressions'
import type { APIRoute } from 'astro'
import type { SQL } from 'drizzle-orm'
import { and, isNotNull, or, sql } from 'drizzle-orm'

import { document } from '@/db/schema/documents'
import { generateEmbedding } from '@/worker/clients/ollama'
import {
  readDocumentFilters,
  filterValidationError,
  viewValidationError,
  readDocumentPagination,
  type DocumentFilters,
  type DocumentPagination,
} from '@/lib/document-filters'
import { jsonResponse } from '@/lib/json-response'
import {
  buildFilterConditions,
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
  if (query.length < 2) {
    return jsonResponse({
      results: [],
      total: 0,
      page: pagination.page,
      pageSize: pagination.pageSize,
    })
  }

  const { searchConditions, relevanceScore, headlineSql } =
    fulltextExpressions(query)
  const filterConditions = buildFilterConditions(filterParams)
  const whereClause =
    filterConditions.length > 0
      ? and(or(...searchConditions), ...filterConditions)
      : or(...searchConditions)

  return executeSearch(
    { headline: headlineSql, relevance: relevanceScore },
    whereClause,
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

  const filterConditions: SQL[] = [
    isNotNull(document.embedding),
    ...buildFilterConditions(filterParams),
  ]

  const whereClause = and(...filterConditions)

  return executeSearch(
    {
      similarity:
        sql<number>`1 - (${document.embedding} <=> ${vectorLiteral}::vector)`.as(
          'similarity',
        ),
    },
    whereClause,
    pagination,
    sql`${document.embedding} <=> ${vectorLiteral}::vector`,
  )
}

async function executeSearch(
  fields: Record<string, SQL.Aliased>,
  whereClause: SQL | undefined,
  pagination: DocumentPagination,
  fallback: SQL,
) {
  const total = await countDocuments(whereClause)
  const rows = await documentRowsQuery(fields)
    .where(whereClause)
    .orderBy(documentSort(pagination, fallback))
    .limit(pagination.pageSize)
    .offset(pagination.offset)
  const tagsByDoc = await loadTagsForDocuments(rows.map((row) => row.id))
  return buildSearchResponse(rows, tagsByDoc, total, pagination)
}
