import type { APIRoute } from 'astro'
import { createRedis, PROCESSING_CHANNEL } from '@/lib/redis'

const KEEPALIVE_MS = 30_000

/** Runs a teardown step; it may fail when the resource is already closed. */
async function quietly(step: () => unknown): Promise<void> {
  try {
    await step()
  } catch {
    // already closed
  }
}

/** Streams the worker's processing notifications as server-sent events. */
export const GET: APIRoute = async () => {
  // Subscribing blocks a connection, so every stream gets its own.
  const redis = createRedis()

  let closed = false
  let keepaliveInterval: ReturnType<typeof setInterval> | undefined

  async function cleanup(controller?: ReadableStreamDefaultController) {
    if (closed) return
    closed = true
    clearInterval(keepaliveInterval)
    await quietly(() => redis.unsubscribe(PROCESSING_CHANNEL))
    await quietly(() => redis.close())
    await quietly(() => controller?.close())
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk: string) => {
        if (closed) return
        try {
          controller.enqueue(chunk)
        } catch {
          void cleanup(controller)
        }
      }
      send(`data: ${JSON.stringify({ type: 'connected' })}\n\n`)
      keepaliveInterval = setInterval(
        () => send(': keepalive\n\n'),
        KEEPALIVE_MS,
      )
      await redis.subscribe(PROCESSING_CHANNEL, (message) =>
        send(`data: ${message}\n\n`),
      )
    },
    cancel() {
      void cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
