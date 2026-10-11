import { RedisClient } from 'bun'

/** Pub/sub channel for processing progress (worker → SSE endpoint). */
export const PROCESSING_CHANNEL = 'processing_updates'

/** Key the worker refreshes while it is alive; it expires via its TTL. */
export const WORKER_HEARTBEAT_KEY = 'docura:worker:heartbeat'

/** A new connection; subscribers need their own, everything else shares one. */
export function createRedis(): RedisClient {
  return new RedisClient(process.env.REDIS_URL)
}

let shared: RedisClient | undefined

/** The process-wide connection for commands and publishing. */
export function sharedRedis(): RedisClient {
  shared ??= createRedis()
  return shared
}

/** The raw heartbeat JSON, or null when no worker is alive. */
export function readWorkerHeartbeat(): Promise<string | null> {
  return sharedRedis().get(WORKER_HEARTBEAT_KEY)
}
