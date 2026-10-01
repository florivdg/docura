import { expect, test } from 'vitest'
import {
  readDocumentFilters,
  filterValidationError,
  viewValidationError,
  readDocumentPagination,
} from './document-filters'
const id = '11111111-1111-4111-8111-111111111111'
test('list and search filters share UUID and status validation', () => {
  expect(
    filterValidationError(
      readDocumentFilters(
        new URLSearchParams(
          `folderIds=${id}&tagIds=${id}&correspondentIds=${id}&status=pending,failed`,
        ),
      ),
    ),
  ).toBeNull()
  for (const key of ['folderIds', 'tagIds', 'correspondentIds', 'status'])
    expect(
      filterValidationError(
        readDocumentFilters(new URLSearchParams(`${key}=invalid`)),
      ),
    ).not.toBeNull()
  expect(viewValidationError('trash')).toBeNull()
  expect(viewValidationError('invalid')).toBe('Ungültiger View-Parameter')
})
test('pagination preserves relevance defaults and bounds invalid pages', () => {
  expect(readDocumentPagination(new URLSearchParams()).sortColumn).toBeNull()
  expect(
    readDocumentPagination(new URLSearchParams(), 'createdAt').sortColumn,
  ).toBe('createdAt')
  expect(
    readDocumentPagination(
      new URLSearchParams('page=3&size=50&sort=name&order=asc'),
    ),
  ).toEqual({
    page: 3,
    pageSize: 50,
    offset: 100,
    sortColumn: 'name',
    sortOrder: 'asc',
  })
  expect(
    readDocumentPagination(new URLSearchParams('page=bad&size=bad')).offset,
  ).toBe(0)
  expect(readDocumentPagination(new URLSearchParams('page=-2')).page).toBe(1)
})
