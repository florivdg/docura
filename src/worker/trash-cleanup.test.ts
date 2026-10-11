import { expect, test, vi } from 'vitest'
import { createDbStub } from '@/test/db-stub'

const stub = createDbStub()
vi.doMock('@/db', () => ({ db: stub.db }))
const { cleanupTrash } = await import('./trash-cleanup')

test('removes the expired trashed documents in one statement', async () => {
  stub.reset()
  stub.results.push([
    { storagePath: 'gone-a.pdf' },
    { storagePath: 'gone-b.pdf' },
  ])
  expect(await cleanupTrash(new Date('2026-06-01T00:00:00Z'))).toBe(2)
  expect(stub.queries).toEqual(['delete'])
})

test('reports 0 without expired documents', async () => {
  stub.reset()
  stub.results.push([])
  expect(await cleanupTrash()).toBe(0)
})
