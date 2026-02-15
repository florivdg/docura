import { WORKER_CONFIG } from '@/worker/config'
import { claimNextJob } from '@/worker/pipeline/job-lifecycle'
import { processJob } from '@/worker/process-job'
import { cleanupTrash } from '@/worker/trash-cleanup'
import { assertDatabaseCompatibility } from '@/worker/utils/db-checks'
import { startWatcher, stopWatcher } from '@/worker/watch'

let shuttingDown = false

async function interruptibleSleep(ms: number) {
  const step = 1000
  let remaining = ms
  while (remaining > 0 && !shuttingDown) {
    await Bun.sleep(Math.min(step, remaining))
    remaining -= step
  }
}

function registerShutdownHandlers() {
  const handler = () => {
    if (shuttingDown) return
    shuttingDown = true
    console.log('Shutdown-Signal empfangen, Worker wird beendet...')
    void stopWatcher()
  }
  process.on('SIGTERM', handler)
  process.on('SIGINT', handler)
}

async function workerLoop(workerId: number) {
  while (!shuttingDown) {
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
  console.log(`[Worker ${workerId}] beendet`)
}

async function trashCleanupLoop() {
  while (!shuttingDown) {
    try {
      const deleted = await cleanupTrash()
      if (deleted > 0)
        console.log(`Papierkorb: ${deleted} abgelaufene Dokumente gelöscht`)
    } catch (error) {
      console.error('Fehler bei Papierkorb-Bereinigung:', error)
    }
    await interruptibleSleep(WORKER_CONFIG.trashCleanupIntervalMs)
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
  console.log(`  WATCH_DIR: ${WORKER_CONFIG.watchDir}`)
  console.log(`  WATCH_ENABLED: ${WORKER_CONFIG.watchEnabled}`)
  console.log(`  TRASH_RETENTION_DAYS: ${WORKER_CONFIG.trashRetentionDays}`)

  await assertDatabaseCompatibility()
  console.log(
    `  DB-Check: OK (public.document.embedding = vector(${WORKER_CONFIG.embeddingDimensions}))`,
  )

  registerShutdownHandlers()

  await startWatcher()

  const workers = Array.from({ length: concurrency }, (_, i) =>
    workerLoop(i + 1),
  )
  await Promise.all([...workers, trashCleanupLoop()])
}
