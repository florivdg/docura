import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db, type Transaction } from '@/db'
import { withActivity } from '@/db/activity'
import { activeDocumentConditions } from '@/db/queries'
import { correspondent, document } from '@/db/schema/documents'
import type { ActivityActor } from '@/lib/activity'
import { ApiValidationError } from '@/lib/api-validation-error'
import type { CorrespondentMergeRequest } from '@/lib/correspondent-validation'
import { isUniqueViolation } from '@/lib/db-errors'

export type CorrespondentRecord = { id: string; name: string }

const RECORD_FIELDS = { id: correspondent.id, name: correspondent.name }

const NAME_CONFLICT =
  'Ein Korrespondent mit diesem Namen existiert bereits. Verwenden Sie „Zusammenführen“, um beide zu vereinen.'

function notFound(): ApiValidationError {
  return new ApiValidationError('Korrespondent nicht gefunden', 404)
}

/** All correspondents by name; the lean shape the document pages need. */
export function listCorrespondents(): Promise<CorrespondentRecord[]> {
  return db
    .select(RECORD_FIELDS)
    .from(correspondent)
    .orderBy(asc(correspondent.name))
}

/**
 * All correspondents by name for the admin page. `documentCount` counts the
 * active documents (neither trashed nor archived), i.e. exactly what the
 * document list shows when filtered by that correspondent.
 */
export function listCorrespondentsWithCounts() {
  return db
    .select({
      ...RECORD_FIELDS,
      createdAt: correspondent.createdAt,
      documentCount: sql<number>`count(${document.id})::int`,
    })
    .from(correspondent)
    .leftJoin(
      document,
      and(
        eq(document.correspondentId, correspondent.id),
        ...activeDocumentConditions(),
      ),
    )
    .groupBy(correspondent.id)
    .orderBy(asc(correspondent.name))
}

async function findByLowerName(
  lowerName: string,
): Promise<CorrespondentRecord | null> {
  const [row] = await db
    .select(RECORD_FIELDS)
    .from(correspondent)
    .where(sql`lower(${correspondent.name}) = ${lowerName}`)
    .limit(1)
  return row ?? null
}

/**
 * Case-insensitive find-or-create. Loses the unique-index race gracefully by
 * re-reading the winner's row; other DB errors propagate to the caller.
 */
export async function findOrCreateCorrespondent(
  name: string,
): Promise<{ correspondent: CorrespondentRecord; created: boolean }> {
  const trimmed = name.trim()
  const lowerName = trimmed.toLowerCase()

  const existing = await findByLowerName(lowerName)
  if (existing) return { correspondent: existing, created: false }

  try {
    const [created] = await db
      .insert(correspondent)
      .values({ name: trimmed })
      .returning(RECORD_FIELDS)
    return { correspondent: created, created: true }
  } catch (err) {
    if (!isUniqueViolation(err)) throw err
    const winner = await findByLowerName(lowerName)
    // The concurrent winner was deleted again before we could read it.
    if (!winner)
      throw new Error(`Korrespondent „${trimmed}“ konnte nicht erstellt werden`)
    return { correspondent: winner, created: false }
  }
}

/** Renames; the case-insensitive unique index turns duplicates into a 409. */
export async function renameCorrespondent(
  id: string,
  name: string,
): Promise<CorrespondentRecord> {
  try {
    const [updated] = await db
      .update(correspondent)
      .set({ name })
      .where(eq(correspondent.id, id))
      .returning(RECORD_FIELDS)
    if (!updated) throw notFound()
    return updated
  } catch (err) {
    if (isUniqueViolation(err)) throw new ApiValidationError(NAME_CONFLICT, 409)
    throw err
  }
}

/** Deletes; documents keep existing and lose the reference (ON DELETE SET NULL). */
export async function deleteCorrespondent(id: string): Promise<void> {
  const deleted = await db
    .delete(correspondent)
    .where(eq(correspondent.id, id))
    .returning({ id: correspondent.id })
  if (!deleted.length) throw notFound()
}

async function lockMergeParties(
  tx: Transaction,
  { targetId, sourceIds }: CorrespondentMergeRequest,
) {
  const sources = await tx
    .select({ id: correspondent.id })
    .from(correspondent)
    .where(inArray(correspondent.id, sourceIds))
    .orderBy(asc(correspondent.id))
    .for('update')
  const [target] = await tx
    .select(RECORD_FIELDS)
    .from(correspondent)
    .where(eq(correspondent.id, targetId))
    .for('key share')
  if (!target || sources.length !== sourceIds.length)
    throw new ApiValidationError(
      'Ein oder mehrere Korrespondenten nicht gefunden',
      404,
    )
  return target
}

/** The documents of the sources; `withActivity` locks them afterwards. */
async function documentsOf(tx: Transaction, sourceIds: string[]) {
  const rows = await tx
    .select({ id: document.id })
    .from(document)
    .where(inArray(document.correspondentId, sourceIds))
  return rows.map((row) => row.id)
}

/**
 * Moves every document of the sources onto the target (trashed and archived
 * ones included) and deletes the sources, all in one transaction; every
 * moved document gets an `updated` entry in the audit trail.
 *
 * The sources are locked FOR UPDATE in id order, so concurrent merges with
 * overlapping sources acquire those locks in the same order. The target is
 * locked afterwards and only FOR KEY SHARE: it is neither updated nor deleted,
 * and a stronger lock would conflict with the key-share locks that concurrent
 * document updates take on their FK target. Merges whose target is another
 * merge's source can still deadlock; Postgres aborts one of them, which then
 * surfaces as a failed request. Assigning a document to a locked source
 * waits for the merge, so the documents read up front stay complete.
 */
export function mergeCorrespondents(
  request: CorrespondentMergeRequest,
  actor: ActivityActor,
): Promise<{
  correspondent: CorrespondentRecord
  movedDocuments: number
}> {
  const { sourceIds } = request
  return db.transaction(async (tx) => {
    const target = await lockMergeParties(tx, request)
    const ids = await documentsOf(tx, sourceIds)
    const moved = await withActivity(tx, ids, actor, () =>
      tx
        .update(document)
        .set({ correspondentId: target.id })
        .where(inArray(document.correspondentId, sourceIds))
        .returning({ id: document.id }),
    )
    await tx.delete(correspondent).where(inArray(correspondent.id, sourceIds))
    return { correspondent: target, movedDocuments: moved.length }
  })
}
