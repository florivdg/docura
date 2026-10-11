import { expect, test } from 'vitest'
import { positiveNumber, STORAGE_CONFIG } from './storage-config'

test('reads positive numbers and falls back for missing or invalid values', () => {
  expect(positiveNumber('25', 1)).toBe(25)
  expect(positiveNumber(undefined, 1)).toBe(1)
  expect(positiveNumber('', 1)).toBe(1)
  expect(positiveNumber('0', 1)).toBe(1)
  expect(positiveNumber('-3', 1)).toBe(1)
  expect(positiveNumber('abc', 1)).toBe(1)
})

test('falls back for values below the minimum', () => {
  expect(positiveNumber('1', 10, 2)).toBe(10)
  expect(positiveNumber('2', 10, 2)).toBe(2)
})

test('has usable defaults', () => {
  expect(STORAGE_CONFIG.uploadDir).toBeTruthy()
  expect(STORAGE_CONFIG.orphanMinAgeMs).toBeGreaterThan(0)
  expect(STORAGE_CONFIG.exportMaxDocuments).toBeGreaterThan(0)
  expect(STORAGE_CONFIG.trashRetentionDays).toBeGreaterThan(0)
})
