import { describe, expect, test, vi } from 'vitest'

import { WORKER_CONFIG } from '@/worker/config'
import {
  averageAndNormalizeVectors,
  validateVector,
} from '@/worker/utils/vector'

const DIMENSIONS = WORKER_CONFIG.embeddingDimensions

function vectorOf(value: number): number[] {
  return Array.from<number>({ length: DIMENSIONS }).fill(value)
}

describe('validateVector', () => {
  test('returns a well-formed vector unchanged', () => {
    const vector = vectorOf(0.5)
    expect(validateVector(vector)).toBe(vector)
  })

  test('rejects non-arrays', () => {
    expect(() => validateVector({ length: DIMENSIONS })).toThrow(
      'Embedding ist kein Array',
    )
  })

  test('rejects a dimension mismatch', () => {
    expect(() => validateVector([0.1, 0.2])).toThrow(
      `Embedding hat 2 Dimensionen, erwartet ${DIMENSIONS}`,
    )
  })

  test.each([Number.NaN, Number.POSITIVE_INFINITY, '0.1', null])(
    'rejects invalid value %p',
    (invalid) => {
      const vector: unknown[] = vectorOf(0)
      vector[7] = invalid
      expect(() => validateVector(vector)).toThrow('an Position 7')
    },
  )
})

describe('averageAndNormalizeVectors', () => {
  test('averages vectors and scales the result to unit length', () => {
    const a = vectorOf(0)
    const b = vectorOf(0)
    a[0] = 3
    b[1] = 4

    const result = averageAndNormalizeVectors([a, b])

    expect(result).toHaveLength(DIMENSIONS)
    expect(result[0]).toBeCloseTo(0.6)
    expect(result[1]).toBeCloseTo(0.8)
    expect(result.slice(2).every((v) => v === 0)).toBe(true)
  })

  test('leaves a zero vector untouched instead of dividing by zero', () => {
    expect(averageAndNormalizeVectors([vectorOf(0)])).toEqual(vectorOf(0))
  })
})

vi.mock('@/db', () => ({ db: {} }))
