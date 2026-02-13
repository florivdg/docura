import { eq, sql } from 'drizzle-orm'

import { db } from '@/db'
import { processingJob } from '@/db/schema/documents'
import type { ProcessingJobRecord, ProcessingStep } from '@/worker/types'
import { notifyProcessingUpdate } from '@/worker/notify'

export async function claimNextJob(): Promise<ProcessingJobRecord | null> {
  const rows = await db.execute(sql`
    UPDATE processing_job
    SET status = 'processing', attempts = attempts + 1, started_at = NOW(), updated_at = NOW()
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

export async function updateStep(
  jobId: string,
  documentId: string,
  step: ProcessingStep,
) {
  await db
    .update(processingJob)
    .set({ step, updatedAt: new Date() })
    .where(eq(processingJob.id, jobId))

  await notifyProcessingUpdate({
    type: 'step_change',
    jobId,
    documentId,
    step,
    status: 'processing',
  })
}

export async function markFailed(
  jobId: string,
  documentId: string,
  errorMessage: string,
  attempts: number,
  maxAttempts: number,
) {
  if (attempts >= maxAttempts) {
    console.error(`Auftrag ${jobId} endgültig fehlgeschlagen: ${errorMessage}`)
    await db
      .update(processingJob)
      .set({
        status: 'failed',
        errorMessage,
        step: null,
        updatedAt: new Date(),
      })
      .where(eq(processingJob.id, jobId))
  } else {
    const delaySec = 30 * Math.pow(4, attempts - 1)
    const nextRetryAt = new Date(Date.now() + delaySec * 1000)
    console.warn(
      `Auftrag ${jobId} fehlgeschlagen (Versuch ${attempts}/${maxAttempts}), nächster Versuch in ${delaySec}s: ${errorMessage}`,
    )
    await db
      .update(processingJob)
      .set({
        status: 'failed',
        errorMessage,
        nextRetryAt,
        step: null,
        updatedAt: new Date(),
      })
      .where(eq(processingJob.id, jobId))
  }

  await notifyProcessingUpdate({
    type: 'failed',
    jobId,
    documentId,
    step: null,
    status: 'failed',
    errorMessage,
  })
}

export async function markCompleted(jobId: string, documentId: string) {
  await db
    .update(processingJob)
    .set({
      status: 'completed',
      completedAt: new Date(),
      step: null,
      updatedAt: new Date(),
    })
    .where(eq(processingJob.id, jobId))

  await notifyProcessingUpdate({
    type: 'completed',
    jobId,
    documentId,
    step: null,
    status: 'completed',
  })
}
