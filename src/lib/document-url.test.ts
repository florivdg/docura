import { expect, test } from 'vitest'
import {
  parseDocumentUrl,
  documentUrlParams,
  documentApiParams,
} from './document-url'

test('restores all document filter values from a URL', () => {
  const state = parseDocumentUrl(
    '?view=trash&q=Steuer&mode=semantic&folders=f1,f2&tags=t1&correspondents=c1&status=failed&sort=name&order=asc&page=3&size=50',
  )
  expect(state).toEqual({
    view: 'trash',
    query: 'Steuer',
    searchMode: 'semantic',
    folderIds: ['f1', 'f2'],
    tagIds: ['t1'],
    correspondentIds: ['c1'],
    statuses: ['failed'],
    sortColumn: 'name',
    sortOrder: 'asc',
    page: 3,
    pageSize: 50,
  })
})
test('falls back on unsupported view, ordering and pagination', () => {
  const state = parseDocumentUrl(
    '?view=no&mode=no&sort=no&order=no&page=no&size=7&folders=,,',
  )
  expect(state.view).toBe('all')
  expect(state.searchMode).toBe('fulltext')
  expect(state.sortColumn).toBeNull()
  expect(state.sortOrder).toBe('desc')
  expect(state.page).toBe(1)
  expect(state.pageSize).toBe(20)
  expect(state.folderIds).toEqual([])
})

test('URL serialization round-trips filters and uses different API key names', () => {
  const state = parseDocumentUrl(
    '?view=archive&q=Steuer&mode=semantic&folders=f1&tags=t1&correspondents=c1&status=failed&sort=name&order=asc&page=3&size=50',
  )
  expect(parseDocumentUrl(documentUrlParams(state).toString())).toEqual(state)
  const api = documentApiParams(state)
  expect(api.get('folderIds')).toBe('f1')
  expect(api.get('tagIds')).toBe('t1')
  expect(api.get('correspondentIds')).toBe('c1')
  expect(api.get('order')).toBe('asc')
  expect(documentUrlParams(parseDocumentUrl('')).toString()).toBe('')
})
