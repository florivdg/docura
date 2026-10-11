import { expect, test, vi } from 'vitest'
import { createDbStub } from '@/test/db-stub'

const stub = createDbStub()
vi.doMock('@/db', () => ({ db: stub.db }))
const { cleanupTrash } = await import('./trash-cleanup')

test('removes the expired trashed documents as the trash cleanup', async () => {
  stub.reset()
  stub.results.push([
    { name: 'A', storagePath: 'gone-a.pdf' },
    { name: 'B', storagePath: 'gone-b.pdf' },
  ])
  expect(await cleanupTrash(new Date('2026-06-01T00:00:00Z'))).toBe(2)
  expect(stub.queries).toEqual(['delete', 'insert'])
  expect(stub.writes[0]).toEqual([
    expect.objectContaining({
      action: 'deleted',
      actorType: 'system',
      actorId: null,
      actorName: 'Papierkorb-Bereinigung',
    }),
    expect.objectContaining({ documentName: 'B' }),
  ])
})

test('reports 0 without expired documents', async () => {
  stub.reset()
  stub.results.push([])
  expect(await cleanupTrash()).toBe(0)
})
