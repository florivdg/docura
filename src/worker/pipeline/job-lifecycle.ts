import { and, eq, sql } from 'drizzle-orm'
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core'

import { db } from '@/db'
import { processingJob } from '@/db/schema/documents'
import { WORKER_CONFIG } from '@/worker/config'
import type {
  NotificationType,
  ProcessingJobRecord,
  ProcessingNotification,
  ProcessingStep,
} from '@/worker/types'
import { notifyProcessingUpdate } from '@/worker/notify'

/** The fields of a claimed job that lease checks and notifications need. */
export type ClaimedJob = Pick<
  ProcessingJobRecord,
  'id' | 'document_id' | 'kind' | 'attempts' | 'max_attempts'
>

export async function claimNextJob(): Promise<ProcessingJobRecord | null> {
  const rows = await db.execute(sql`
    UPDATE processing_job
    SET status = 'processing', attempts = attempts + 1, started_at = NOW(),
        heartbeat_at = NOW(), updated_at = NOW()
    WHERE id = (
      SELECT id FROM processing_job
      WHERE (status = 'pending')
         OR (status = 'failed' AND attempts < max_attempts
             AND (next_retry_at IS NULL OR next_retry_at <= NOW()))
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `)
  return rows.length > 0 ? (rows[0] as unknown as ProcessingJobRecord) : null
}

/** Our claim on the job; false once a stale-job sweep has taken it away. */
function stillClaimed(job: ClaimedJob) {
  return and(
    eq(processingJob.id, job.id),
    eq(processingJob.status, 'processing'),
    eq(processingJob.attempts, job.attempts),
  )
}

type JobUpdate = PgUpdateSetSource<typeof processingJob>

/** Writes the job row only while our claim holds; false if it was lost. */
async function updateClaimed(
  job: ClaimedJob,
  values: JobUpdate,
): Promise<boolean> {
  const updated = await db
    .update(processingJob)
    .set(values)
    .where(stillClaimed(job))
    .returning({ id: processingJob.id })
  return updated.length > 0
}

type NotificationExtra = Pick<
  ProcessingNotification,
  'step' | 'status' | 'errorMessage'
>

/** What a notification needs to identify the run. */
type JobRef = Pick<ClaimedJob, 'id' | 'document_id' | 'kind'>

function notifyJob(
  job: JobRef,
  type: NotificationType,
  extra: NotificationExtra,
): Promise<void> {
  return notifyProcessingUpdate({
    type,
    jobId: job.id,
    documentId: job.document_id,
    kind: job.kind,
    ...extra,
  })
}

/** The run ended: completed, or failed with `errorMessage`. */
function notifyTerminal(job: JobRef, errorMessage?: string) {
  return errorMessage === undefined
    ? notifyJob(job, 'completed', { step: null, status: 'completed' })
    : notifyJob(job, 'failed', { step: null, status: 'failed', errorMessage })
}

/** The job was reset by a stale-job sweep while this worker still ran it. */
export class LostLeaseError extends Error {
  constructor(jobId: string) {
    super(
      `Auftrag ${jobId} wurde zwischenzeitlich als abgebrochen markiert; Ergebnis wird verworfen`,
    )
    this.name = 'LostLeaseError'
  }
}

/**
 * A running job plus the worker's lease on it. `signal` aborts with a
 * LostLeaseError as soon as a renewal or step update finds the job taken away.
 */
export interface JobLease {
  job: ClaimedJob
  signal: AbortSignal
  /** Writes the job row while the claim holds and aborts `signal` otherwise. */
  update: (values: JobUpdate) => Promise<boolean>
  stop: () => void
}

/** Renews the lease every `intervalMs` until `stop` is called. */
export function startJobLease(
  job: ClaimedJob,
  intervalMs: number = WORKER_CONFIG.jobHeartbeatIntervalMs,
): JobLease {
  const controller = new AbortController()
  async function update(values: JobUpdate) {
    const claimed = await updateClaimed(job, values)
    if (!claimed && !controller.signal.aborted)
      controller.abort(new LostLeaseError(job.id))
    return claimed
  }
  const timer = setInterval(() => {
    update({ heartbeatAt: sql`NOW()` }).catch((error: unknown) => {
      console.warn(`Heartbeat für Auftrag ${job.id} fehlgeschlagen:`, error)
    })
  }, intervalMs)
  return {
    job,
    signal: controller.signal,
    update,
    stop: () => clearInterval(timer),
  }
}

