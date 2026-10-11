import { count, desc, eq, gte, min, sql, type SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

import { db } from '@/db'
import { documentActivity } from '@/db/schema/activity'
import { document } from '@/db/schema/documents'

/** Current name while the document exists, the snapshot after its deletion. */
const currentName = sql<string>`coalesce(${document.name}, ${documentActivity.documentName})`

const ENTRY_FIELDS = {
  id: documentActivity.id,
  documentId: documentActivity.documentId,
  documentName: currentName,
  actorType: documentActivity.actorType,
  actorId: documentActivity.actorId,
  actorName: documentActivity.actorName,
  action: documentActivity.action,
  changes: documentActivity.changes,
  batchId: documentActivity.batchId,
  createdAt: documentActivity.createdAt,
}

/** A document's history, newest first. */
export function loadDocumentActivity(
  documentId: string,
  { limit, offset }: { limit: number; offset: number },
) {
  return db
    .select(ENTRY_FIELDS)
    .from(documentActivity)
    .leftJoin(document, eq(documentActivity.documentId, document.id))
    .where(eq(documentActivity.documentId, documentId))
    .orderBy(desc(documentActivity.createdAt), desc(documentActivity.id))
    .limit(limit)
    .offset(offset)
}

export async function countDocumentActivity(
  documentId: string,
): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(documentActivity)
    .where(eq(documentActivity.documentId, documentId))
  return row?.total ?? 0
}

/**
 * The value of the batch's first row (by time, then id). Every column of the
 * representative document uses the same order, so id, name and changes
 * belong to the same row.
 */
function firstOfBatch<T>(value: SQL | AnyPgColumn) {
  return sql<T>`(array_agg(${value} order by ${documentActivity.createdAt}, ${documentActivity.id}))[1]`
}

/**
 * The oldest of the `limit` newest distinct timestamps (via the created_at
 * index). All rows of a batch share `created_at` (one transaction), so every
 * one of the `limit` newest batches lies completely at or after it.
 */
function batchCutoff(limit: number) {
  const newest = db
    .selectDistinct({ createdAt: documentActivity.createdAt })
    .from(documentActivity)
    .orderBy(desc(documentActivity.createdAt))
    .limit(limit)
    .as('newest')
  return db.select({ value: min(newest.createdAt) }).from(newest)
}

/**
 * The newest batches: one entry per request or worker call and action,
 * with the number of documents and the first one as representative. Only
 * rows from the cutoff on are aggregated, not the whole table.
 */
export async function loadActivityGroups(limit: number) {
  const latest = sql`max(${documentActivity.createdAt})`
  const rows = await db
    .select({
      batchId: documentActivity.batchId,
      action: documentActivity.action,
      actorType: documentActivity.actorType,
      actorId: documentActivity.actorId,
      actorName: documentActivity.actorName,
      createdAt: latest.mapWith(documentActivity.createdAt),
      count: sql<number>`count(*)::int`,
      documentId: firstOfBatch<string | null>(documentActivity.documentId),
      documentName: firstOfBatch<string>(currentName),
      changes: firstOfBatch(documentActivity.changes).mapWith(
        documentActivity.changes,
      ),
    })
    .from(documentActivity)
    .leftJoin(document, eq(documentActivity.documentId, document.id))
    .where(gte(documentActivity.createdAt, batchCutoff(limit)))
    .groupBy(
      documentActivity.batchId,
      documentActivity.action,
      documentActivity.actorType,
      documentActivity.actorId,
      documentActivity.actorName,
    )
    .orderBy(desc(latest))
    .limit(limit)
  return rows.map(({ documentId, documentName, ...group }) => ({
    ...group,
    document: { id: documentId, name: documentName },
  }))
}
