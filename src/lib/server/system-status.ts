import { sql } from 'drizzle-orm'

import { db } from '@/db'
import { loadQueueCounts } from '@/db/processing-jobs'
import { readWorkerHeartbeat } from '@/lib/redis'
import {
  ollamaModelStatus,
  queueSummary,
  summarizeHeartbeat,
  type OllamaCheck,
  type ProbeResult,
  type QueueSummary,
  type ServiceCheck,
  type SystemStatus,
} from '@/lib/system-status'
import { WORKER_CONFIG } from '@/worker/config'

/** A non-2xx answer from a probed HTTP service. */
export class HttpStatusError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`)
  }
}

/**
 * A short, user-facing reason. Raw messages are not passed on because they
 * can contain internal URLs and host names.
 */
export function describeProbeError(error: unknown): string {
  if (error instanceof HttpStatusError) return error.message
  if (error instanceof Error && error.name === 'TimeoutError')
    return 'Zeitüberschreitung'
  return 'Nicht erreichbar'
}

/** Rejects with the signal's reason once it aborts. */
function whenAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), {
      once: true,
    })
  })
}

/**
 * Runs one check against a single deadline and measures its latency. `run`
 * gets the deadline's signal so HTTP requests are cancelled; work that cannot
 * be cancelled (database, Redis) is abandoned when it fires.
 */
export async function probe<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number = WORKER_CONFIG.statusCheckTimeoutMs,
): Promise<ProbeResult<T>> {
  const deadline = new AbortController()
  const timer = setTimeout(
    () =>
      deadline.abort(new DOMException('Zeitüberschreitung', 'TimeoutError')),
    timeoutMs,
  )
  const start = performance.now()
  try {
    const value = await Promise.race([
      run(deadline.signal),
      whenAborted(deadline.signal),
    ])
    const latencyMs = Math.round(performance.now() - start)
    return { check: { status: 'ok', latencyMs, error: null }, value }
  } catch (error) {
    const check = { status: 'error', latencyMs: null } as const
    return {
      check: { ...check, error: describeProbeError(error) },
      value: null,
    }
  } finally {
    clearTimeout(timer)
  }
}

async function fetchOk(url: string, signal: AbortSignal): Promise<Response> {
  const res = await fetch(url, { signal })
  if (res.ok) return res
  await res.body?.cancel()
  throw new HttpStatusError(res.status)
}

/** `SELECT 1` against the application database. */
export async function probeDatabase(): Promise<ServiceCheck> {
  const result = await probe(() => db.execute(sql`SELECT 1`))
  return result.check
}

/** Redis reachability; the value is the worker's heartbeat JSON, if any. */
export function probeRedis(): Promise<ProbeResult<string | null>> {
  return probe(readWorkerHeartbeat)
}

export async function probeOcr(): Promise<ServiceCheck> {
  const result = await probe(async (signal) => {
    const res = await fetchOk(`${WORKER_CONFIG.ocrServiceUrl}/health`, signal)
    await res.body?.cancel()
  })
  return result.check
}

/** Reachability plus whether the configured models are installed. */
export async function probeOllama(): Promise<OllamaCheck> {
  const tags = await probe(async (signal): Promise<unknown> =>
    (await fetchOk(`${WORKER_CONFIG.ollamaUrl}/api/tags`, signal)).json(),
  )
  return {
    ...tags.check,
    models: ollamaModelStatus(tags.value, {
      embed: WORKER_CONFIG.ollamaEmbedModel,
      llm: WORKER_CONFIG.ollamaLlmModel,
    }),
  }
}

async function loadQueueSummary(): Promise<QueueSummary | null> {
  const counts = await probe(loadQueueCounts)
  return counts.value ? queueSummary(counts.value) : null
}

/**
 * Health of the worker and the services it depends on, probed from the app
 * server so a dead worker cannot hide the problem. Carries no internal URLs.
 */
export async function collectSystemStatus(): Promise<SystemStatus> {
  const [database, redis, ocr, ollama, queue] = await Promise.all([
    probeDatabase(),
    probeRedis(),
    probeOcr(),
    probeOllama(),
    loadQueueSummary(),
  ])
  return {
    checkedAt: new Date().toISOString(),
    worker: summarizeHeartbeat(redis),
    services: { database, redis: redis.check, ocr, ollama },
    queue,
  }
}
