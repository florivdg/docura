import type { APIRoute } from 'astro'
import { db } from '@/db'
import {
  document,
  documentTag,
  folder,
  processingJob,
  tag,
} from '@/db/schema/documents'
import { desc, eq, sql } from 'drizzle-orm'

export const GET: APIRoute = async () => {
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
    .leftJoin(latestJobPerDoc, eq(document.id, latestJobPerDoc.documentId))
    .leftJoin(
      processingJob,
      sql`${processingJob.documentId} = ${latestJobPerDoc.documentId} AND ${processingJob.createdAt} = ${latestJobPerDoc.maxCreatedAt}`,
    )
    .orderBy(desc(document.createdAt))

  const tagRows = await db
    .select({
      documentId: documentTag.documentId,
      tagId: tag.id,
      tagName: tag.name,
      tagColor: tag.color,
    })
    .from(documentTag)
    .innerJoin(tag, eq(documentTag.tagId, tag.id))

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

  return new Response(JSON.stringify({ documents }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
