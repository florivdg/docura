import type { APIRoute } from 'astro'
import { db, type Transaction } from '@/db'
import { withActivity } from '@/db/activity'
import { enqueueReprocessing } from '@/db/processing-jobs'
import { countExistingTags, referenceExists } from '@/db/reference-validation'
import { document, documentTag } from '@/db/schema/documents'
import { and, inArray, isNull, isNotNull } from 'drizzle-orm'
import { parseJsonBody } from '@/lib/api-utils'
import { withApiErrors } from '@/lib/api-errors'
import { ApiValidationError } from '@/lib/api-validation-error'
import {
  validateBulkDocumentRequest,
  bulkDocumentUpdates,
  type BulkDocumentRequest,
} from '@/lib/document-bulk'
import { jsonResponse } from '@/lib/json-response'
import type { ActivityActor } from '@/lib/activity'
import { actorFromLocals } from '@/lib/server/activity-actor'

async function validateReferences(request: BulkDocumentRequest): Promise<void> {
  if (
    request.action === 'move' &&
    request.folderId &&
    !(await referenceExists('folder', request.folderId))
  )
    throw new ApiValidationError('Ordner nicht gefunden', 404)
  if (
    request.action === 'addTags' &&
    (await countExistingTags(request.tagIds)) !== request.tagIds.length
  )
    throw new ApiValidationError('Ein oder mehrere Tags nicht gefunden', 404)
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

/** Trashed and running documents are skipped and reported, not rejected. */
async function reprocess(
  ids: string[],
  actor: ActivityActor,
): Promise<Response> {
  const { queued, skipped } = await enqueueReprocessing(ids, 'full', actor)
  return jsonResponse({
    success: true,
    count: ids.length,
    queued: queued.map((job) => job.id),
    skipped,
  })
}

/** One entry per changed document, all in one batch. */
export const POST: APIRoute = ({ request, locals }) =>
  withApiErrors(async () => {
    const body = validateBulkDocumentRequest(
      await parseJsonBody<unknown>(request),
    )
    await validateReferences(body)
    const actor = actorFromLocals(locals)
    if (body.action === 'reprocess') return reprocess(body.ids, actor)
    await db.transaction((tx) =>
      withActivity(tx, body.ids, actor, () => applyBulkAction(tx, body)),
    )
    return jsonResponse({ success: true, count: body.ids.length })
  })
