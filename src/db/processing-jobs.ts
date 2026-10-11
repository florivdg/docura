import {
  and,
  desc,
  eq,
  exists,
  inArray,
  isNull,
  lt,
  sql,
  type SQL,
} from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

import { db, type Transaction } from '@/db'
import { isLatestJob, latestJobPerDoc, viewConditions } from '@/db/queries'
import { document, processingJob } from '@/db/schema/documents'
import {
  planReprocessing,
  type JobUpgrade,
  type QueuedJob,
  type ReprocessCandidate,
  type ReprocessResult,
} from '@/lib/document-reprocess'
import type { JobKind } from '@/lib/processing'
import type { QueueCountsRow } from '@/lib/system-status'

const hasStatus = (status: string) => eq(processingJob.status, status)

/**
 * Jobs of the outer `document` row. Built with the query builder so the
 * correlation renders table-qualified (`"document"."id"`); a raw template
 * would render `"id"` in a single-table select and bind to `processing_job`.
 */
function jobsOfDocument(status: string) {
  return and(eq(processingJob.documentId, document.id), hasStatus(status))
}

/**
 * Row locks on the requested documents serialize concurrent reprocess
 * requests for the same document. Only locks; the job state is read later.
 */
async function lockDocuments(ids: string[], tx: Transaction) {
  await tx
    .select({ id: document.id })
    .from(document)
    .where(inArray(document.id, ids))
    .for('update')
}

/**
 * The job state per document. Runs as its own statement after the lock and
 * the retry cancellation: under READ COMMITTED it gets a fresh snapshot, so
 * it sees jobs committed by a request that held the lock before and retries
 * the worker claimed in the meantime.
 */
function loadCandidates(
  ids: string[],
  tx: Transaction,
): Promise<ReprocessCandidate[]> {
  const runningJob = tx
    .select({ one: sql`1` })
    .from(processingJob)
    .where(jobsOfDocument('processing'))
  const latestPending = (column: AnyPgColumn) =>
    tx
      .select({ value: column })
      .from(processingJob)
      .where(jobsOfDocument('pending'))
      .orderBy(desc(processingJob.createdAt), desc(processingJob.id))
      .limit(1)
  return tx
    .select({
      id: document.id,
      trashed: sql<boolean>`${document.trashedAt} IS NOT NULL`,
      processing: sql<boolean>`${exists(runningJob)}`,
      pendingJobId: sql<string | null>`${latestPending(processingJob.id)}`,
      pendingJobKind: sql<JobKind | null>`${latestPending(processingJob.kind)}`,
    })
    .from(document)
    .where(inArray(document.id, ids))
}

/**
 * A failed job still waiting for its retry would run in addition to the new
 * one; using up its attempts takes it out of the claim query. Runs before
 * the job state is read: a retry the worker claims concurrently holds its row
 * lock, so this update waits, skips it (no longer `failed`) and the read
 * sees it as running.
 */
async function cancelScheduledRetries(ids: string[], tx: Transaction) {
  const activeDocuments = tx
    .select({ id: document.id })
    .from(document)
    .where(and(inArray(document.id, ids), isNull(document.trashedAt)))
  await tx
    .update(processingJob)
    .set({
      attempts: sql`${processingJob.maxAttempts}`,
      nextRetryAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(processingJob.documentId, activeDocuments),
        eq(processingJob.status, 'failed'),
        lt(processingJob.attempts, processingJob.maxAttempts),
      ),
    )
}

/**
 * Turns pending embedding-only jobs into full jobs. A job the worker claimed
 * since the read is no longer pending and is reported as running.
 */
async function upgradeJobs(
  upgrades: JobUpgrade[],
  tx: Transaction,
): Promise<ReprocessResult> {
  if (upgrades.length === 0) return { queued: [], skipped: [] }
  const rows = await tx
    .update(processingJob)
    .set({ kind: 'full', updatedAt: new Date() })
    .where(
      and(
        inArray(
          processingJob.id,
          upgrades.map((upgrade) => upgrade.jobId),
        ),
        hasStatus('pending'),
      ),
    )
    .returning({ jobId: processingJob.id, id: processingJob.documentId })
  const upgraded = new Set(rows.map((row) => row.jobId))
  return {
    queued: rows.map((row) => ({ ...row, kind: 'full', created: false })),
    skipped: upgrades
      .filter((upgrade) => !upgraded.has(upgrade.jobId))
      .map(({ id }) => ({ id, reason: 'running' })),
  }
}

async function insertJobs(
  ids: string[],
  kind: JobKind,
  tx: Transaction,
): Promise<QueuedJob[]> {
  if (ids.length === 0) return []
  const rows = await tx
    .insert(processingJob)
    .values(ids.map((documentId) => ({ documentId, kind })))
    .returning({ jobId: processingJob.id, id: processingJob.documentId })
  return rows.map((row) => ({ ...row, kind, created: true }))
}

/**
 * Queues a processing job per document in one transaction. Trashed and
 * running documents are skipped; an already pending job is reused (or turned
 * into a full job for a full request), so a double click does not queue
 * twice. Order matters: lock → cancel retries → read job state → write.
 */
export function enqueueReprocessing(
  ids: string[],
  kind: JobKind,
): Promise<ReprocessResult> {
  return db.transaction(async (tx) => {
    await lockDocuments(ids, tx)
    await cancelScheduledRetries(ids, tx)
    const plan = planReprocessing(ids, await loadCandidates(ids, tx), kind)
    const upgraded = await upgradeJobs(plan.upgrade, tx)
    const created = await insertJobs(plan.insert, kind, tx)
    return {
      queued: [...plan.queued, ...upgraded.queued, ...created],
      skipped: [...plan.skipped, ...upgraded.skipped],
    }
  })
}

const countWhere = (condition: SQL | undefined) =>
  sql<number>`count(*) filter (where ${condition})::int`

/**
 * Documents by the state of their latest job, so a failure that was later
 * reprocessed successfully no longer counts. Pending and processing count
 * every document because they are work for the worker (e.g. re-embedding
 * archived documents); `failed` and its retrying part use the conditions of
 * the default document list, so `failed` matches `/documents?status=failed`.
 */
export async function loadQueueCounts(): Promise<QueueCountsRow> {
  const latestJob = latestJobPerDoc()
  const failedInList = (condition?: SQL) =>
    and(hasStatus('failed'), condition, ...viewConditions('all'))
  const [row] = await db
    .select({
      pending: countWhere(hasStatus('pending')),
      processing: countWhere(hasStatus('processing')),
      failed: countWhere(failedInList()),
      failedRetrying: countWhere(
        failedInList(lt(processingJob.attempts, processingJob.maxAttempts)),
      ),
      oldestPendingAt: sql<Date | null>`min(${processingJob.createdAt}) filter (where ${hasStatus('pending')})`,
    })
    .from(document)
    .innerJoin(latestJob, eq(document.id, latestJob.documentId))
    .innerJoin(processingJob, isLatestJob(latestJob))
  return row
}
