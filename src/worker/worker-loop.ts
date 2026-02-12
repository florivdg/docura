import { WORKER_CONFIG } from '@/worker/config'
import { claimNextJob } from '@/worker/pipeline/job-lifecycle'
import { processJob } from '@/worker/process-job'
import { assertDatabaseCompatibility } from '@/worker/utils/db-checks'

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
    await Bun.sleep(WORKER_CONFIG.pollIntervalMs)
  }
}

export async function startWorker(
  concurrency = WORKER_CONFIG.workerConcurrency,
) {
  console.log('Worker gestartet, warte auf Aufträge...')
  console.log(`  UPLOAD_DIR: ${WORKER_CONFIG.uploadDir}`)
  console.log(`  OLLAMA_URL: ${WORKER_CONFIG.ollamaUrl}`)
  console.log(`  OCR_SERVICE_URL: ${WORKER_CONFIG.ocrServiceUrl}`)
  console.log(`  OLLAMA_EMBED_MODEL: ${WORKER_CONFIG.ollamaEmbedModel}`)
  console.log(`  OLLAMA_LLM_MODEL: ${WORKER_CONFIG.ollamaLlmModel}`)
  console.log(`  EMBEDDING_DIMENSIONS: ${WORKER_CONFIG.embeddingDimensions}`)
  console.log(`  WORKER_CONCURRENCY: ${concurrency}`)

  await assertDatabaseCompatibility()
  console.log(
    `  DB-Check: OK (public.document.embedding = vector(${WORKER_CONFIG.embeddingDimensions}))`,
  )

  const workers = Array.from({ length: concurrency }, (_, i) =>
    workerLoop(i + 1),
  )
  await Promise.all(workers)
}
