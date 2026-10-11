import { beforeEach, expect, test, vi } from 'vitest'
import { createDbStub } from '@/test/db-stub'

const stub = createDbStub()
const enqueueReprocessing = vi.fn()
vi.doMock('@/db', () => ({ db: stub.db }))
vi.doMock('@/db/processing-jobs', () => ({ enqueueReprocessing }))
const embeddings = await import('./embeddings')

beforeEach(() => {
  stub.reset()
  enqueueReprocessing.mockReset()
})

test('reports how many embeddings were cleared', async () => {
  stub.results.push(Object.assign([], { count: 2 }))
  expect(await embeddings.clearAllEmbeddings()).toBe(2)
})

test('queues embedding jobs page by page and sums the results', async () => {
  const ids = Array.from({ length: 100 }, (_, i) => ({ id: `doc-${i}` }))
  stub.results.push(ids, [{ id: 'last' }])
  enqueueReprocessing
    .mockResolvedValueOnce({ queued: ids.slice(1), skipped: [ids[0]] })
    .mockResolvedValueOnce({ queued: [{ id: 'last' }], skipped: [] })
  expect(await embeddings.enqueueReembedding(false)).toEqual({
    queued: 100,
    skipped: 1,
  })
  expect(enqueueReprocessing).toHaveBeenCalledTimes(2)
  expect(enqueueReprocessing).toHaveBeenLastCalledWith(['last'], 'embedding')
})

test('stops right away when nothing needs an embedding', async () => {
  stub.results.push([])
  expect(await embeddings.enqueueReembedding(true)).toEqual({
    queued: 0,
    skipped: 0,
  })
  expect(enqueueReprocessing).not.toHaveBeenCalled()
})
