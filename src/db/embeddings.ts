import { and, asc, gt, isNull, sql, type SQL } from 'drizzle-orm'

import { db } from '@/db'
import { enqueueReprocessing } from '@/db/processing-jobs'
import { document } from '@/db/schema/documents'

/**
 * Clears every embedding, e.g. before migrating to another dimension. Raw SQL
 * so `updated_at` keeps meaning "edited by a user".
 */
export async function clearAllEmbeddings(): Promise<number> {
  const result = await db.execute(
    sql`UPDATE document SET embedding = NULL WHERE embedding IS NOT NULL`,
  )
  // Bun SQL reports the affected row count on the result.
  return (result as unknown as { count: number }).count
}

/**
 * Non-trashed documents with extracted text that need a vector; `all`
 * includes documents that already have one.
 */
function reembedConditions(all: boolean): SQL[] {
  const conditions = [
    isNull(document.trashedAt),
    sql`coalesce(${document.textContent}, '') <> ''`,
  ]
  if (!all) conditions.push(isNull(document.embedding))
  return conditions
}

const REEMBED_BATCH_SIZE = 100

async function nextBatch(
  conditions: SQL[],
  after: string | null,
): Promise<string[]> {
  const rows = await db
    .select({ id: document.id })
    .from(document)
    .where(and(...conditions, after ? gt(document.id, after) : undefined))
    .orderBy(asc(document.id))
    .limit(REEMBED_BATCH_SIZE)
  return rows.map((row) => row.id)
}

/**
 * Queues embedding-only jobs page by page (keyset on the id), each page in
 * its own transaction; returns the queued/skipped counts.
 */
export async function enqueueReembedding(
  all: boolean,
): Promise<{ queued: number; skipped: number }> {
  const conditions = reembedConditions(all)
  const totals = { queued: 0, skipped: 0 }
  let after: string | null = null
  for (;;) {
    const ids = await nextBatch(conditions, after)
    if (ids.length === 0) return totals
    const result = await enqueueReprocessing(ids, 'embedding')
    totals.queued += result.queued.length
    totals.skipped += result.skipped.length
    if (ids.length < REEMBED_BATCH_SIZE) return totals
    after = ids[ids.length - 1]
  }
}
