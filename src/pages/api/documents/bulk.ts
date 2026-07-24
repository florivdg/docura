import type { APIRoute } from 'astro'
import { db } from '@/db'
import { document, documentTag, folder, tag } from '@/db/schema/documents'
import { and, eq, inArray, isNull, isNotNull } from 'drizzle-orm'
import { isValidUUID, parseJsonBody, JsonParseError } from '@/lib/api-utils'

const MAX_IDS = 100

const BULK_ACTIONS = [
  'move',
  'addTags',
  'trash',
  'restore',
  'favorite',
  'unfavorite',
] as const

type BulkAction = (typeof BULK_ACTIONS)[number]

interface BulkBody {
  ids?: unknown
  action?: unknown
  folderId?: string | null
  tagIds?: unknown
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const POST: APIRoute = async ({ request }) => {
  let body: BulkBody
  try {
    body = await parseJsonBody<BulkBody>(request)
  } catch (err) {
    if (err instanceof JsonParseError) {
      return jsonError(err.message, 400)
    }
    throw err
  }

  const { ids, action } = body

  if (!Array.isArray(ids) || ids.length === 0) {
    return jsonError('ids muss ein nicht-leeres Array sein', 400)
  }

  if (ids.length > MAX_IDS) {
    return jsonError(`Zu viele Dokumente ausgewählt (maximal ${MAX_IDS})`, 400)
  }

  if (ids.some((id) => typeof id !== 'string' || !isValidUUID(id))) {
    return jsonError('Ungültige Dokument-ID', 400)
  }

  const documentIds = [...new Set(ids as string[])]

  if (
    typeof action !== 'string' ||
    !BULK_ACTIONS.includes(action as BulkAction)
  ) {
    return jsonError('Ungültige Aktion', 400)
  }

  const bulkAction = action as BulkAction

  // Action-specific payload validation
  let folderId: string | null = null
  if (bulkAction === 'move') {
    const value = body.folderId
    if (value !== null && value !== undefined) {
      if (typeof value !== 'string' || !isValidUUID(value)) {
        return jsonError('Ungültige Ordner-ID', 400)
      }

      const [f] = await db
        .select({ id: folder.id })
        .from(folder)
        .where(eq(folder.id, value))
        .limit(1)

      if (!f) {
        return jsonError('Ordner nicht gefunden', 404)
      }

      folderId = value
    }
  }

  let tagIds: string[] = []
  if (bulkAction === 'addTags') {
    const value = body.tagIds
    if (!Array.isArray(value) || value.length === 0) {
      return jsonError('tagIds muss ein nicht-leeres Array sein', 400)
    }

    if (value.some((t) => typeof t !== 'string' || !isValidUUID(t))) {
      return jsonError('Ungültige Tag-ID', 400)
    }

    tagIds = [...new Set(value as string[])]

    const existingTags = await db
      .select({ id: tag.id })
      .from(tag)
      .where(inArray(tag.id, tagIds))

    if (existingTags.length !== tagIds.length) {
      return jsonError('Ein oder mehrere Tags nicht gefunden', 404)
    }
  }

  const existingDocuments = await db
    .select({ id: document.id })
    .from(document)
    .where(inArray(document.id, documentIds))

  if (existingDocuments.length !== documentIds.length) {
    return jsonError('Ein oder mehrere Dokumente nicht gefunden', 404)
  }

  await db.transaction(async (tx) => {
    switch (bulkAction) {
      case 'move':
        await tx
          .update(document)
          .set({ folderId })
          .where(inArray(document.id, documentIds))
        break
      case 'addTags':
        await tx
          .insert(documentTag)
          .values(
            documentIds.flatMap((documentId) =>
              tagIds.map((tagId) => ({ documentId, tagId })),
            ),
          )
          .onConflictDoNothing()
        break
      case 'trash':
        await tx
          .update(document)
          .set({ trashedAt: new Date() })
          .where(
            and(inArray(document.id, documentIds), isNull(document.trashedAt)),
          )
        break
      case 'restore':
        await tx
          .update(document)
          .set({ trashedAt: null })
          .where(
            and(
              inArray(document.id, documentIds),
              isNotNull(document.trashedAt),
            ),
          )
        break
      case 'favorite':
      case 'unfavorite':
        await tx
          .update(document)
          .set({ isFavorite: bulkAction === 'favorite' })
          .where(inArray(document.id, documentIds))
        break
    }
  })

  return new Response(
    JSON.stringify({ success: true, count: documentIds.length }),
    { headers: { 'Content-Type': 'application/json' } },
  )
}
