import { describe, expect, test } from 'vitest'
import {
  chunkText,
  sanitizeTitle,
  sanitizeTags,
  sanitizeFolderSuggestion,
  sanitizeDocumentDate,
  sanitizeCorrespondent,
} from './text'

describe('AI metadata sanitization', () => {
  test('normalizes titles while enforcing bounds', () => {
    for (const value of [' "Rechnung." ', '„Rechnung.“', "'Rechnung.'"])
      expect(sanitizeTitle(value)).toBe('Rechnung')
    for (const value of [null, 1, '', 'a', 'x'.repeat(201)])
      expect(sanitizeTitle(value)).toBeNull()
    expect(sanitizeTitle('x'.repeat(200))).toHaveLength(200)
  })
  test('filters tags and limits suggestions', () => {
    expect(sanitizeTags(null)).toEqual([])
    expect(sanitizeTags([' Rechnung ', null, 'a', 'x'.repeat(51)])).toEqual([
      'Rechnung',
    ])
    expect(sanitizeTags(Array(8).fill('Steuer'))).toHaveLength(5)
  })
  test('bounds folder and correspondent names', () => {
    expect(sanitizeFolderSuggestion(' Steuern ')).toBe('Steuern')
    expect(sanitizeCorrespondent(' Telekom ')).toBe('Telekom')
    for (const value of [null, '', 'x'.repeat(101)])
      expect(sanitizeFolderSuggestion(value)).toBeNull()
    for (const value of [null, 'a', 'x'.repeat(121)])
      expect(sanitizeCorrespondent(value)).toBeNull()
  })
  test('accepts only plausible calendar dates', () => {
    expect(sanitizeDocumentDate(' 2024-02-29 ')).toBe('2024-02-29')
    expect(sanitizeDocumentDate('1900-01-01')).toBe('1900-01-01')
    for (const value of [
      null,
      '',
      '2023-02-29',
      '2024-13-01',
      '1899-12-31',
      `${new Date().getFullYear() + 2}-01-01`,
    ])
      expect(sanitizeDocumentDate(value)).toBeNull()
  })
})

describe('text chunks', () => {
  test('preserves short and empty input', () => {
    expect(chunkText('')).toEqual([''])
    expect(chunkText('abcd', 4, 1)).toEqual(['abcd'])
  })
  test('overlaps successive chunks without losing the tail', () => {
    expect(chunkText('abcdefghij', 4, 1)).toEqual(['abcd', 'defg', 'ghij', 'j'])
  })
})
