/** Lifetime of the worker's liveness key; a silent worker counts as down after it. */
export const WORKER_HEARTBEAT_TTL_SECONDS = 30

export interface WorkerHeartbeat {
  pid: number
  hostname: string
  concurrency: number
  startedAt: string
  lastSeen: string
  version: string
  embedModel: string
  llmModel: string
}

/** `unknown` when Redis itself is unreachable, so liveness cannot be read. */
export type WorkerState = 'ok' | 'down' | 'unknown'

export type WorkerStatus = Partial<Omit<WorkerHeartbeat, 'lastSeen'>> & {
  status: WorkerState
  lastSeen: string | null
}

export interface ServiceCheck {
  status: 'ok' | 'error'
  latencyMs: number | null
  error: string | null
}

/** `available` is null when Ollama could not be asked. */
export interface ModelAvailability {
  name: string
  available: boolean | null
}

export interface OllamaCheck extends ServiceCheck {
  models: { embed: ModelAvailability; llm: ModelAvailability }
}

/**
 * Documents by the state of their latest job. `pending` and `processing`
 * cover every document (queue work, including archived ones); `failed` and
 * `failedRetrying` are limited to the regular document list (not trashed, not
 * archived) so `failed` matches `/documents?status=failed`.
 */
export interface QueueSummary {
  pending: number
  processing: number
  failed: number
  /** The part of `failed` with another attempt scheduled. */
  failedRetrying: number
  oldestPendingAt: string | null
}

export interface SystemStatus {
  checkedAt: string
  worker: WorkerStatus
  services: {
    database: ServiceCheck
    redis: ServiceCheck
    ocr: ServiceCheck
    ollama: OllamaCheck
  }
  queue: QueueSummary | null
}

export interface ProbeResult<T> {
  check: ServiceCheck
  value: T | null
}

function parseHeartbeat(raw: string): WorkerHeartbeat | null {
  try {
    const value = JSON.parse(raw) as WorkerHeartbeat | null
    return typeof value?.lastSeen === 'string' ? value : null
  } catch {
    return null
  }
}

/** Worker liveness from the Redis heartbeat key (absent once its TTL ran out). */
export function summarizeHeartbeat(
  redis: ProbeResult<string | null>,
): WorkerStatus {
  if (redis.check.status === 'error')
    return { status: 'unknown', lastSeen: null }
  const heartbeat = redis.value ? parseHeartbeat(redis.value) : null
  return heartbeat
    ? { ...heartbeat, status: 'ok' }
    : { status: 'down', lastSeen: null }
}

/** Per-status counts as returned by the database driver. */
export type QueueCountsRow = {
  [K in Exclude<keyof QueueSummary, 'oldestPendingAt'>]: number | string
} & { oldestPendingAt: Date | string | null }

export function queueSummary(row: QueueCountsRow): QueueSummary {
  return {
    pending: Number(row.pending),
    processing: Number(row.processing),
    failed: Number(row.failed),
    failedRetrying: Number(row.failedRetrying),
    oldestPendingAt:
      row.oldestPendingAt === null
        ? null
        : new Date(row.oldestPendingAt).toISOString(),
  }
}

function listedModelNames(tags: unknown): string[] {
  const models = (tags as { models?: unknown } | null)?.models
  if (!Array.isArray(models)) return []
  return models.flatMap((model: { name?: unknown } | null) =>
    typeof model?.name === 'string' ? [model.name] : [],
  )
}

/** Ollama lists untagged models as `name:latest`. */
export function isModelListed(configured: string, listed: string[]): boolean {
  const tagged = configured.includes(':') ? configured : `${configured}:latest`
  return listed.includes(configured) || listed.includes(tagged)
}

/** Whether the configured models appear in Ollama's `/api/tags` answer. */
export function ollamaModelStatus(
  tags: unknown,
  models: { embed: string; llm: string },
): OllamaCheck['models'] {
  const listed = tags === null ? null : listedModelNames(tags)
  const availability = (name: string): ModelAvailability => ({
    name,
    available: listed ? isModelListed(name, listed) : null,
  })
  return { embed: availability(models.embed), llm: availability(models.llm) }
}
