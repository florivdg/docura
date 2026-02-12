import { RedisClient } from 'bun'

import type { ProcessingNotification } from '@/worker/types'

const redis = new RedisClient()

export async function notifyProcessingUpdate(
  payload: ProcessingNotification,
): Promise<void> {
  try {
    await redis.publish('processing_updates', JSON.stringify(payload))
  } catch {
    // Non-fatal — notification is best-effort
  }
}
