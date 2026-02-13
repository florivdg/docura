import { RedisClient } from 'bun'

import type { APIRoute } from 'astro'

export const GET: APIRoute = async () => {
  const redis = new RedisClient()

  let closed = false
  let keepaliveInterval: ReturnType<typeof setInterval> | null = null

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(`data: ${JSON.stringify({ type: 'connected' })}\n\n`)

      keepaliveInterval = setInterval(() => {
        if (!closed) {
          try {
            controller.enqueue(': keepalive\n\n')
          } catch {
            /* closed */
          }
        }
      }, 30_000)

      await redis.subscribe('processing_updates', (message) => {
        if (closed) return
        try {
          controller.enqueue(`data: ${message}\n\n`)
        } catch {
          void cleanup(controller)
        }
      })
    },
    cancel() {
      void cleanup()
    },
  })

  async function cleanup(controller?: ReadableStreamDefaultController) {
    if (closed) return
    closed = true
    if (keepaliveInterval) {
      clearInterval(keepaliveInterval)
      keepaliveInterval = null
    }
    try {
      await redis.unsubscribe('processing_updates')
    } catch {
      /* already unsubscribed */
    }
    try {
      redis.close()
    } catch {
      /* already closed */
    }
    try {
      controller?.close()
    } catch {
      /* already closed */
    }
  }

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
