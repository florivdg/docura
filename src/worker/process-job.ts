import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { document, processingJob } from '@/db/schema/documents'
import { WORKER_CONFIG } from '@/worker/config'
import { markCompleted, markFailed } from '@/worker/pipeline/job-lifecycle'
import { generateAndStoreEmbedding } from '@/worker/pipeline/embedding'
import { runLlmAnalysis } from '@/worker/pipeline/llm-analysis'
import { extractImageOcr } from '@/worker/pipeline/ocr-extraction'
import { extractText } from '@/worker/pipeline/text-extraction'
import type { ProcessingJobRecord } from '@/worker/types'

export async function processJob(job: ProcessingJobRecord) {
  const jobId = job.id
  const documentId = job.document_id
  const attempts = (job.attempts ?? 0) + 1
  const maxAttempts = job.max_attempts ?? 3

  // Increment attempts
  await db
    .update(processingJob)
    .set({ attempts, updatedAt: new Date() })
    .where(eq(processingJob.id, jobId))

  try {
    // Fetch document
    const [doc] = await db
      .select()
      .from(document)
      .where(eq(document.id, documentId))

    if (!doc) {
      await markFailed(
        jobId,
        documentId,
        `Dokument ${documentId} nicht gefunden`,
        maxAttempts,
        maxAttempts,
      )
      return
    }

    const filePath = join(WORKER_CONFIG.uploadDir, doc.storagePath)
    const fileBuffer = await readFile(filePath)

    // Text extraction
    let extractedText = ''
    const isPdf = doc.mimeType === 'application/pdf'
    const isImage = WORKER_CONFIG.imageMimeTypes.has(doc.mimeType)

    if (isPdf) {
      extractedText = await extractText(doc, fileBuffer, jobId, documentId)
    } else if (isImage) {
      extractedText = await extractImageOcr(doc, fileBuffer, jobId, documentId)
    }

    // Store extracted text
    await db
      .update(document)
      .set({ textContent: extractedText })
      .where(eq(document.id, doc.id))

    // LLM analysis (non-fatal)
    if (extractedText.length > 0) {
      await runLlmAnalysis(doc, extractedText, jobId)
    }

    // Embedding
    if (extractedText.length > 0) {
      await generateAndStoreEmbedding(doc.id, extractedText, jobId)
    }

    // Mark complete
    await markCompleted(jobId, documentId)
    console.log(`Auftrag ${jobId} erfolgreich abgeschlossen`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await markFailed(jobId, documentId, message, attempts, maxAttempts)
  }
}
