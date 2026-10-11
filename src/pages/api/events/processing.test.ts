import { expect, test, vi } from 'vitest'
import type { APIContext } from 'astro'

const redis = vi.hoisted(() => ({
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  close: vi.fn(),
}))
vi.mock('@/lib/redis', () => ({
  createRedis: () => redis,
  PROCESSING_CHANNEL: 'processing_updates',
}))
const { GET } = await import('./processing')

test('forwards notifications and unsubscribes when the client leaves', async () => {
  let deliver: (message: string) => void = () => {}
  redis.subscribe.mockImplementation(async (_channel, listener) => {
    deliver = listener
  })
  redis.unsubscribe.mockRejectedValue(new Error('already unsubscribed'))
  const response = await GET({} as APIContext)
  expect(response.headers.get('Content-Type')).toBe('text/event-stream')
  const reader = response.body!.getReader()
  expect((await reader.read()).value).toBe('data: {"type":"connected"}\n\n')
  deliver('{"type":"completed"}')
  expect((await reader.read()).value).toBe('data: {"type":"completed"}\n\n')
  await reader.cancel()
  await vi.waitFor(() => expect(redis.close).toHaveBeenCalledTimes(1))
  expect(redis.subscribe).toHaveBeenCalledWith(
    'processing_updates',
    expect.any(Function),
  )
  deliver('{"type":"failed"}')
})
