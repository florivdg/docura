import { afterEach, expect, test, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { useDocumentsFilter } from './useDocumentsFilter'
const scopes: ReturnType<typeof effectScope>[] = []
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
  history.replaceState(null, '', '/documents')
})
function filter() {
  const scope = effectScope()
  scopes.push(scope)
  return scope.run(useDocumentsFilter)!
}
test('loads documents with restored filters and switches sort through three states', async () => {
  history.replaceState(null, '', '/documents?folders=f1&size=50')
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(
      new Response(JSON.stringify({ documents: [{ id: 'a' }], total: 1 })),
    )
  const state = filter()
  await state.fetchDocuments()
  expect(fetch.mock.calls[0][0]).toContain('folderIds=f1')
  expect(state.documents.value).toEqual([{ id: 'a' }])
  state.toggleSort('name')
  expect(state.sortOrder.value).toBe('asc')
  state.toggleSort('name')
  expect(state.sortOrder.value).toBe('desc')
  state.toggleSort('name')
  expect(state.sortColumn.value).toBeNull()
  await nextTick()
})
test('searches with trimmed queries and clamps pages to available results', async () => {
  history.replaceState(
    null,
    '',
    '/documents?q=%20Steuer%20&mode=semantic&page=3',
  )
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(
      async () =>
        new Response(JSON.stringify({ results: [{ id: 'a' }], total: 1 })),
    )
  const state = filter()
  await state.fetchDocuments()
  expect(fetch.mock.calls[0][0]).toContain('/api/documents/search?')
  expect(fetch.mock.calls[0][0]).toContain('q=Steuer')
  expect(state.currentPage.value).toBe(1)
  expect(state.documents.value).toEqual([{ id: 'a' }])
  await nextTick()
  expect(location.search).toContain('q=Steuer')
})
test('clears result filters and handles a failed request', async () => {
  history.replaceState(
    null,
    '',
    '/documents?q=test&folders=f1&tags=t1&status=failed',
  )
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(Error('offline'))
  const state = filter()
  expect(state.hasActiveFilters.value).toBe(true)
  await state.fetchDocuments()
  expect(state.loading.value).toBe(false)
  expect(state.documents.value).toEqual([])
  state.clearFilters()
  await nextTick()
  expect(state.hasActiveFilters.value).toBe(false)
})
