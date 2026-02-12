import type { APIRoute } from 'astro'
import type { SQL } from 'drizzle-orm'
import { and, asc, desc, eq, inArray, isNotNull, or, sql } from 'drizzle-orm'

import { db } from '@/db'
import {
  document,
  documentTag,
  folder,
  processingJob,
  tag,
} from '@/db/schema/documents'
import { generateEmbedding } from '@/worker/clients/ollama'

interface FilterParams {
  folderIds: string[]
  tagIds: string[]
  statuses: string[]
}

const SORT_COLUMNS = ['name', 'fileSize', 'createdAt'] as const
type SortColumn = (typeof SORT_COLUMNS)[number]
const PAGE_SIZES = [20, 50, 100] as const

interface PaginationParams {
  sortColumn: SortColumn | null
  sortOrder: 'asc' | 'desc'
  pageSize: number
  offset: number
  page: number
}

export const GET: APIRoute = async ({ url }) => {
  const query = url.searchParams.get('q')?.trim()
  const mode = url.searchParams.get('mode') || 'fulltext'
  const sortParam = url.searchParams.get('sort')
  const orderParam = url.searchParams.get('order') ?? 'desc'
  const pageParam = Math.max(
    parseInt(url.searchParams.get('page') ?? '1', 10),
    1,
  )
  const sizeParam = parseInt(url.searchParams.get('size') ?? '20', 10)

  // sortColumn is nullable - null means use relevance/similarity ordering
  const sortColumn: SortColumn | null =
    sortParam && SORT_COLUMNS.includes(sortParam as SortColumn)
      ? (sortParam as SortColumn)
      : null
  const sortOrder = orderParam === 'asc' ? 'asc' : 'desc'
  const pageSize = PAGE_SIZES.includes(sizeParam as (typeof PAGE_SIZES)[number])
    ? sizeParam
    : 20
  const offset = (pageParam - 1) * pageSize

  const folderIds =
    url.searchParams.get('folderIds')?.split(',').filter(Boolean) ?? []
  const tagIds =
    url.searchParams.get('tagIds')?.split(',').filter(Boolean) ?? []
  const statuses =
    url.searchParams.get('status')?.split(',').filter(Boolean) ?? []
  const filterParams: FilterParams = { folderIds, tagIds, statuses }

  if (!query) {
    return new Response(
      JSON.stringify({ results: [], total: 0, page: 1, pageSize }),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  const paginationParams: PaginationParams = {
    sortColumn,
    sortOrder,
    pageSize,
    offset,
    page: pageParam,
  }

  if (mode === 'semantic') {
    return handleSemanticSearch(query, paginationParams, filterParams)
  }

  return handleFulltextSearch(query, paginationParams, filterParams)
}

function buildPrefixTsquery(input: string): string | null {
  const tokens = input
    .replace(/[!&|<>():*\\'"]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0)
  if (tokens.length === 0) return null
  return tokens.map((t) => `${t}:*`).join(' & ')
}

function escapeLikePattern(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

async function handleFulltextSearch(
  query: string,
  pagination: PaginationParams,
  filterParams: FilterParams,
) {
  if (query.length < 2) {
    return new Response(
      JSON.stringify({
        results: [],
        total: 0,
        page: pagination.page,
        pageSize: pagination.pageSize,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  const escaped = escapeLikePattern(query)
  const likePattern = `%${escaped}%`

  const prefixTsq = buildPrefixTsquery(query)
  const tsVector = sql`to_tsvector('german', coalesce(${document.textContent}, ''))`

  const useContentIlike = query.length >= 3

  // Build WHERE conditions
  const nameIlike = sql`${document.name} ILIKE ${likePattern}`
  const fuzzyName = sql`similarity(${document.name}, ${query}) > 0.3`

  const conditions = [nameIlike, fuzzyName]

  if (prefixTsq) {
    const tsQuery = sql`to_tsquery('german', ${prefixTsq})`
    conditions.push(sql`${tsVector} @@ ${tsQuery}`)
  }
  if (useContentIlike) {
    conditions.push(sql`${document.textContent} ILIKE ${likePattern}`)
  }

  // Build filter conditions
  const filterConditions: SQL[] = []

  if (filterParams.folderIds.length > 0) {
    filterConditions.push(inArray(document.folderId, filterParams.folderIds))
  }

  if (filterParams.tagIds.length > 0) {
    const docIdsWithTags = db
      .select({ documentId: documentTag.documentId })
      .from(documentTag)
      .where(inArray(documentTag.tagId, filterParams.tagIds))
    filterConditions.push(inArray(document.id, docIdsWithTags))
  }

  if (filterParams.statuses.length > 0) {
    filterConditions.push(
      inArray(
        sql`coalesce(${processingJob.status}, 'pending')`,
        filterParams.statuses,
      ),
    )
  }

  // Build relevance score
  const scoreFragments = [
    sql`CASE WHEN ${document.name} ILIKE ${likePattern} THEN 10 ELSE 0 END`,
    sql`5.0 * coalesce(similarity(${document.name}, ${query}), 0)`,
  ]
  if (prefixTsq) {
    const tsQuery = sql`to_tsquery('german', ${prefixTsq})`
    scoreFragments.push(
      sql`3.0 * coalesce(ts_rank(${tsVector}, ${tsQuery}), 0)`,
    )
  }
  if (useContentIlike) {
    scoreFragments.push(
      sql`CASE WHEN ${document.textContent} ILIKE ${likePattern} THEN 1 ELSE 0 END`,
    )
  }

  const relevanceScore = sql`(${sql.join(scoreFragments, sql` + `)})`.as(
    'relevance',
  )

  // Build headline
  let headlineSql: SQL.Aliased<string>
  if (prefixTsq) {
    const tsQuery = sql`to_tsquery('german', ${prefixTsq})`
    if (useContentIlike) {
      headlineSql = sql<string>`
        CASE
          WHEN ${tsVector} @@ ${tsQuery}
          THEN ts_headline('german', coalesce(${document.textContent}, ''), ${tsQuery}, 'MaxWords=30, MinWords=10, MaxFragments=1')
          WHEN ${document.textContent} ILIKE ${likePattern}
          THEN substring(${document.textContent} FROM greatest(1, position(lower(${query}) in lower(${document.textContent})) - 40) FOR (${query.length} + 80))
          ELSE NULL
        END
      `.as('headline')
    } else {
      headlineSql = sql<string>`
        CASE
          WHEN ${tsVector} @@ ${tsQuery}
          THEN ts_headline('german', coalesce(${document.textContent}, ''), ${tsQuery}, 'MaxWords=30, MinWords=10, MaxFragments=1')
          ELSE NULL
        END
      `.as('headline')
    }
  } else if (useContentIlike) {
    headlineSql = sql<string>`
      CASE
        WHEN ${document.textContent} ILIKE ${likePattern}
        THEN substring(${document.textContent} FROM greatest(1, position(lower(${escaped}) in lower(${document.textContent})) - 40) FOR (${escaped.length} + 80))
        ELSE NULL
      END
    `.as('headline')
  } else {
    headlineSql = sql<string>`NULL`.as('headline')
  }

  // Subquery for latest processing job per document
  const latestJobPerDoc = db
    .select({
      documentId: processingJob.documentId,
      maxCreatedAt: sql<Date>`max(${processingJob.createdAt})`.as(
        'max_created_at',
      ),
    })
    .from(processingJob)
    .groupBy(processingJob.documentId)
    .as('latest_job')

  const whereClause =
    filterConditions.length > 0
      ? and(or(...conditions), ...filterConditions)
      : or(...conditions)

  const sortColumnMap = {
    name: document.name,
    fileSize: document.fileSize,
    createdAt: document.createdAt,
  }

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(document)
    .leftJoin(folder, eq(document.folderId, folder.id))
    .leftJoin(latestJobPerDoc, eq(document.id, latestJobPerDoc.documentId))
    .leftJoin(
      processingJob,
      sql`${processingJob.documentId} = ${latestJobPerDoc.documentId} AND ${processingJob.createdAt} = ${latestJobPerDoc.maxCreatedAt}`,
    )
    .where(whereClause)
  const total = Number(countResult[0]?.count ?? 0)

  const rows = await db
    .select({
      id: document.id,
      name: document.name,
      mimeType: document.mimeType,
      fileSize: document.fileSize,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      folderName: folder.name,
      headline: headlineSql,
      relevance: relevanceScore,
      processingStatus: processingJob.status,
      processingStep: processingJob.step,
      processingError: processingJob.errorMessage,
    })
    .from(document)
    .leftJoin(folder, eq(document.folderId, folder.id))
    .leftJoin(latestJobPerDoc, eq(document.id, latestJobPerDoc.documentId))
    .leftJoin(
      processingJob,
      sql`${processingJob.documentId} = ${latestJobPerDoc.documentId} AND ${processingJob.createdAt} = ${latestJobPerDoc.maxCreatedAt}`,
    )
    .where(whereClause)
    .orderBy(
      pagination.sortColumn
        ? pagination.sortOrder === 'asc'
          ? asc(sortColumnMap[pagination.sortColumn])
          : desc(sortColumnMap[pagination.sortColumn])
        : sql`relevance DESC`,
    )
    .limit(pagination.pageSize)
    .offset(pagination.offset)

  // Fetch tags for result documents
  const docIds = rows.map((r) => r.id)
  const tagRows =
    docIds.length > 0
      ? await db
          .select({
            documentId: documentTag.documentId,
            tagId: tag.id,
            tagName: tag.name,
            tagColor: tag.color,
          })
          .from(documentTag)
          .innerJoin(tag, eq(documentTag.tagId, tag.id))
          .where(inArray(documentTag.documentId, docIds))
      : []

  const tagsByDoc = new Map<
    string,
    { id: string; name: string; color: string | null }[]
  >()
  for (const r of tagRows) {
    const list = tagsByDoc.get(r.documentId) ?? []
    list.push({ id: r.tagId, name: r.tagName, color: r.tagColor })
    tagsByDoc.set(r.documentId, list)
  }

  const results = rows.map((r) => ({
    ...r,
    tags: tagsByDoc.get(r.id) ?? [],
  }))

  return new Response(
    JSON.stringify({
      results,
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    },
  )
}

async function handleSemanticSearch(
  query: string,
  pagination: PaginationParams,
  filterParams: FilterParams,
) {
  let queryVector: number[]
  try {
    const embeddings = await generateEmbedding(query)
    queryVector = embeddings[0]
  } catch {
    return new Response(
      JSON.stringify({
        error: 'Semantische Suche nicht verfügbar (Ollama nicht erreichbar)',
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  const vectorLiteral = `[${queryVector.join(',')}]`

  // Build filter conditions
  const filterConditions: SQL[] = [isNotNull(document.embedding)]

  if (filterParams.folderIds.length > 0) {
    filterConditions.push(inArray(document.folderId, filterParams.folderIds))
  }

  if (filterParams.tagIds.length > 0) {
    const docIdsWithTags = db
      .select({ documentId: documentTag.documentId })
      .from(documentTag)
      .where(inArray(documentTag.tagId, filterParams.tagIds))
    filterConditions.push(inArray(document.id, docIdsWithTags))
  }

  if (filterParams.statuses.length > 0) {
    filterConditions.push(
      inArray(
        sql`coalesce(${processingJob.status}, 'pending')`,
        filterParams.statuses,
      ),
    )
  }

  // Subquery for latest processing job per document
  const latestJobPerDoc = db
    .select({
      documentId: processingJob.documentId,
      maxCreatedAt: sql<Date>`max(${processingJob.createdAt})`.as(
        'max_created_at',
      ),
    })
    .from(processingJob)
    .groupBy(processingJob.documentId)
    .as('latest_job')

  const sortColumnMap = {
    name: document.name,
    fileSize: document.fileSize,
    createdAt: document.createdAt,
  }

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(document)
    .leftJoin(folder, eq(document.folderId, folder.id))
    .leftJoin(latestJobPerDoc, eq(document.id, latestJobPerDoc.documentId))
    .leftJoin(
      processingJob,
      sql`${processingJob.documentId} = ${latestJobPerDoc.documentId} AND ${processingJob.createdAt} = ${latestJobPerDoc.maxCreatedAt}`,
    )
    .where(and(...filterConditions))
  const total = Number(countResult[0]?.count ?? 0)

  const rows = await db
    .select({
      id: document.id,
      name: document.name,
      mimeType: document.mimeType,
      fileSize: document.fileSize,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      folderName: folder.name,
      similarity:
        sql<number>`1 - (${document.embedding} <=> ${vectorLiteral}::vector)`.as(
          'similarity',
        ),
      processingStatus: processingJob.status,
      processingStep: processingJob.step,
      processingError: processingJob.errorMessage,
    })
    .from(document)
    .leftJoin(folder, eq(document.folderId, folder.id))
    .leftJoin(latestJobPerDoc, eq(document.id, latestJobPerDoc.documentId))
    .leftJoin(
      processingJob,
      sql`${processingJob.documentId} = ${latestJobPerDoc.documentId} AND ${processingJob.createdAt} = ${latestJobPerDoc.maxCreatedAt}`,
    )
    .where(and(...filterConditions))
    .orderBy(
      pagination.sortColumn
        ? pagination.sortOrder === 'asc'
          ? asc(sortColumnMap[pagination.sortColumn])
          : desc(sortColumnMap[pagination.sortColumn])
        : sql`${document.embedding} <=> ${vectorLiteral}::vector`,
    )
    .limit(pagination.pageSize)
    .offset(pagination.offset)

  // Fetch tags for result documents
  const docIds = rows.map((r) => r.id)
  const tagRows =
    docIds.length > 0
      ? await db
          .select({
            documentId: documentTag.documentId,
            tagId: tag.id,
            tagName: tag.name,
            tagColor: tag.color,
          })
          .from(documentTag)
          .innerJoin(tag, eq(documentTag.tagId, tag.id))
          .where(inArray(documentTag.documentId, docIds))
      : []

  const tagsByDoc = new Map<
    string,
    { id: string; name: string; color: string | null }[]
  >()
  for (const r of tagRows) {
    const list = tagsByDoc.get(r.documentId) ?? []
    list.push({ id: r.tagId, name: r.tagName, color: r.tagColor })
    tagsByDoc.set(r.documentId, list)
  }

  const results = rows.map((r) => ({
    ...r,
    tags: tagsByDoc.get(r.id) ?? [],
  }))

  return new Response(
    JSON.stringify({
      results,
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    },
  )
}
