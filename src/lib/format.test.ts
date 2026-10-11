import { expect, test } from 'vitest'
import { formatDate } from './format'

test('formats dates without time in German notation', () => {
  expect(formatDate('2026-02-01T12:00:00Z')).toBe('01.02.2026')
  expect(formatDate(new Date(2026, 11, 24))).toBe('24.12.2026')
})
