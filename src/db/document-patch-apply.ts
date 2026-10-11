import { and, eq, isNull } from 'drizzle-orm'

import { db, type Transaction } from '@/db'
import { withActivity } from '@/db/activity'
import { document, documentTag } from '@/db/schema/documents'
import type { ActivityActor } from '@/lib/activity'
import { documentPatchUpdates, type DocumentPatch } from '@/lib/document-patch'

async function replaceTags(tx: Transaction, id: string, tagIds: string[]) {
  await tx.delete(documentTag).where(eq(documentTag.documentId, id))
  if (tagIds.length > 0)
    await tx
      .insert(documentTag)
      .values(tagIds.map((tagId) => ({ documentId: id, tagId })))
}

async function writePatch(tx: Transaction, id: string, body: DocumentPatch) {
  const updates = documentPatchUpdates(body)
  if (Object.keys(updates).length > 0)
    await tx.update(document).set(updates).where(eq(document.id, id))
  if ('tagIds' in body && Array.isArray(body.tagIds))
    await replaceTags(tx, id, body.tagIds)
}

/**
 * Applies a validated PATCH and records what it changed in the same
 * transaction; several changed aspects share one batch.
 */
export function applyDocumentPatch(
  id: string,
  body: DocumentPatch,
  actor: ActivityActor,
): Promise<void> {
  return db.transaction((tx) =>
    withActivity(tx, [id], actor, () => writePatch(tx, id, body)),
  )
}

/**
 * Moves the document to the trash. A document trashed concurrently stays
 * unchanged, so only the request that trashed it records the activity.
 */
export function trashDocument(id: string, actor: ActivityActor): Promise<void> {
  return db.transaction((tx) =>
    withActivity(tx, [id], actor, async () => {
      await tx
        .update(document)
        .set({ trashedAt: new Date() })
        .where(and(eq(document.id, id), isNull(document.trashedAt)))
    }),
  )
}
