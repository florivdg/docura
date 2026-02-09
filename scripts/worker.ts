#!/usr/bin/env bun
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { eq, sql } from 'drizzle-orm'

import { db } from '@/db'
import { document, processingJob } from '@/db/schema/documents'

const POLL_INTERVAL_MS = 3000
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads'
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'mxbai-embed-large'
const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || 'http://localhost:8100'
const EMBEDDING_DIMENSIONS = 1024
const EXPECTED_EMBEDDING_COLUMN_TYPE = `vector(${EMBEDDING_DIMENSIONS})`
const WORKER_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || '2')
const OCR_TIMEOUT_MS = 120_000
const OLLAMA_TIMEOUT_MS = 60_000

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeoutId)
  }
}

const IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/tiff',
])

async function claimNextJob() {
  const rows = await db.execute(sql`
    UPDATE processing_job
    SET status = 'processing', started_at = NOW(), updated_at = NOW()
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
  return rows.length > 0 ? rows[0] : null
}

async function updateStep(jobId: string, step: string) {
  await db
    .update(processingJob)
    .set({ step, updatedAt: new Date() })
    .where(eq(processingJob.id, jobId))
}

async function markFailed(
  jobId: string,
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
}

function validateVector(vector: unknown): number[] {
  if (!Array.isArray(vector)) {
    throw new Error('Embedding ist kein Array')
  }
  if (vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding hat ${vector.length} Dimensionen, erwartet ${EMBEDDING_DIMENSIONS} (Modell: ${OLLAMA_EMBED_MODEL})`,
    )
  }
  for (let i = 0; i < vector.length; i++) {
    if (typeof vector[i] !== 'number' || !Number.isFinite(vector[i])) {
      throw new Error(
        `Embedding enthält ungültigen Wert an Position ${i}: ${vector[i]}`,
      )
    }
  }
  return vector as number[]
}

async function assertDatabaseCompatibility() {
  const extensionRows = await db.execute<{ extensionName: string }>(sql`
    SELECT extname AS "extensionName"
    FROM pg_extension
    WHERE extname = 'vector'
    LIMIT 1
  `)

  if (extensionRows.length === 0) {
    throw new Error(
      'PostgreSQL-Extension "vector" fehlt. Bitte installiere/aktiviere pgvector.',
    )
  }

  const columnRows = await db.execute<{ columnType: string }>(sql`
    SELECT format_type(a.atttypid, a.atttypmod) AS "columnType"
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'document'
      AND a.attname = 'embedding'
      AND a.attnum > 0
      AND NOT a.attisdropped
    LIMIT 1
  `)

  if (columnRows.length === 0) {
    throw new Error(
      'Spalte "public.document.embedding" fehlt. Bitte Schema mit "bun run db:push" synchronisieren.',
    )
  }

  const actualType = columnRows[0].columnType
  if (actualType !== EXPECTED_EMBEDDING_COLUMN_TYPE) {
    throw new Error(
      `Ungültiger Spaltentyp für "public.document.embedding": ${actualType}. Erwartet: ${EXPECTED_EMBEDDING_COLUMN_TYPE}. Bitte "bun run db:push" ausführen.`,
    )
  }
}

function chunkText(text: string, chunkSize = 8000, overlap = 200): string[] {
  if (text.length <= chunkSize) return [text]
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += chunkSize - overlap) {
    chunks.push(text.substring(i, i + chunkSize))
  }
  return chunks
}

function toPgVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`
}

async function storeEmbedding(documentId: string, vector: number[]) {
  const vectorLiteral = toPgVectorLiteral(vector)

  try {
    await db
      .update(document)
      .set({ embedding: sql`${vectorLiteral}::vector` })
      .where(eq(document.id, documentId))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Embedding konnte nicht gespeichert werden: ${message}. Prüfe "public.document.embedding" auf ${EXPECTED_EMBEDDING_COLUMN_TYPE} und synchronisiere bei Bedarf mit "bun run db:push".`,
    )
  }
}

