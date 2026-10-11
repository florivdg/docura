import { WORKER_CONFIG } from '@/worker/config'
import {
  clearWorkerHeartbeat,
  publishWorkerHeartbeat,
  workerIdentity,
} from '@/worker/heartbeat'
import { abortableSleep, runPeriodically } from '@/worker/periodic'
import { claimNextJob, recoverStaleJobs } from '@/worker/pipeline/job-lifecycle'
import { processJob } from '@/worker/process-job'
import { cleanupTrash } from '@/worker/trash-cleanup'
import { assertDatabaseCompatibility } from '@/worker/utils/db-checks'
import { startWatcher, stopWatcher } from '@/worker/watch'

const shutdown = new AbortController()

function registerShutdownHandlers() {
  const handler = () => {
    if (shutdown.signal.aborted) return
    shutdown.abort()
    console.log('Shutdown-Signal empfangen, Worker wird beendet...')
    void stopWatcher()
  }
  process.on('SIGTERM', handler)
  process.on('SIGINT', handler)
}

async function workerLoop(workerId: number) {
  while (!shutdown.signal.aborted) {
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
    await abortableSleep(WORKER_CONFIG.pollIntervalMs, shutdown.signal)
  }
  console.log(`[Worker ${workerId}] beendet`)
}

async function removeExpiredTrash() {
  const deleted = await cleanupTrash()
  if (deleted > 0)
    console.log(`Papierkorb: ${deleted} abgelaufene Dokumente gelöscht`)
}

async function resetStaleJobs() {
  const recovered = await recoverStaleJobs()
  if (recovered.length > 0)
    console.warn(
      `${recovered.length} abgebrochene Verarbeitung(en) zurückgesetzt`,
    )
}

function logConfiguration(concurrency: number) {
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
  console.log(
    `  STALE_JOB_TIMEOUT_MINUTES: ${WORKER_CONFIG.staleJobTimeoutMs / 60_000}`,
  )
}

export async function startWorker(
  concurrency = WORKER_CONFIG.workerConcurrency,
) {
  logConfiguration(concurrency)

  await assertDatabaseCompatibility()
  console.log(
    `  DB-Check: OK (public.document.embedding = vector(${WORKER_CONFIG.embeddingDimensions}))`,
  )
  registerShutdownHandlers()

  await startWatcher()

  const identity = workerIdentity(concurrency)
  const { signal } = shutdown
  // The heartbeat has its own signal: it keeps running until the job loops
  // have drained, so /system does not show a worker finishing jobs as down.
  const heartbeat = new AbortController()
  const heartbeatLoop = runPeriodically(
    'Worker-Heartbeat',
    WORKER_CONFIG.heartbeatIntervalMs,
    () => publishWorkerHeartbeat(identity),
    heartbeat.signal,
  )
  const workers = Array.from({ length: concurrency }, (_, i) =>
    workerLoop(i + 1),
  )
  try {
    await Promise.all([
      ...workers,
      runPeriodically(
        'Papierkorb-Bereinigung',
        WORKER_CONFIG.trashCleanupIntervalMs,
        removeExpiredTrash,
        signal,
      ),
      // Runs right away too: jobs left in `processing` by a crashed worker.
      runPeriodically(
        'Prüfung abgebrochener Aufträge',
        WORKER_CONFIG.staleJobSweepIntervalMs,
        resetStaleJobs,
        signal,
      ),
    ])
  } finally {
    heartbeat.abort()
    await heartbeatLoop
  }
  await clearWorkerHeartbeat()
}
