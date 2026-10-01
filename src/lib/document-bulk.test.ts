import { expect, test } from 'vitest'
import {
  validateBulkDocumentRequest,
  bulkDocumentUpdates,
} from './document-bulk'
const id = '11111111-1111-4111-8111-111111111111'
test('deduplicates bulk documents and tags while retaining limits', () => {
  expect(
    validateBulkDocumentRequest({
      ids: [id, id],
      action: 'addTags',
      tagIds: [id, id],
    }),
  ).toEqual({ ids: [id], action: 'addTags', folderId: null, tagIds: [id] })
  for (const body of [
    null,
    { ids: [], action: 'trash' },
    { ids: Array(101).fill(id), action: 'trash' },
    { ids: ['bad'], action: 'trash' },
    { ids: [id], action: 'unknown' },
    { ids: [id], action: 'move', folderId: 7 },
    { ids: [id], action: 'addTags', tagIds: [] },
    { ids: [id], action: 'addTags', tagIds: [7] },
  ])
    expect(() => validateBulkDocumentRequest(body)).toThrow()
})
test('bulk update payloads preserve move, restore, trash and favorite semantics', () => {
  const now = new Date('2026-01-01')
  const request = (action: string) =>
    validateBulkDocumentRequest({ ids: [id], action })
  expect(bulkDocumentUpdates(request('move'))).toEqual({ folderId: null })
  expect(bulkDocumentUpdates(request('restore'))).toEqual({ trashedAt: null })
  expect(bulkDocumentUpdates(request('trash'), now)).toEqual({ trashedAt: now })
  expect(bulkDocumentUpdates(request('favorite'))).toEqual({ isFavorite: true })
  expect(bulkDocumentUpdates(request('unfavorite'))).toEqual({
    isFavorite: false,
  })
})
