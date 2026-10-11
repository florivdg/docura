import { EMBEDDING_DIMENSIONS } from '@/db/schema/embedding'

const DEFAULT_STALE_JOB_TIMEOUT_MINUTES = 10
/** Well above the 30 s job heartbeat, so a live job is never reset. */
const MIN_STALE_JOB_TIMEOUT_MINUTES = 2

/**
 * STALE_JOB_TIMEOUT_MINUTES, or the default when it is missing, not a number
 * or below the minimum (0 would reset every running job on each sweep).
 */
export function staleTimeoutMinutes(raw: string | undefined): number {
  const minutes = Number(raw)
  return Number.isFinite(minutes) && minutes >= MIN_STALE_JOB_TIMEOUT_MINUTES
    ? minutes
    : DEFAULT_STALE_JOB_TIMEOUT_MINUTES
}

export const WORKER_CONFIG = {
  pollIntervalMs: 3000,
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  ollamaEmbedModel: process.env.OLLAMA_EMBED_MODEL || 'mxbai-embed-large',
  ollamaLlmModel: process.env.OLLAMA_LLM_MODEL || 'llama3',
  ocrServiceUrl: process.env.OCR_SERVICE_URL || 'http://localhost:8100',
  embeddingDimensions: EMBEDDING_DIMENSIONS,
  workerConcurrency: Number(process.env.WORKER_CONCURRENCY || '2'),
  ocrTimeoutMs: 120_000,
  ollamaTimeoutMs: 60_000,
  llmTextLimit: 3000,
  imageMimeTypes: new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/tiff',
  ]),
  watchDir: process.env.WATCH_DIR || './watch',
  watchEnabled: process.env.WATCH_ENABLED !== 'false',
  watchStabilityMs: 2000,
  watchDebounceMs: 500,
  watchRescanIntervalMs: 60_000,
  maxFileSizeMB: Number(process.env.MAX_FILE_SIZE_MB || '50'),
  trashRetentionDays: Number(process.env.TRASH_RETENTION_DAYS || '90'),
  trashCleanupIntervalMs: 60 * 60 * 1000, // 1 hour
  // A job whose heartbeat is older than this is considered lost and reset.
  staleJobTimeoutMs:
    staleTimeoutMinutes(process.env.STALE_JOB_TIMEOUT_MINUTES) * 60_000,
  staleJobSweepIntervalMs: 60_000,
  jobHeartbeatIntervalMs: 30_000,
  // Worker liveness key in Redis (TTL: WORKER_HEARTBEAT_TTL_SECONDS).
  heartbeatIntervalMs: 10_000,
  statusCheckTimeoutMs: 2000,
} as const
