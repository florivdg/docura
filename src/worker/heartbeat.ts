import { hostname } from 'node:os'

import packageJson from '../../package.json'
import { sharedRedis, WORKER_HEARTBEAT_KEY } from '@/lib/redis'
import {
  WORKER_HEARTBEAT_TTL_SECONDS,
  type WorkerHeartbeat,
} from '@/lib/system-status'
import { WORKER_CONFIG } from '@/worker/config'

type WorkerIdentity = Omit<WorkerHeartbeat, 'lastSeen'>

export function workerIdentity(concurrency: number): WorkerIdentity {
  return {
    pid: process.pid,
    hostname: hostname(),
    concurrency,
    startedAt: new Date().toISOString(),
    version: packageJson.version,
    embedModel: WORKER_CONFIG.ollamaEmbedModel,
    llmModel: WORKER_CONFIG.ollamaLlmModel,
  }
}

let warned = false

/**
 * Refreshes the liveness key; it expires on its own when the worker dies.
 * A Redis outage is logged once, not on every tick.
 */
export async function publishWorkerHeartbeat(
  identity: WorkerIdentity,
): Promise<void> {
  const payload: WorkerHeartbeat = {
    ...identity,
    lastSeen: new Date().toISOString(),
  }
  try {
    await sharedRedis().set(
      WORKER_HEARTBEAT_KEY,
      JSON.stringify(payload),
      'EX',
      WORKER_HEARTBEAT_TTL_SECONDS,
    )
    warned = false
  } catch (error) {
    if (!warned) console.warn('Worker-Heartbeat fehlgeschlagen:', error)
    warned = true
  }
}

/** Removes the liveness key on a graceful shutdown. */
export async function clearWorkerHeartbeat(): Promise<void> {
  try {
    await sharedRedis().del(WORKER_HEARTBEAT_KEY)
  } catch {
    // The key expires on its own.
  }
}
