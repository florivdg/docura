import { expect, test } from 'vitest'
import {
  selectionState,
  selectVisible,
  selectDocument,
} from './document-selection'
test('visible-page selection preserves hidden selections and never duplicates IDs', () => {
  const docs = [{ id: 'a' }, { id: 'b' }]
  expect(selectVisible(docs, ['hidden', 'a'], true)).toEqual([
    'hidden',
    'a',
    'b',
  ])
  expect(selectVisible(docs, ['hidden', 'a'], false)).toEqual(['hidden'])
  expect(selectionState(docs, ['a'])).toBe('indeterminate')
  expect(selectionState(docs, ['a', 'b'])).toBe(true)
  expect(selectionState([], ['hidden'])).toBe(false)
  expect(selectDocument('a', ['a'], true)).toEqual(['a'])
  expect(selectDocument('a', ['hidden', 'a'], false)).toEqual(['hidden'])
})
