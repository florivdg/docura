import { RedisClient } from 'bun'

import { WORKER_CONFIG } from '@/worker/config'
import type { ProcessingNotification } from '@/worker/types'

const redis = new RedisClient(WORKER_CONFIG.redisUrl)

export async function notifyProcessingUpdate(
  payload: ProcessingNotification,
): Promise<void> {
  try {
    await redis.publish('processing_updates', JSON.stringify(payload))
  } catch (error) {
    console.warn(
      'Redis-Benachrichtigung fehlgeschlagen:',
      error instanceof Error ? error.message : String(error),
    )
  }
}
