import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { document } from '@/db/schema/documents'
import { WORKER_CONFIG } from '@/worker/config'
import {
  assertLease,
  type JobLease,
  LostLeaseError,
  markCompleted,
  markFailed,
  startJobLease,
} from '@/worker/pipeline/job-lifecycle'
import { generateAndStoreEmbedding } from '@/worker/pipeline/embedding'
import { runLlmAnalysis } from '@/worker/pipeline/llm-analysis'
import { extractImageOcr } from '@/worker/pipeline/ocr-extraction'
import { extractText } from '@/worker/pipeline/text-extraction'
import type { ProcessingJobRecord } from '@/worker/types'

type DocumentRecord = typeof document.$inferSelect

/** A failure that retrying cannot fix; the job is not retried. */
class PermanentJobError extends Error {}

/** The absolute file path, or a permanent error for paths escaping UPLOAD_DIR. */
function resolveUploadPath(storagePath: string): string {
  const uploadBase = path.resolve(WORKER_CONFIG.uploadDir)
  const filePath = path.resolve(uploadBase, storagePath)
  if (filePath === uploadBase || filePath.startsWith(uploadBase + path.sep))
    return filePath
  throw new PermanentJobError(`Ungültiger Dateipfad: ${storagePath}`)
}

async function loadDocument(documentId: string): Promise<DocumentRecord> {
  const [doc] = await db
    .select()
    .from(document)
    .where(eq(document.id, documentId))
  if (!doc) throw new PermanentJobError(`Dokument ${documentId} nicht gefunden`)
  return doc
}

/** Text layer of a PDF or OCR of an image; other types yield no text. */
async function extractDocumentText(
  doc: DocumentRecord,
  lease: JobLease,
): Promise<string> {
  const isPdf = doc.mimeType === 'application/pdf'
  const isImage = WORKER_CONFIG.imageMimeTypes.has(doc.mimeType)
  if (!isPdf && !isImage) return ''
  const fileBuffer = await readFile(resolveUploadPath(doc.storagePath))
  return isPdf
    ? extractText(doc, fileBuffer, lease)
    : extractImageOcr(doc, fileBuffer, lease)
}

/**
 * Extraction/OCR → LLM metadata → embedding. Stops between the steps once
 * the lease is lost, so a reset job is not finished twice.
 */
async function runFullPipeline(doc: DocumentRecord, lease: JobLease) {
  const extractedText = await extractDocumentText(doc, lease)
  await assertLease(lease)
  await db
    .update(document)
    .set({ textContent: extractedText })
    .where(eq(document.id, doc.id))
  if (extractedText.length === 0) return

  // LLM analysis is non-fatal; embedding errors fail the attempt.
  await runLlmAnalysis(doc, extractedText, lease)
  await generateAndStoreEmbedding(doc.id, extractedText, lease)
}

async function runJob(lease: JobLease) {
  const doc = await loadDocument(lease.job.document_id)
  // Re-embedding reuses the stored text; without text it needs the full run.
  if (lease.job.kind === 'embedding' && doc.textContent) {
    await generateAndStoreEmbedding(doc.id, doc.textContent, lease)
  } else {
    await runFullPipeline(doc, lease)
  }
}

async function recordFailure(job: ProcessingJobRecord, error: unknown) {
  if (error instanceof LostLeaseError) return console.warn(error.message)
  const message = error instanceof Error ? error.message : String(error)
  await markFailed(job, message, {
    permanent: error instanceof PermanentJobError,
  })
}

export async function processJob(job: ProcessingJobRecord) {
  const lease = startJobLease(job)
  try {
    await runJob(lease)
    await markCompleted(job)
    console.log(`Auftrag ${job.id} erfolgreich abgeschlossen`)
  } catch (error) {
    await recordFailure(job, error)
  } finally {
    lease.stop()
  }
}
