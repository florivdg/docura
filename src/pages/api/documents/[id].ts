import type { APIRoute } from 'astro'
import { db } from '@/db'
import {
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

export const GET: APIRoute = async ({ params }) => {
  const { id } = params

  if (!id || !isValidUUID(id)) {
    return new Response(JSON.stringify({ error: 'Ungültige Dokument-ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const [doc] = await db
    .select()
    .from(document)
    .where(eq(document.id, id))
    .limit(1)

  if (!doc) {
    return new Response(JSON.stringify({ error: 'Dokument nicht gefunden' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const docFolder = doc.folderId
    ? ((
        await db
          .select({ id: folder.id, name: folder.name })
          .from(folder)
          .where(eq(folder.id, doc.folderId))
          .limit(1)
      )[0] ?? null)
    : null

  const tags = await db
    .select({ id: tag.id, name: tag.name, color: tag.color })
    .from(documentTag)
    .innerJoin(tag, eq(documentTag.tagId, tag.id))
    .where(eq(documentTag.documentId, id))

  const processingJobs = await db
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
    .where(eq(processingJob.documentId, id))
    .orderBy(desc(processingJob.createdAt))

  return new Response(
    JSON.stringify({
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
        textContent: doc.textContent,
        folder: docFolder,
        tags,
        processingJobs,
      },
    }),
    { headers: { 'Content-Type': 'application/json' } },
  )
}

export const DELETE: APIRoute = async ({ params, url }) => {
  const { id } = params
  const permanent = url.searchParams.get('permanent') === 'true'

  if (!id || !isValidUUID(id)) {
    return new Response(JSON.stringify({ error: 'Ungültige Dokument-ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
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
    return new Response(JSON.stringify({ error: 'Dokument nicht gefunden' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (permanent) {
    if (!doc.trashedAt) {
      return new Response(
        JSON.stringify({
          error: 'Endgültiges Löschen nur für Dokumente im Papierkorb erlaubt',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
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

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Guard: don't re-trash already-trashed documents
  if (doc.trashedAt) {
    return new Response(
      JSON.stringify({
        error: 'Dokument befindet sich bereits im Papierkorb',
      }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // Soft delete: set trashedAt
  await db
    .update(document)
    .set({ trashedAt: new Date() })
    .where(eq(document.id, id))

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

export const PATCH: APIRoute = async ({ params, request }) => {
  const { id } = params

  if (!id || !isValidUUID(id)) {
    return new Response(JSON.stringify({ error: 'Ungültige Dokument-ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const [doc] = await db
    .select({ id: document.id })
    .from(document)
    .where(eq(document.id, id))
    .limit(1)

  if (!doc) {
    return new Response(JSON.stringify({ error: 'Dokument nicht gefunden' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let body: {
    folderId?: string | null
    tagIds?: string[]
    name?: string
    isFavorite?: boolean
    trashedAt?: string | null
    archivedAt?: string | null
  }
  try {
    body = await parseJsonBody<typeof body>(request)
  } catch (err) {
    if (err instanceof JsonParseError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    throw err
  }
  const { folderId, tagIds } = body

  if ('folderId' in body) {
    if (folderId !== null && folderId !== undefined) {
      if (!isValidUUID(folderId)) {
        return new Response(JSON.stringify({ error: 'Ungültige Ordner-ID' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      const [f] = await db
        .select({ id: folder.id })
        .from(folder)
        .where(eq(folder.id, folderId))
        .limit(1)

      if (!f) {
        return new Response(
          JSON.stringify({ error: 'Ordner nicht gefunden' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        )
      }
    }
  }

  if ('name' in body) {
    if (
      typeof body.name !== 'string' ||
      body.name.trim().length < 1 ||
      body.name.trim().length > 200
    ) {
      return new Response(
        JSON.stringify({
          error: 'Name muss ein nicht-leerer Text sein (maximal 200 Zeichen)',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }
  }

  if ('tagIds' in body) {
    if (!Array.isArray(tagIds)) {
      return new Response(
        JSON.stringify({ error: 'tagIds muss ein Array sein' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    if (tagIds.some((t) => !isValidUUID(t))) {
      return new Response(JSON.stringify({ error: 'Ungültige Tag-ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (tagIds.length > 0) {
      const existingTags = await db
        .select({ id: tag.id })
        .from(tag)
        .where(inArray(tag.id, tagIds))

      if (existingTags.length !== tagIds.length) {
        return new Response(
          JSON.stringify({ error: 'Ein oder mehrere Tags nicht gefunden' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        )
      }
    }
  }

  if ('isFavorite' in body && typeof body.isFavorite !== 'boolean') {
    return new Response(
      JSON.stringify({ error: 'isFavorite muss ein Boolean sein' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const updates: Record<string, unknown> = {}
  if ('name' in body) updates.name = body.name!.trim()
  if ('folderId' in body) updates.folderId = folderId ?? null
  if ('isFavorite' in body) updates.isFavorite = body.isFavorite!
  if ('trashedAt' in body)
    updates.trashedAt = body.trashedAt === null ? null : new Date()
  if ('archivedAt' in body)
    updates.archivedAt = body.archivedAt === null ? null : new Date()

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

  const docFolder = updated.folderId
    ? ((
        await db
          .select({ id: folder.id, name: folder.name })
          .from(folder)
          .where(eq(folder.id, updated.folderId))
          .limit(1)
      )[0] ?? null)
    : null

  const updatedTags = await db
    .select({ id: tag.id, name: tag.name, color: tag.color })
    .from(documentTag)
    .innerJoin(tag, eq(documentTag.tagId, tag.id))
    .where(eq(documentTag.documentId, id))

  const processingJobs = await db
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
    .where(eq(processingJob.documentId, id))
    .orderBy(desc(processingJob.createdAt))

  return new Response(
    JSON.stringify({
      document: {
        id: updated.id,
        name: updated.name,
        mimeType: updated.mimeType,
        fileSize: updated.fileSize,
        isFavorite: updated.isFavorite,
        archivedAt: updated.archivedAt,
        trashedAt: updated.trashedAt,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
        textContent: updated.textContent,
        folder: docFolder,
        tags: updatedTags,
        processingJobs,
      },
    }),
    { headers: { 'Content-Type': 'application/json' } },
  )
}