async function processJob(job: Record<string, any>) {
  const jobId = job.id as string
  const documentId = job.document_id as string
  const attempts = ((job.attempts as number) ?? 0) + 1
  const maxAttempts = (job.max_attempts as number) ?? 3

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
        `Dokument ${documentId} nicht gefunden`,
        maxAttempts,
        maxAttempts,
      )
      return
    }

    const filePath = join(UPLOAD_DIR, doc.storagePath)
    const fileBuffer = await readFile(filePath)

    // Text extraction
    let extractedText = ''
    const isPdf = doc.mimeType === 'application/pdf'
    const isImage = IMAGE_MIME_TYPES.has(doc.mimeType)

    if (isPdf) {
      await updateStep(jobId, 'text_extraction')

      const formData = new FormData()
      formData.append(
        'file',
        new Blob([fileBuffer], { type: doc.mimeType }),
        doc.name,
      )
      formData.append('mode', 'text')

      const response = await fetchWithTimeout(
        `${OCR_SERVICE_URL}/extract/pdf`,
        { method: 'POST', body: formData },
        OCR_TIMEOUT_MS,
      )
      if (!response.ok) {
        throw new Error(
          `OCR-Service Fehler (PDF text): ${response.status} ${response.statusText}`,
        )
      }
      const result = (await response.json()) as { text: string }
      extractedText = result.text

      // If text extraction yielded very little, try OCR
      if (extractedText.length < 50) {
        await updateStep(jobId, 'ocr')

        const ocrFormData = new FormData()
        ocrFormData.append(
          'file',
          new Blob([fileBuffer], { type: doc.mimeType }),
          doc.name,
        )
        ocrFormData.append('mode', 'ocr')

        const ocrResponse = await fetchWithTimeout(
          `${OCR_SERVICE_URL}/extract/pdf`,
          { method: 'POST', body: ocrFormData },
          OCR_TIMEOUT_MS,
        )
        if (!ocrResponse.ok) {
          throw new Error(
            `OCR-Service Fehler (PDF OCR): ${ocrResponse.status} ${ocrResponse.statusText}`,
          )
        }
        const ocrResult = (await ocrResponse.json()) as { text: string }
        extractedText = ocrResult.text
      }
    } else if (isImage) {
      await updateStep(jobId, 'ocr')

      const formData = new FormData()
      formData.append(
        'file',
        new Blob([fileBuffer], { type: doc.mimeType }),
        doc.name,
      )

      const response = await fetchWithTimeout(
        `${OCR_SERVICE_URL}/extract/image`,
        { method: 'POST', body: formData },
        OCR_TIMEOUT_MS,
      )
      if (!response.ok) {
        throw new Error(
          `OCR-Service Fehler (Bild): ${response.status} ${response.statusText}`,
        )
      }
      const result = (await response.json()) as { text: string }
      extractedText = result.text
    }

    // Store extracted text
    await db
      .update(document)
      .set({ textContent: extractedText })
      .where(eq(document.id, doc.id))

    // Embedding
    if (extractedText.length > 0) {
      await updateStep(jobId, 'embedding')

      const chunks = chunkText(extractedText)
      const vectors: number[][] = []

      for (const chunk of chunks) {
        const embedResponse = await fetchWithTimeout(
          `${OLLAMA_URL}/api/embed`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: OLLAMA_EMBED_MODEL,
              input: chunk,
              dimensions: EMBEDDING_DIMENSIONS,
            }),
          },
          OLLAMA_TIMEOUT_MS,
        )
        if (!embedResponse.ok) {
          throw new Error(
            `Ollama Fehler: ${embedResponse.status} ${embedResponse.statusText}`,
          )
        }
        const embedResult = (await embedResponse.json()) as {
          embeddings: number[][]
        }
        vectors.push(validateVector(embedResult.embeddings[0]))
      }

      // Average and normalize vectors if multiple chunks
      let finalVector: number[]
      if (vectors.length === 1) {
        finalVector = vectors[0]
      } else {
        finalVector = Array.from<number>({ length: EMBEDDING_DIMENSIONS }).fill(
          0,
        )
        for (const vec of vectors) {
          for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
            finalVector[i] += vec[i]
          }
        }
        let norm = 0
        for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
          norm += finalVector[i] * finalVector[i]
        }
        norm = Math.sqrt(norm)
        if (norm > 0) {
          for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
            finalVector[i] /= norm
          }
        }
      }

      await storeEmbedding(doc.id, finalVector)
    }

    // Mark complete
    await db
      .update(processingJob)
      .set({
        status: 'completed',
        completedAt: new Date(),
        step: null,
        updatedAt: new Date(),
      })
      .where(eq(processingJob.id, jobId))

    console.log(`Auftrag ${jobId} erfolgreich abgeschlossen`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await markFailed(jobId, message, attempts, maxAttempts)
  }
}

async function workerLoop(workerId: number) {
  while (true) {
    try {
      const job = await claimNextJob()
      if (job) {
        console.log(
          `[Worker ${workerId}] Verarbeite Auftrag ${job.id} (Dokument: ${job.document_id})`,
        )
        await processJob(job)
        continue
      }
    } catch (error) {
      console.error(`[Worker ${workerId}] Fehler:`, error)
    }
    await Bun.sleep(POLL_INTERVAL_MS)
  }
}

async function main() {
  console.log('Worker gestartet, warte auf Aufträge...')
  console.log(`  UPLOAD_DIR: ${UPLOAD_DIR}`)
  console.log(`  OLLAMA_URL: ${OLLAMA_URL}`)
  console.log(`  OCR_SERVICE_URL: ${OCR_SERVICE_URL}`)
  console.log(`  OLLAMA_EMBED_MODEL: ${OLLAMA_EMBED_MODEL}`)
  console.log(`  EMBEDDING_DIMENSIONS: ${EMBEDDING_DIMENSIONS}`)
  console.log(`  WORKER_CONCURRENCY: ${WORKER_CONCURRENCY}`)
  await assertDatabaseCompatibility()
  console.log(
    `  DB-Check: OK (public.document.embedding = ${EXPECTED_EMBEDDING_COLUMN_TYPE})`,
  )

  const workers = Array.from({ length: WORKER_CONCURRENCY }, (_, i) =>
    workerLoop(i + 1),
  )
  await Promise.all(workers)
}

void main().catch((error) => {
  console.error('Worker konnte nicht starten:', error)
  process.exit(1)
})
