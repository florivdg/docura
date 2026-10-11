import { afterEach, expect, test, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { useBulkDocumentActions } from './useBulkDocumentActions'

const apiFetch = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-fetch', () => ({ apiFetch }))

function respond(status: number, body: unknown) {
  apiFetch.mockResolvedValueOnce(Response.json(body, { status }))
}

function setup() {
  const documents = ref([{ id: 'a' }, { id: 'b' }])
  const query = ref('')
  const fetchDocuments = vi.fn(async () => {})
  const state = useBulkDocumentActions(documents, fetchDocuments, [query])
  return { documents, query, fetchDocuments, ...state }
}

afterEach(() => apiFetch.mockReset())

test('posts the selection, clears it and reloads the list', async () => {
  const state = setup()
  state.selectedIds.value = ['a', 'b']
  respond(200, { success: true, count: 2 })
  await state.runBulkAction({ action: 'move', folderId: null })
  expect(JSON.parse(apiFetch.mock.calls[0][1].body)).toEqual({
    ids: ['a', 'b'],
    action: 'move',
    folderId: null,
  })
  expect(state.selectedIds.value).toEqual([])
  expect(state.fetchDocuments).toHaveBeenCalledTimes(1)
  expect(state.bulkNotice.value).toBe('')
})

test('summarizes reprocessing and keeps the selection after errors', async () => {
  const state = setup()
  state.selectedIds.value = ['a', 'b']
  respond(200, {
    success: true,
    count: 2,
    queued: ['a'],
    skipped: [{ id: 'b', reason: 'running' }],
  })
  await state.runBulkAction({ action: 'reprocess' })
  expect(state.bulkNotice.value).toContain('1 Dokument zur Neuverarbeitung')
  state.selectedIds.value = ['a']
  respond(404, { error: 'Ein oder mehrere Dokumente nicht gefunden' })
  await state.runBulkAction({ action: 'reprocess' })
  expect(state.bulkError.value).toBe(
    'Ein oder mehrere Dokumente nicht gefunden',
  )
  expect(state.selectedIds.value).toEqual(['a'])
})

test('ignores empty selections and prunes ids that left the list', async () => {
  const state = setup()
  await state.runBulkAction({ action: 'favorite' })
  expect(apiFetch).not.toHaveBeenCalled()
  state.selectedIds.value = ['a', 'b']
  state.documents.value = [{ id: 'b' }]
  await nextTick()
  expect(state.selectedIds.value).toEqual(['b'])
  state.documents.value = [{ id: 'b' }, { id: 'c' }]
  await nextTick()
  expect(state.selectedIds.value).toEqual(['b'])
  state.clearSelection()
  expect(state.selectedIds.value).toEqual([])
})

test('clears the selection when the filters change', async () => {
  const state = setup()
  state.selectedIds.value = ['a']
  state.query.value = 'Rechnung'
  await nextTick()
  expect(state.selectedIds.value).toEqual([])
})
