import { expect, test } from 'vitest'
import {
  documentCountLabel,
  formatDate,
  formatDateOnly,
  formatDateTime,
} from './format'

test('formats dates without time in German notation', () => {
  expect(formatDate('2026-02-01T12:00:00Z')).toBe('01.02.2026')
  expect(formatDate(new Date(2026, 11, 24))).toBe('24.12.2026')
})

test('formats date-only values without a time zone shift', () => {
  // Pinned to UTC: west of UTC a local midnight parse would show the day before.
  expect(formatDateOnly('2026-02-01')).toBe('01.02.2026')
  expect(formatDateOnly('2026-01-01')).toBe('01.01.2026')
})

test('formats timestamps and tolerates missing values', () => {
  expect(formatDateTime('2026-01-01T12:00:00.000Z')).toMatch(/01\.01\.26/)
  expect(formatDateTime(null)).toBe('–')
  expect(formatDateTime('kaputt')).toBe('–')
})

test('counts documents with the German plural', () => {
  expect(documentCountLabel(1)).toBe('1 Dokument')
  expect(documentCountLabel(0)).toBe('0 Dokumente')
  expect(documentCountLabel(3)).toBe('3 Dokumente')
})
