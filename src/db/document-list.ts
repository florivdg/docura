import type { DocumentPagination } from '@/lib/document-filters'
import { and, inArray, eq, or, sql, asc, desc, type SQL } from 'drizzle-orm'
import type { PgSelect } from 'drizzle-orm/pg-core'
import { db } from '@/db'
import {
  document,
  folder,
  correspondent,
  documentTag,
  tag,
  processingJob,
} from '@/db/schema/documents'
import { fulltextExpressions } from '@/db/fulltext-expressions'
import { isLatestJob, latestJobPerDoc, viewConditions } from '@/db/queries'
import type { DocumentFilters } from '@/lib/document-filters'

function buildFilterConditions(filterParams: DocumentFilters): SQL[] {
  const conditions: SQL[] = [...viewConditions(filterParams.view)]

  if (filterParams.folderIds.length > 0) {
    conditions.push(inArray(document.folderId, filterParams.folderIds))
  }

  if (filterParams.correspondentIds.length > 0) {
    conditions.push(
      inArray(document.correspondentId, filterParams.correspondentIds),
    )
  }

  if (filterParams.tagIds.length > 0) {
    const docIdsWithTags = db
      .select({ documentId: documentTag.documentId })
      .from(documentTag)
      .where(inArray(documentTag.tagId, filterParams.tagIds))
    conditions.push(inArray(document.id, docIdsWithTags))
  }

  if (filterParams.statuses.length > 0) {
    conditions.push(
      inArray(
        sql`coalesce(${processingJob.status}, 'pending')`,
        filterParams.statuses,
      ),
    )
  }

  return conditions
}

/**
 * What the document list shows: the view, the filters and an optional
 * full-text query. The status filter needs `withLatestJob`.
 */
export function documentListCondition(
  filters: DocumentFilters,
  query = '',
): SQL | undefined {
  const conditions = buildFilterConditions(filters)
  if (query)
    conditions.push(or(...fulltextExpressions(query).searchConditions)!)
  return and(...conditions)
}

/** Only the status filter reads the latest job; skip the join otherwise. */
export function filtersByStatus(filters: DocumentFilters): boolean {
  return filters.statuses.length > 0
}

/** Left-joins each document's latest processing job (status column and filter). */
export function withLatestJob<T extends PgSelect>(query: T) {
  const latestJob = latestJobPerDoc()
  return query
    .leftJoin(latestJob, eq(document.id, latestJob.documentId))
    .leftJoin(processingJob, isLatestJob(latestJob))
}

export async function loadTagsForDocuments(
  docIds: string[],
): Promise<Map<string, { id: string; name: string; color: string | null }[]>> {
  const tagsByDoc = new Map<
    string,
    { id: string; name: string; color: string | null }[]
  >()

  if (docIds.length === 0) return tagsByDoc

  const tagRows = await db
    .select({
      documentId: documentTag.documentId,
      tagId: tag.id,
      tagName: tag.name,
      tagColor: tag.color,
    })
    .from(documentTag)
    .innerJoin(tag, eq(documentTag.tagId, tag.id))
    .where(inArray(documentTag.documentId, docIds))

  for (const r of tagRows) {
    const list = tagsByDoc.get(r.documentId) ?? []
    list.push({ id: r.tagId, name: r.tagName, color: r.tagColor })
    tagsByDoc.set(r.documentId, list)
  }

  return tagsByDoc
}

const documentListFields = {
  id: document.id,
  name: document.name,
  mimeType: document.mimeType,
  fileSize: document.fileSize,
  createdAt: document.createdAt,
  updatedAt: document.updatedAt,
  documentDate: document.documentDate,
  folderName: folder.name,
  correspondentName: correspondent.name,
  processingStatus: processingJob.status,
  processingStep: processingJob.step,
  processingError: processingJob.errorMessage,
  isFavorite: document.isFavorite,
  archivedAt: document.archivedAt,
  trashedAt: document.trashedAt,
}

export function documentRowsQuery(extra: Record<string, SQL.Aliased>) {
  return withLatestJob(
    db
      .select({ ...extra, ...documentListFields })
      .from(document)
      .leftJoin(folder, eq(document.folderId, folder.id))
      .leftJoin(correspondent, eq(document.correspondentId, correspondent.id))
      .$dynamic(),
  )
}

export async function countDocuments(
  whereClause: SQL | undefined,
  filters: DocumentFilters,
): Promise<number> {
  const query = db
    .select({ count: sql<number>`count(*)` })
    .from(document)
    .$dynamic()
  const rows = await (
    filtersByStatus(filters) ? withLatestJob(query) : query
  ).where(whereClause)
  return Number(rows[0]?.count ?? 0)
}

export function documentSort(
  pagination: DocumentPagination,
  fallback: SQL,
): SQL {
  if (!pagination.sortColumn) return fallback
  const column = document[pagination.sortColumn]
  return pagination.sortOrder === 'asc' ? asc(column) : desc(column)
}
