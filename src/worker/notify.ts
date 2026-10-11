import { PROCESSING_CHANNEL, sharedRedis } from '@/lib/redis'
import type { ProcessingNotification } from '@/worker/types'

export async function notifyProcessingUpdate(
  payload: ProcessingNotification,
): Promise<void> {
  try {
    await sharedRedis().publish(PROCESSING_CHANNEL, JSON.stringify(payload))
  } catch (error) {
    console.warn(
      'Redis-Benachrichtigung fehlgeschlagen:',
      error instanceof Error ? error.message : String(error),
    )
  }
}
