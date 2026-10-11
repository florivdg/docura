import { expect, test, vi } from 'vitest'
import { createDbStub } from '@/test/db-stub'
import { routeCaller } from '@/test/route-call'

const probeDatabase = vi.fn(async () => ({
  status: 'ok' as 'ok' | 'error',
  latencyMs: 1 as number | null,
  error: null as string | null,
}))
vi.doMock('@/lib/server/system-status', () => ({ probeDatabase }))
const health = await import('./health')
const call = routeCaller(createDbStub(), '')

test('reports a reachable database with 200 and without caching', async () => {
  const response = await call(health.GET)
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  expect(await response.json()).toEqual({ status: 'ok', database: 'ok' })
})

test('reports an unreachable database with 503 and no details', async () => {
  probeDatabase.mockResolvedValueOnce({
    status: 'error',
    latencyMs: null,
    error: 'Nicht erreichbar',
  })
  const response = await call(health.GET)
  expect(response.status).toBe(503)
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  expect(await response.json()).toEqual({
    status: 'error',
    database: 'error',
  })
})
