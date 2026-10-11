import { expect, test } from 'vitest'
import { mapConcurrent } from './concurrency'

test('keeps the order and never runs more than the limit at once', async () => {
  let running = 0
  let peak = 0
  const result = await mapConcurrent([30, 10, 20, 0, 5], 2, async (ms) => {
    running++
    peak = Math.max(peak, running)
    await new Promise((resolve) => setTimeout(resolve, ms))
    running--
    return ms * 2
  })
  expect(result).toEqual([60, 20, 40, 0, 10])
  expect(peak).toBe(2)
})

test('resolves an empty list and rejects with the first error', async () => {
  expect(await mapConcurrent([], 4, async () => 1)).toEqual([])
  await expect(
    mapConcurrent([1, 2], 4, async (n) => {
      if (n === 2) throw new Error('kaputt')
      return n
    }),
  ).rejects.toThrow('kaputt')
})
