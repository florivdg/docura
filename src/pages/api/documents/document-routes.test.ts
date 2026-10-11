import { expect, test, vi } from 'vitest'
import { createDbStub } from '@/test/db-stub'
import { detailFixture } from '@/test/document-fixture'
import { routeCaller } from '@/test/route-call'
const stub = createDbStub()
vi.doMock('@/db', () => ({ db: stub.db }))
const detail = await import('./[id]')
const list = await import('./index')
const search = await import('./search')
const bulk = await import('./bulk')
const trash = await import('./trash')
const id = detailFixture().id
const call = routeCaller(stub, id)
test('returns 400 and 404 without modifying a document', async () => {
  expect((await call(detail.GET, { id: 'bad' })).status).toBe(400)
  expect((await call(detail.GET)).status).toBe(404)
  expect((await call(detail.DELETE)).status).toBe(404)
  expect((await call(detail.PATCH)).status).toBe(404)
  expect(stub.writes).toEqual([])
})
test('PATCH preserves the response shape and writes normalized updates', async () => {
  stub.results.push([{ id }], [], [detailFixture()], [], [])
  const response = await call(detail.PATCH, {
    body: { name: ' Rechnung ', folderId: null },
  })
  expect(response.status).toBe(200)
  expect(stub.writes).toEqual([{ name: 'Rechnung', folderId: null }])
  expect((await response.json()).document.id).toBe(id)
})
test('PATCH rejects malformed JSON and validates missing tags', async () => {
  stub.results.push([{ id }])
  expect((await call(detail.PATCH, { body: null })).status).toBe(400)
  stub.results.push([{ id }], [])
  expect((await call(detail.PATCH, { body: { tagIds: [id] } })).status).toBe(
    404,
  )
})
test('DELETE guards permanent deletion and already trashed documents', async () => {
  stub.results.push([{ id, storagePath: 'file.pdf', trashedAt: null }])
  expect((await call(detail.DELETE, { path: '/?permanent=true' })).status).toBe(
    400,
  )
  stub.results.push([{ id, trashedAt: new Date() }])
  expect((await call(detail.DELETE)).status).toBe(409)
  stub.results.push([{ id, trashedAt: null }], [])
  expect((await call(detail.DELETE)).status).toBe(200)
  expect(stub.writes[0]).toHaveProperty('trashedAt')
})
test('list and search validate filters and keep distinct empty result shapes', async () => {
  expect((await call(list.GET, { path: '/?view=bad' })).status).toBe(400)
  expect((await call(search.GET, { path: '/?tagIds=bad' })).status).toBe(400)
  const empty = await call(search.GET, { path: '/?q=' })
  expect(await empty.json()).toEqual({
    results: [],
    total: 0,
    page: 1,
    pageSize: 20,
  })
  stub.results.push([{ count: 0 }], [])
  const listing = await call(list.GET, { path: '/?page=bad' })
  expect(await listing.json()).toEqual({
    documents: [],
    total: 0,
    page: 1,
    pageSize: 20,
  })
})
test('fulltext search returns tagged rows with pagination', async () => {
  stub.results.push(
    [{ count: 1 }],
    [{ id, name: 'Rechnung' }],
    [{ documentId: id, tagId: id, tagName: 'Steuer', tagColor: null }],
  )
  const response = await call(search.GET, {
    path: '/?q=Rechnung&sort=name&order=asc',
  })
  const data = await response.json()
  expect(data.total).toBe(1)
  expect(data.results[0].tags).toEqual([{ id, name: 'Steuer', color: null }])
  const single = await call(search.GET, { path: '/?q=a' })
  expect((await single.json()).results).toEqual([])
})

test('bulk actions validate all records and return a unique document count', async () => {
  expect(
    (await call(bulk.POST, { body: { ids: [id], action: 'favorite' } })).status,
  ).toBe(404)
  stub.results.push([{ id }], [])
  const response = await call(bulk.POST, {
    body: { ids: [id, id], action: 'favorite' },
  })
  expect(await response.json()).toEqual({ success: true, count: 1 })
  expect(stub.writes).toEqual([{ isFavorite: true }])
  stub.results.push([{ id }], [{ id }], [])
  expect(
    (
      await call(bulk.POST, {
        body: { ids: [id], action: 'addTags', tagIds: [id, id] },
      })
    ).status,
  ).toBe(200)
  expect(stub.writes[1]).toEqual([{ documentId: id, tagId: id }])
})

test('emptying the trash validates the action and deletes trashed rows', async () => {
  expect((await call(trash.GET)).status).toBe(200)
  expect((await call(trash.POST, { body: '{' })).status).toBe(400)
  expect((await call(trash.POST, { body: { action: 'x' } })).status).toBe(400)
  stub.results.push([{ id, storagePath: 'missing-trash-test.pdf' }], [])
  const response = await call(trash.POST, { body: { action: 'empty' } })
  expect(await response.json()).toEqual({ success: true, deleted: 1 })
})
