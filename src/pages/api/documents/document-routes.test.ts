import { beforeEach, expect, test, vi } from 'vitest'
import type { APIContext, APIRoute } from 'astro'
import { createDbStub } from '@/test/db-stub'
import { detailFixture } from '@/test/document-fixture'
const stub = createDbStub()
vi.doMock('@/db', () => ({ db: stub.db }))
const detail = await import('./[id]')
const list = await import('./index')
const search = await import('./search')
const bulk = await import('./bulk')
const id = detailFixture().id
beforeEach(() => {
  stub.results.length = 0
  stub.writes.length = 0
})
async function call(
  route: APIRoute,
  path = '/',
  body?: unknown,
  documentId = id,
) {
  const response = await route({
    params: { id: documentId },
    url: new URL(path, 'http://localhost'),
    request: new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  } as unknown as APIContext)
  return response as Response
}
test('returns 400 and 404 without modifying a document', async () => {
  expect((await call(detail.GET, '/', undefined, 'bad')).status).toBe(400)
  expect((await call(detail.GET)).status).toBe(404)
  expect((await call(detail.DELETE)).status).toBe(404)
  expect((await call(detail.PATCH)).status).toBe(404)
  expect(stub.writes).toEqual([])
})
test('PATCH preserves the response shape and writes normalized updates', async () => {
  stub.results.push([{ id }], [], [detailFixture()], [], [])
  const response = await call(detail.PATCH, '/', {
    name: ' Rechnung ',
    folderId: null,
  })
  expect(response.status).toBe(200)
  expect(stub.writes).toEqual([{ name: 'Rechnung', folderId: null }])
  expect((await response.json()).document.id).toBe(id)
})
test('PATCH rejects malformed JSON and validates missing tags', async () => {
  stub.results.push([{ id }])
  expect((await call(detail.PATCH, '/', null)).status).toBe(400)
  stub.results.push([{ id }], [])
  expect((await call(detail.PATCH, '/', { tagIds: [id] })).status).toBe(404)
})
test('DELETE guards permanent deletion and already trashed documents', async () => {
  stub.results.push([{ id, storagePath: 'file.pdf', trashedAt: null }])
  expect((await call(detail.DELETE, '/?permanent=true')).status).toBe(400)
  stub.results.push([{ id, trashedAt: new Date() }])
  expect((await call(detail.DELETE)).status).toBe(409)
  stub.results.push([{ id, trashedAt: null }], [])
  expect((await call(detail.DELETE)).status).toBe(200)
  expect(stub.writes[0]).toHaveProperty('trashedAt')
})
test('list and search validate filters and keep distinct empty result shapes', async () => {
  expect((await call(list.GET, '/?view=bad')).status).toBe(400)
  expect((await call(search.GET, '/?tagIds=bad')).status).toBe(400)
  const empty = await call(search.GET, '/?q=')
  expect(await empty.json()).toEqual({
    results: [],
    total: 0,
    page: 1,
    pageSize: 20,
  })
  stub.results.push([{ count: 0 }], [])
  const listing = await call(list.GET, '/?page=bad')
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
  const response = await call(search.GET, '/?q=Rechnung&sort=name&order=asc')
  const data = await response.json()
  expect(data.total).toBe(1)
  expect(data.results[0].tags).toEqual([{ id, name: 'Steuer', color: null }])
  const single = await call(search.GET, '/?q=a')
  expect((await single.json()).results).toEqual([])
})

test('bulk actions validate all records and return a unique document count', async () => {
  expect(
    (await call(bulk.POST, '/', { ids: [id], action: 'favorite' })).status,
  ).toBe(404)
  stub.results.push([{ id }], [])
  const response = await call(bulk.POST, '/', {
    ids: [id, id],
    action: 'favorite',
  })
  expect(await response.json()).toEqual({ success: true, count: 1 })
  expect(stub.writes).toEqual([{ isFavorite: true }])
  stub.results.push([{ id }], [{ id }], [])
  expect(
    (
      await call(bulk.POST, '/', {
        ids: [id],
        action: 'addTags',
        tagIds: [id, id],
      })
    ).status,
  ).toBe(200)
  expect(stub.writes[1]).toEqual([{ documentId: id, tagId: id }])
})
