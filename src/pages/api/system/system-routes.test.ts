import { expect, test, vi } from 'vitest'
import { createDbStub } from '@/test/db-stub'
import { routeCaller } from '@/test/route-call'

const collectSystemStatus = vi.fn(async () => ({ checkedAt: 'now' }))
vi.doMock('@/lib/server/system-status', () => ({ collectSystemStatus }))
const status = await import('./status')
const call = routeCaller(createDbStub(), '')

test('serves the collected status without caching', async () => {
  const response = await call(status.GET)
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  expect(await response.json()).toEqual({ checkedAt: 'now' })
})
