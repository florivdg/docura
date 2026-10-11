import { expect, test, vi } from 'vitest'
import { createDbStub } from '@/test/db-stub'
import { routeCaller } from '@/test/route-call'

const stub = createDbStub()
vi.doMock('@/db', () => ({ db: stub.db }))
const list = await import('./index')
const detail = await import('./[id]')
const merge = await import('./merge')

const target = '11111111-1111-4111-8111-111111111111'
const source = '22222222-2222-4222-8222-222222222222'
const other = '33333333-3333-4333-8333-333333333333'

const call = routeCaller(stub, target)

function uniqueViolation() {
  return Object.assign(new Error('duplicate key'), {
    cause: { errno: '23505' },
  })
}

test('GET lists correspondents, with document counts only on request', async () => {
  const lean = [{ id: target, name: 'Telekom' }]
  stub.results.push(lean)
  expect(await (await call(list.GET)).json()).toEqual({ correspondents: lean })
  const counted = [{ ...lean[0], createdAt: '2026-01-01', documentCount: 3 }]
  stub.results.push(counted)
  const response = await call(list.GET, { path: '/?counts=1' })
  expect(await response.json()).toEqual({ correspondents: counted })
})

test('POST trims the name and reports whether it was created', async () => {
  const telekom = { id: target, name: 'Telekom' }
  stub.results.push([], [telekom])
  const created = await call(list.POST, { body: { name: '  Telekom ' } })
  expect(created.status).toBe(201)
  expect(await created.json()).toEqual({
    correspondent: telekom,
    created: true,
  })
  expect(stub.writes).toEqual([{ name: 'Telekom' }])
  stub.results.push([telekom])
  const existing = await call(list.POST, { body: { name: 'telekom' } })
  expect(existing.status).toBe(200)
  expect((await existing.json()).created).toBe(false)
  expect((await call(list.POST, { body: { name: ' ' } })).status).toBe(400)
  expect((await call(list.POST, { body: '{' })).status).toBe(400)
})

test('POST returns the winner of a lost race and fails if it vanished', async () => {
  const winner = { id: source, name: 'TELEKOM' }
  stub.results.push([], uniqueViolation(), [winner])
  const response = await call(list.POST, { body: { name: 'Telekom' } })
  expect(await response.json()).toEqual({
    correspondent: winner,
    created: false,
  })
  stub.results.push([], uniqueViolation(), [])
  await expect(call(list.POST, { body: { name: 'Telekom' } })).rejects.toThrow(
    'konnte nicht erstellt werden',
  )
  stub.results.push([], new Error('connection lost'))
  await expect(call(list.POST, { body: { name: 'Telekom' } })).rejects.toThrow(
    'connection lost',
  )
})

test('PATCH renames with a trimmed name', async () => {
  stub.results.push([{ id: target, name: 'Deutsche Telekom AG' }])
  const response = await call(detail.PATCH, {
    body: { name: ' Deutsche Telekom AG ' },
  })
  expect(response.status).toBe(200)
  expect(stub.writes).toEqual([{ name: 'Deutsche Telekom AG' }])
  expect((await response.json()).correspondent.name).toBe('Deutsche Telekom AG')
})

test('PATCH validates id and name and reports unknown ids', async () => {
  const status = async (body: unknown, id?: string) =>
    (await call(detail.PATCH, { body, id })).status
  expect(await status({ name: 'A' }, 'bad')).toBe(400)
  expect(await status({ name: '' })).toBe(400)
  expect(await status({ name: 'x'.repeat(121) })).toBe(400)
  expect(await status([])).toBe(400)
  expect(stub.writes).toEqual([])
  stub.results.push([])
  const missing = await call(detail.PATCH, { body: { name: 'A' } })
  expect(missing.status).toBe(404)
  expect(await missing.json()).toEqual({
    error: 'Korrespondent nicht gefunden',
  })
})

test('PATCH turns a case-insensitive name conflict into a 409', async () => {
  stub.results.push(uniqueViolation())
  const response = await call(detail.PATCH, { body: { name: 'TELEKOM' } })
  expect(response.status).toBe(409)
  expect((await response.json()).error).toContain('existiert bereits')
  stub.results.push(new Error('connection lost'))
  await expect(call(detail.PATCH, { body: { name: 'A' } })).rejects.toThrow(
    'connection lost',
  )
})

test('DELETE removes known correspondents only', async () => {
  stub.results.push([{ id: target }])
  expect((await call(detail.DELETE)).status).toBe(204)
  stub.results.push([])
  expect((await call(detail.DELETE)).status).toBe(404)
  expect((await call(detail.DELETE, { id: 'bad' })).status).toBe(400)
})

test('merge moves all documents of the sources onto the target', async () => {
  const transaction = vi.spyOn(stub.db, 'transaction')
  stub.results.push(
    [{ id: source }, { id: other }],
    [{ id: target, name: 'Deutsche Telekom AG' }],
    [{ id: 'd1' }, { id: 'd2' }],
    [],
  )
  const response = await call(merge.POST, {
    body: { targetId: target, sourceIds: [source, other, source] },
  })
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    correspondent: { id: target, name: 'Deutsche Telekom AG' },
    movedDocuments: 2,
  })
  expect(stub.writes).toEqual([{ correspondentId: target }])
  expect(transaction).toHaveBeenCalledTimes(1)
})

test('merge rejects invalid requests before touching documents', async () => {
  const invalid = [
    { targetId: target, sourceIds: [] },
    { targetId: target, sourceIds: [target, source] },
    { targetId: target, sourceIds: [target.toUpperCase()] },
    { targetId: target.toUpperCase(), sourceIds: [target, source] },
    { targetId: target, sourceIds: ['bad'] },
    { targetId: 'bad', sourceIds: [source] },
    { targetId: target, sourceIds: Array(101).fill(source) },
    null,
  ]
  for (const body of invalid)
    expect((await call(merge.POST, { body })).status).toBe(400)
  const request = { body: { targetId: target, sourceIds: [source, other] } }
  stub.results.push([{ id: source }, { id: other }], [])
  expect((await call(merge.POST, request)).status).toBe(404)
  stub.results.push([{ id: source }], [{ id: target, name: 'Telekom' }])
  expect((await call(merge.POST, request)).status).toBe(404)
  expect(stub.writes).toEqual([])
})
