import type { APIRoute } from 'astro'
import type { SQL } from 'drizzle-orm'
import { db } from '@/db'
import {
  document,
  documentTag,
  folder,
  processingJob,
  tag,
} from '@/db/schema/documents'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { isValidUUID, VALID_STATUSES } from '@/lib/api-utils'
import { latestJobPerDoc } from '@/db/queries'

export const GET: APIRoute = async ({ url }) => {
  const folderIds =
    url.searchParams.get('folderIds')?.split(',').filter(Boolean) ?? []
  const tagIds =
    url.searchParams.get('tagIds')?.split(',').filter(Boolean) ?? []
  const statuses =
    url.searchParams.get('status')?.split(',').filter(Boolean) ?? []

  if (folderIds.some((id) => !isValidUUID(id))) {
    return new Response(
      JSON.stringify({ error: 'Ungültige Ordner-ID in Filter' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  if (tagIds.some((id) => !isValidUUID(id))) {
    return new Response(
      JSON.stringify({ error: 'Ungültige Tag-ID in Filter' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  if (statuses.some((s) => !VALID_STATUSES.has(s))) {
    return new Response(
      JSON.stringify({ error: 'Ungültiger Status in Filter' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const SORT_COLUMNS = ['name', 'fileSize', 'createdAt'] as const
  type SortColumn = (typeof SORT_COLUMNS)[number]
  const PAGE_SIZES = [20, 50, 100] as const

  const sortParam = url.searchParams.get('sort')
  const orderParam = url.searchParams.get('order') ?? 'desc'
  const pageParam = Math.max(
    parseInt(url.searchParams.get('page') ?? '1', 10),
    1,
  )
  const sizeParam = parseInt(url.searchParams.get('size') ?? '20', 10)

  const sortColumn: SortColumn =
    sortParam && SORT_COLUMNS.includes(sortParam as SortColumn)
      ? (sortParam as SortColumn)
      : 'createdAt'
  const sortOrder = orderParam === 'asc' ? 'asc' : 'desc'
  const pageSize = PAGE_SIZES.includes(sizeParam as (typeof PAGE_SIZES)[number])
    ? sizeParam
    : 20
  const offset = (pageParam - 1) * pageSize

  const conditions: SQL[] = []

  if (folderIds.length > 0) {
    conditions.push(inArray(document.folderId, folderIds))
  }

  if (tagIds.length > 0) {
    const docIdsWithTags = db
      .select({ documentId: documentTag.documentId })
      .from(documentTag)
      .where(inArray(documentTag.tagId, tagIds))
    conditions.push(inArray(document.id, docIdsWithTags))
  }

  if (statuses.length > 0) {
    conditions.push(
      inArray(sql`coalesce(${processingJob.status}, 'pending')`, statuses),
    )
  }
  const latestJob = latestJobPerDoc()

  const sortColumnMap = {
    name: document.name,
    fileSize: document.fileSize,
    createdAt: document.createdAt,
  }
  const orderByExpr =
    sortOrder === 'asc'
      ? asc(sortColumnMap[sortColumn])
      : desc(sortColumnMap[sortColumn])

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(document)
    .leftJoin(latestJob, eq(document.id, latestJob.documentId))
    .leftJoin(
      processingJob,
      sql`${processingJob.documentId} = ${latestJob.documentId} AND ${processingJob.createdAt} = ${latestJob.maxCreatedAt}`,
    )
    .where(conditions.length > 0 ? and(...conditions) : undefined)
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
      processingStatus: processingJob.status,
      processingStep: processingJob.step,
      processingError: processingJob.errorMessage,
    })
    .from(document)
    .leftJoin(folder, eq(document.folderId, folder.id))
    .leftJoin(latestJob, eq(document.id, latestJob.documentId))
    .leftJoin(
      processingJob,
      sql`${processingJob.documentId} = ${latestJob.documentId} AND ${processingJob.createdAt} = ${latestJob.maxCreatedAt}`,
    )
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(orderByExpr)
    .limit(pageSize)
    .offset(offset)

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

  const documents = rows.map((r) => ({
    ...r,
    tags: tagsByDoc.get(r.id) ?? [],
  }))

  return new Response(
    JSON.stringify({ documents, total, page: pageParam, pageSize }),
    {
      headers: { 'Content-Type': 'application/json' },
    },
  )
}
