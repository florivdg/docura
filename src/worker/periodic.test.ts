import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { abortableSleep, runPeriodically } from './periodic'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.useRealTimers())

test('keeps running after a failed run and waits one interval between runs', async () => {
  const controller = new AbortController()
  let runs = 0
  const loop = runPeriodically(
    'Test',
    2500,
    async () => {
      runs++
      if (runs === 1) throw new Error('boom')
      controller.abort()
    },
    controller.signal,
  )
  await vi.advanceTimersByTimeAsync(2499)
  expect(runs).toBe(1)
  await vi.advanceTimersByTimeAsync(1)
  await loop
  expect(runs).toBe(2)
  expect(console.error).toHaveBeenCalledWith(
    'Fehler bei Test:',
    expect.any(Error),
  )
})

test('stops waiting as soon as shutdown is requested', async () => {
  const controller = new AbortController()
  const task = vi.fn(async () => {})
  const loop = runPeriodically('Test', 60_000, task, controller.signal)
  await vi.advanceTimersByTimeAsync(10)
  controller.abort()
  await loop
  expect(task).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})

test('returns immediately for an already aborted signal', async () => {
  await abortableSleep(60_000, AbortSignal.abort())
  expect(vi.getTimerCount()).toBe(0)
})
