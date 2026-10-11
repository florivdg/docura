import { afterEach, expect, test, vi } from 'vitest'
import { fetchWithTimeout } from './fetch-with-timeout'

afterEach(() => vi.restoreAllMocks())

/** A fetch that only settles when its signal aborts. */
function hangingFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(
    (_url, init) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        )
      }),
  )
}

test('returns the response of a fast request', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'))
  const res = await fetchWithTimeout('http://x', {}, 1000)
  expect(await res.text()).toBe('ok')
})

test('reports a timeout', async () => {
  hangingFetch()
  await expect(fetchWithTimeout('http://x', {}, 5)).rejects.toThrow(
    'Zeitüberschreitung nach 5ms für http://x',
  )
})

test('rejects with the reason of an aborted caller signal', async () => {
  hangingFetch()
  const caller = new AbortController()
  const pending = fetchWithTimeout('http://x', { signal: caller.signal }, 1000)
  caller.abort(new Error('Lease verloren'))
  await expect(pending).rejects.toThrow('Lease verloren')
})

test('passes other errors through', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'))
  await expect(fetchWithTimeout('http://x', {}, 1000)).rejects.toThrow(
    'offline',
  )
})
