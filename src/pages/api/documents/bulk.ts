import type { APIRoute } from 'astro'
import { db } from '@/db'
import { document, documentTag, folder, tag } from '@/db/schema/documents'
import { and, eq, inArray, isNull, isNotNull } from 'drizzle-orm'
import { parseJsonBody, JsonParseError } from '@/lib/api-utils'
import { ApiValidationError } from '@/lib/api-validation-error'
import {
  validateBulkDocumentRequest,
  bulkDocumentUpdates,
  type BulkDocumentRequest,
} from '@/lib/document-bulk'
import { jsonResponse } from '@/lib/json-response'

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
async function validateReferences(request: BulkDocumentRequest): Promise<void> {
  if (request.action === 'move' && request.folderId) {
    const rows = await db
      .select({ id: folder.id })
      .from(folder)
      .where(eq(folder.id, request.folderId))
      .limit(1)
    if (!rows.length) throw new ApiValidationError('Ordner nicht gefunden', 404)
  }
  if (request.action === 'addTags') {
    const rows = await db
      .select({ id: tag.id })
      .from(tag)
      .where(inArray(tag.id, request.tagIds))
    if (rows.length !== request.tagIds.length)
      throw new ApiValidationError('Ein oder mehrere Tags nicht gefunden', 404)
  }
  const docs = await db
    .select({ id: document.id })
    .from(document)
    .where(inArray(document.id, request.ids))
  if (docs.length !== request.ids.length)
    throw new ApiValidationError(
      'Ein oder mehrere Dokumente nicht gefunden',
      404,
    )
}

async function applyBulkAction(
  tx: Transaction,
  request: BulkDocumentRequest,
): Promise<void> {
  if (request.action === 'addTags') {
    const links = request.ids.flatMap((documentId) =>
      request.tagIds.map((tagId) => ({ documentId, tagId })),
    )
    await tx.insert(documentTag).values(links).onConflictDoNothing()
    return
  }
  const conditions = [inArray(document.id, request.ids)]
  if (request.action === 'trash') conditions.push(isNull(document.trashedAt))
  if (request.action === 'restore')
    conditions.push(isNotNull(document.trashedAt))
  await tx
    .update(document)
    .set(bulkDocumentUpdates(request))
    .where(and(...conditions))
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = validateBulkDocumentRequest(
      await parseJsonBody<unknown>(request),
    )
    await validateReferences(body)
    await db.transaction((tx) => applyBulkAction(tx, body))
    return jsonResponse({ success: true, count: body.ids.length })
  } catch (err) {
    if (err instanceof JsonParseError)
      return jsonResponse({ error: err.message }, 400)
    if (err instanceof ApiValidationError)
      return jsonResponse({ error: err.message }, err.status)
    throw err
  }
}