/** Writes the job row; throws the LostLeaseError if the claim is gone. */
async function writeLeased(lease: JobLease, values: JobUpdate) {
  lease.signal.throwIfAborted()
  await lease.update(values)
  lease.signal.throwIfAborted()
}

/**
 * Renews the lease right before a document write, so a run whose job was
 * reset meanwhile throws instead of writing; the periodic heartbeat alone
 * would notice that up to one interval late.
 */
export function assertLease(lease: JobLease): Promise<void> {
  return writeLeased(lease, { heartbeatAt: sql`NOW()` })
}

/** Records and announces the current step; throws if the lease is lost. */
export async function updateStep(lease: JobLease, step: ProcessingStep) {
  await writeLeased(lease, { step, updatedAt: new Date() })
  await notifyJob(lease.job, 'step_change', { step, status: 'processing' })
}

/** Exponential backoff between attempts: 30 s, 2 min, 8 min, … */
export function retryDelaySeconds(attempts: number): number {
  return 30 * Math.pow(4, attempts - 1)
}

function failureUpdate(job: ClaimedJob, errorMessage: string, final: boolean) {
  const base = { status: 'failed', errorMessage, step: null }
  if (final) {
    // attempts = max_attempts keeps permanent failures out of the retry query.
    return { ...base, attempts: sql`${processingJob.maxAttempts}` }
  }
  const delayMs = retryDelaySeconds(job.attempts) * 1000
  return { ...base, nextRetryAt: new Date(Date.now() + delayMs) }
}

function logFailure(job: ClaimedJob, errorMessage: string, final: boolean) {
  if (final) {
    console.error(`Auftrag ${job.id} endgültig fehlgeschlagen: ${errorMessage}`)
    return
  }
  console.warn(
    `Auftrag ${job.id} fehlgeschlagen (Versuch ${job.attempts}/${job.max_attempts}), nächster Versuch in ${retryDelaySeconds(job.attempts)}s: ${errorMessage}`,
  )
}

function logLostClaim(jobId: string) {
  console.warn(new LostLeaseError(jobId).message)
}

/**
 * Records a failed attempt and schedules the retry. `permanent` failures
 * (missing document, invalid path) are never retried.
 */
export async function markFailed(
  job: ClaimedJob,
  errorMessage: string,
  { permanent = false } = {},
) {
  const final = permanent || job.attempts >= job.max_attempts
  const values = failureUpdate(job, errorMessage, final)
  if (!(await updateClaimed(job, { ...values, updatedAt: new Date() })))
    return logLostClaim(job.id)

  logFailure(job, errorMessage, final)
  await notifyTerminal(job, errorMessage)
}

/** Clears the error of an earlier attempt, so the history shows a clean run. */
export async function markCompleted(job: ClaimedJob) {
  const values = {
    status: 'completed',
    completedAt: new Date(),
    step: null,
    errorMessage: null,
    updatedAt: new Date(),
  }
  if (!(await updateClaimed(job, values))) return logLostClaim(job.id)
  await notifyTerminal(job)
}

export function staleJobMessage(timeoutMs: number): string {
  const minutes = Math.max(1, Math.round(timeoutMs / 60_000))
  const unit = minutes === 1 ? 'Minute' : 'Minuten'
  return `Verarbeitung abgebrochen: keine Rückmeldung vom Worker seit ${minutes} ${unit}`
}

/**
 * Resets jobs whose worker stopped renewing the heartbeat (crash, kill,
 * restart) to `failed`. The interrupted run already counted as an attempt at
 * claim time, so retryable jobs are claimed again right away and exhausted
 * ones stay failed. Legacy rows without a heartbeat fall back to started_at.
 */
export async function recoverStaleJobs(
  timeoutMs: number = WORKER_CONFIG.staleJobTimeoutMs,
): Promise<JobRef[]> {
  const message = staleJobMessage(timeoutMs)
  const cutoff = `${Math.round(timeoutMs / 1000)} seconds`
  const result = await db.execute<JobRef>(sql`
    UPDATE processing_job
    SET status = 'failed', step = NULL, heartbeat_at = NULL,
        next_retry_at = NOW(), error_message = ${message}, updated_at = NOW()
    WHERE status = 'processing'
      AND COALESCE(heartbeat_at, started_at, updated_at) < NOW() - ${cutoff}::interval
    RETURNING id, document_id, kind
  `)
  const rows = [...result] as JobRef[]
  for (const row of rows) await notifyTerminal(row, message)
  return rows
}
