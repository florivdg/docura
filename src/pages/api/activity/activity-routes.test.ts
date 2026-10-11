import { expect, test, vi } from 'vitest'
import { createDbStub } from '@/test/db-stub'
import { routeCaller } from '@/test/route-call'

const stub = createDbStub()
vi.doMock('@/db', () => ({ db: stub.db }))
const recent = await import('./index')
const history = await import('../documents/[id]/activity')

const id = '11111111-1111-4111-8111-111111111111'
const call = routeCaller(stub, id)

test('the document history validates the id and the document', async () => {
  const bad = await call(history.GET, { id: 'bad' })
  expect(bad.status).toBe(400)
  expect(await bad.json()).toEqual({ error: 'Ungültige Dokument-ID' })
  const missing = await call(history.GET)
  expect(missing.status).toBe(404)
  expect(await missing.json()).toEqual({ error: 'Dokument nicht gefunden' })
  expect(stub.queries).toEqual(['select'])
})

test('the document history returns a page of entries with the total', async () => {
  const entry = { id: 'e1', action: 'uploaded' }
  // The count runs first: the entry query only starts when awaited.
  stub.results.push([{ id }], [{ total: 21 }], [entry])
  const response = await call(history.GET, { path: '/?page=2&size=50' })
  expect(await response.json()).toEqual({
    entries: [entry],
    total: 21,
    page: 2,
    pageSize: 50,
  })
})

test('the dashboard returns the newest groups', async () => {
  stub.results.push([
    {
      batchId: 'b',
      action: 'trashed',
      count: 2,
      documentId: null,
      documentName: 'Alt.pdf',
    },
  ])
  const response = await call(recent.GET, { path: '/?limit=5' })
  expect(await response.json()).toEqual({
    entries: [
      {
        batchId: 'b',
        action: 'trashed',
        count: 2,
        document: { id: null, name: 'Alt.pdf' },
      },
    ],
  })
})
