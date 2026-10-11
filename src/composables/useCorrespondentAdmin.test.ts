import { afterEach, expect, test, vi } from 'vitest'
import { documentsHref, useCorrespondentAdmin } from './useCorrespondentAdmin'

const apiFetch = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-fetch', () => ({ apiFetch }))

const telekom = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Telekom',
  createdAt: '2026-01-01T00:00:00Z',
  documentCount: 2,
}
const allianz = {
  ...telekom,
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Allianz',
  documentCount: 1,
}

function respond(status: number, body: unknown) {
  apiFetch.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

async function loaded() {
  respond(200, { correspondents: [allianz, telekom] })
  const state = useCorrespondentAdmin()
  await state.fetchCorrespondents()
  return state
}

afterEach(() => apiFetch.mockReset())

test('loads correspondents and reports load failures', async () => {
  const state = await loaded()
  expect(state.correspondents.value).toEqual([allianz, telekom])
  expect(state.loading.value).toBe(false)
  expect(apiFetch).toHaveBeenCalledWith(
    '/api/correspondents?counts=1',
    expect.anything(),
  )
  respond(500, {})
  await state.fetchCorrespondents()
  expect(state.error.value).toBe(
    'Korrespondenten konnten nicht geladen werden.',
  )
})

test('a later save clears a stale error so its notice shows', async () => {
  const state = await loaded()
  respond(409, { error: 'Löschen fehlgeschlagen' })
  await state.remove(telekom)
  expect(state.error.value).toBe('Löschen fehlgeschlagen')
  expect(state.correspondents.value).toHaveLength(2)
  state.saved({ id: telekom.id, name: 'Deutsche Telekom' }, 'renamed')
  expect(state.error.value).toBe('')
  expect(state.notice.value).toContain('wurde umbenannt')
  expect(state.correspondents.value.map((c) => c.name)).toEqual([
    'Allianz',
    'Deutsche Telekom',
  ])
})

test('saved adds new correspondents in sorted order', async () => {
  const state = await loaded()
  state.saved(
    { id: '33333333-3333-4333-8333-333333333333', name: 'Bahn' },
    'created',
  )
  expect(state.notice.value).toBe('Korrespondent „Bahn“ wurde angelegt.')
  expect(state.correspondents.value.map((c) => c.name)).toEqual([
    'Allianz',
    'Bahn',
    'Telekom',
  ])
})

test('remove drops the row and its selection', async () => {
  const state = await loaded()
  state.selectedIds.value = [telekom.id, allianz.id]
  apiFetch.mockResolvedValueOnce(new Response(null, { status: 204 }))
  await state.remove(telekom)
  expect(state.correspondents.value).toEqual([allianz])
  expect(state.selectedIds.value).toEqual([allianz.id])
  expect(state.notice.value).toBe('Korrespondent „Telekom“ wurde gelöscht.')
})

test('merge sends the other selected ids and refetches counts', async () => {
  const state = await loaded()
  state.selectedIds.value = [telekom.id, allianz.id]
  expect(state.selected.value).toEqual([allianz, telekom])
  respond(200, { correspondent: telekom, movedDocuments: 1 })
  respond(200, { correspondents: [{ ...telekom, documentCount: 3 }] })
  await state.merge(telekom.id)
  const [, init] = apiFetch.mock.calls[1]
  expect(JSON.parse(init.body)).toEqual({
    targetId: telekom.id,
    sourceIds: [allianz.id],
  })
  expect(state.selectedIds.value).toEqual([])
  expect(state.notice.value).toContain('1 Dokument neu zugeordnet')
  expect(state.correspondents.value).toEqual([{ ...telekom, documentCount: 3 }])
})

test('merge keeps the selection when the request fails', async () => {
  const state = await loaded()
  state.selectedIds.value = [telekom.id, allianz.id]
  respond(400, { error: 'Ungültig' })
  await state.merge(telekom.id)
  expect(state.error.value).toBe('Ungültig')
  expect(state.notice.value).toBe('')
  expect(state.selectedIds.value).toEqual([telekom.id, allianz.id])
})

test('documentsHref filters the document list by correspondent', () => {
  expect(documentsHref(telekom.id)).toContain(telekom.id)
  expect(documentsHref(telekom.id)).toMatch(/^\/documents\?/)
})
