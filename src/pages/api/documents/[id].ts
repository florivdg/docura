import { ApiValidationError } from '@/lib/api-validation-error'
import type { APIRoute } from 'astro'
import {
  validateDocumentPatch,
  documentPatchUpdates,
  type DocumentPatch,
} from '@/lib/document-patch'
import { jsonResponse } from '@/lib/json-response'
import { db } from '@/db'
import {
  correspondent,
  document,
  processingJob,
  documentTag,
  tag,
  folder,
} from '@/db/schema/documents'
import { eq, desc, inArray } from 'drizzle-orm'
import { unlink } from 'node:fs/promises'
import {
  isValidUUID,
  safePath,
  parseJsonBody,
  JsonParseError,
} from '@/lib/api-utils'

async function loadCorrespondent(
  correspondentId: string | null,
): Promise<{ id: string; name: string } | null> {
  if (!correspondentId) return null

  const rows = await db
    .select({ id: correspondent.id, name: correspondent.name })
    .from(correspondent)
    .where(eq(correspondent.id, correspondentId))
    .limit(1)

  return rows[0] ?? null
}

type DocumentRow = typeof document.$inferSelect

/** Lädt Ordner, Korrespondent, Tags und Jobs eines Dokuments parallel. */
async function loadDocumentRelations(doc: DocumentRow) {
  const [docFolder, docCorrespondent, tags, processingJobs] = await Promise.all(
    [
      doc.folderId
        ? db
            .select({ id: folder.id, name: folder.name })
            .from(folder)
            .where(eq(folder.id, doc.folderId))
            .limit(1)
            .then((rows) => rows[0] ?? null)
        : null,
      loadCorrespondent(doc.correspondentId),
      db
        .select({ id: tag.id, name: tag.name, color: tag.color })
        .from(documentTag)
        .innerJoin(tag, eq(documentTag.tagId, tag.id))
        .where(eq(documentTag.documentId, doc.id)),
      db
        .select({
          id: processingJob.id,
          status: processingJob.status,
          step: processingJob.step,
          errorMessage: processingJob.errorMessage,
          attempts: processingJob.attempts,
          startedAt: processingJob.startedAt,
          completedAt: processingJob.completedAt,
          createdAt: processingJob.createdAt,
        })
        .from(processingJob)
        .where(eq(processingJob.documentId, doc.id))
        .orderBy(desc(processingJob.createdAt)),
    ],
  )

  return {
    folder: docFolder,
    correspondent: docCorrespondent,
    tags,
    processingJobs,
  }
}

async function documentResponse(doc: DocumentRow): Promise<Response> {
  const relations = await loadDocumentRelations(doc)

  return jsonResponse({
    document: {
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
      folder: relations.folder,
      correspondent: relations.correspondent,
      tags: relations.tags,
      processingJobs: relations.processingJobs,
    },
  })
}

export const GET: APIRoute = async ({ params }) => {
  const { id } = params

  if (!id || !isValidUUID(id)) {
    return jsonResponse({ error: 'Ungültige Dokument-ID' }, 400)
  }

  const [doc] = await db
    .select()
    .from(document)
    .where(eq(document.id, id))
    .limit(1)

  if (!doc) {
    return jsonResponse({ error: 'Dokument nicht gefunden' }, 404)
  }

  return documentResponse(doc)
}

export const DELETE: APIRoute = async ({ params, url }) => {
  const { id } = params
  const permanent = url.searchParams.get('permanent') === 'true'

  if (!id || !isValidUUID(id)) {
    return jsonResponse({ error: 'Ungültige Dokument-ID' }, 400)
  }

  const [doc] = await db
    .select({
      id: document.id,
      storagePath: document.storagePath,
      trashedAt: document.trashedAt,
    })
    .from(document)
    .where(eq(document.id, id))
    .limit(1)

  if (!doc) {
    return jsonResponse({ error: 'Dokument nicht gefunden' }, 404)
  }

  if (permanent) {
    if (!doc.trashedAt) {
      return jsonResponse(
        {
          error: 'Endgültiges Löschen nur für Dokumente im Papierkorb erlaubt',
        },
        400,
      )
    }

    const uploadDir = process.env.UPLOAD_DIR || './uploads'
    try {
      const filePath = safePath(uploadDir, doc.storagePath)
      await unlink(filePath)
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err
    }

    await db.delete(document).where(eq(document.id, id))

    return jsonResponse({ success: true })
  }

  // Guard: don't re-trash already-trashed documents
  if (doc.trashedAt) {
    return jsonResponse(
      {
        error: 'Dokument befindet sich bereits im Papierkorb',
      },
      409,
    )
  }

  // Soft delete: set trashedAt
  await db
    .update(document)
    .set({ trashedAt: new Date() })
    .where(eq(document.id, id))

  return jsonResponse({ success: true })
}

export const PATCH: APIRoute = async ({ params, request }) => {
  const { id } = params

  if (!id || !isValidUUID(id)) {
    return jsonResponse({ error: 'Ungültige Dokument-ID' }, 400)
  }

  const [doc] = await db
    .select({ id: document.id })
    .from(document)
    .where(eq(document.id, id))
    .limit(1)

  if (!doc) {
    return jsonResponse({ error: 'Dokument nicht gefunden' }, 404)
  }

  let body: DocumentPatch
  try {
    body = await validateDocumentPatch(
      await parseJsonBody<unknown>(request),
      referenceExists,
      countExistingTags,
    )
  } catch (err) {
    if (err instanceof JsonParseError)
      return jsonResponse({ error: err.message }, 400)
    if (err instanceof ApiValidationError)
      return jsonResponse({ error: err.message }, err.status)
    throw err
  }
  const { tagIds } = body
  const updates = documentPatchUpdates(body)

  await db.transaction(async (tx) => {
    if (Object.keys(updates).length > 0) {
      await tx.update(document).set(updates).where(eq(document.id, id))
    }

    if ('tagIds' in body && Array.isArray(tagIds)) {
      await tx.delete(documentTag).where(eq(documentTag.documentId, id))

      if (tagIds.length > 0) {
        await tx
          .insert(documentTag)
          .values(tagIds.map((tagId) => ({ documentId: id, tagId })))
      }
    }
  })

  // Return updated document in same shape as GET
  const [updated] = await db
    .select()
    .from(document)
    .where(eq(document.id, id))
    .limit(1)

  return documentResponse(updated)
}

async function referenceExists(
  kind: 'folder' | 'correspondent',
  id: string,
): Promise<boolean> {
  const table = kind === 'folder' ? folder : correspondent
  const rows = await db
    .select({ id: table.id })
    .from(table)
    .where(eq(table.id, id))
    .limit(1)
  return rows.length > 0
}

async function countExistingTags(ids: string[]): Promise<number> {
  const rows = await db
    .select({ id: tag.id })
    .from(tag)
    .where(inArray(tag.id, ids))
  return rows.length
}
