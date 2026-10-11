import { expect, test } from 'vitest'
import { staleTimeoutMinutes } from './config'

test('falls back to 10 minutes for missing, invalid or too small timeouts', () => {
  expect(staleTimeoutMinutes(undefined)).toBe(10)
  expect(staleTimeoutMinutes('abc')).toBe(10)
  expect(staleTimeoutMinutes('0')).toBe(10)
  expect(staleTimeoutMinutes('1')).toBe(10)
})

test('accepts timeouts from the minimum on', () => {
  expect(staleTimeoutMinutes('2')).toBe(2)
  expect(staleTimeoutMinutes('15')).toBe(15)
})
