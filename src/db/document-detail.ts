import { desc, eq } from 'drizzle-orm'

import { db } from '@/db'
import {
  correspondent,
  document,
  documentTag,
  folder,
  processingJob,
  tag,
} from '@/db/schema/documents'

type DocumentRow = typeof document.$inferSelect

/** Folder or correspondent of the document as `{ id, name }`. */
function loadNamedRef(
  table: typeof folder | typeof correspondent,
  id: string | null,
) {
  if (!id) return null
  return db
    .select({ id: table.id, name: table.name })
    .from(table)
    .where(eq(table.id, id))
    .limit(1)
    .then((rows) => rows[0] ?? null)
}

function loadTags(documentId: string) {
  return db
    .select({ id: tag.id, name: tag.name, color: tag.color })
    .from(documentTag)
    .innerJoin(tag, eq(documentTag.tagId, tag.id))
    .where(eq(documentTag.documentId, documentId))
}

function loadProcessingJobs(documentId: string) {
  return db
    .select({
      id: processingJob.id,
      status: processingJob.status,
      kind: processingJob.kind,
      step: processingJob.step,
      errorMessage: processingJob.errorMessage,
      attempts: processingJob.attempts,
      maxAttempts: processingJob.maxAttempts,
      startedAt: processingJob.startedAt,
      completedAt: processingJob.completedAt,
      createdAt: processingJob.createdAt,
    })
    .from(processingJob)
    .where(eq(processingJob.documentId, documentId))
    .orderBy(desc(processingJob.createdAt))
}

/** Whether the document exists (in any state: active, archived or trashed). */
export async function documentExists(id: string): Promise<boolean> {
  const rows = await db
    .select({ id: document.id })
    .from(document)
    .where(eq(document.id, id))
    .limit(1)
  return rows.length > 0
}

export async function findDocument(
  id: string,
): Promise<DocumentRow | undefined> {
  const [doc] = await db
    .select()
    .from(document)
    .where(eq(document.id, id))
    .limit(1)
  return doc
}

/** The detail shape of `GET /api/documents/[id]`; relations load in parallel. */
export async function loadDocumentDetail(doc: DocumentRow) {
  const [docFolder, docCorrespondent, tags, processingJobs] = await Promise.all(
    [
      loadNamedRef(folder, doc.folderId),
      loadNamedRef(correspondent, doc.correspondentId),
      loadTags(doc.id),
      loadProcessingJobs(doc.id),
    ],
  )
  return {
    id: doc.id,
    name: doc.name,
    mimeType: doc.mimeType,
    fileSize: doc.fileSize,
    isFavorite: doc.isFavorite,
    archivedAt: doc.archivedAt,
    trashedAt: doc.trashedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    documentDate: doc.documentDate,
    textContent: doc.textContent,
    folder: docFolder,
    correspondent: docCorrespondent,
    tags,
    processingJobs,
  }
}
