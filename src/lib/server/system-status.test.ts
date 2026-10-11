import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createDbStub } from '@/test/db-stub'

const stub = createDbStub()
const readWorkerHeartbeat = vi.fn()
vi.doMock('@/db', () => ({ db: stub.db }))
vi.doMock('@/lib/redis', () => ({ readWorkerHeartbeat }))
const status = await import('./system-status')

beforeEach(stub.reset)
afterEach(() => {
  readWorkerHeartbeat.mockReset()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function mockServices(ollamaModels: string[], ocrStatus = 200) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input) =>
      (input as string).endsWith('/api/tags')
        ? Response.json({ models: ollamaModels.map((name) => ({ name })) })
        : new Response('kaputt', { status: ocrStatus }),
    )
}

test('probe measures successful checks and hides raw error messages', async () => {
  const success = await status.probe(async () => 'PONG', 100)
  expect(success.value).toBe('PONG')
  expect(success.check).toMatchObject({ status: 'ok', error: null })
  expect(success.check.latencyMs).toBeGreaterThanOrEqual(0)
  const failure = await status.probe(async () => {
    throw new Error('connect ECONNREFUSED http://ocr:8100')
  }, 100)
  expect(failure).toEqual({
    check: { status: 'error', latencyMs: null, error: 'Nicht erreichbar' },
    value: null,
  })
})

test('probe aborts the check once the deadline passes', async () => {
  vi.useFakeTimers()
  let signal: AbortSignal | undefined
  const pending = status.probe((s) => {
    signal = s
    return new Promise<never>(() => {})
  }, 2000)
  await vi.advanceTimersByTimeAsync(2000)
  expect((await pending).check.error).toBe('Zeitüberschreitung')
  expect(signal?.aborted).toBe(true)
})

test('describes HTTP errors and timeouts', () => {
  expect(status.describeProbeError(new status.HttpStatusError(503))).toBe(
    'HTTP 503',
  )
  expect(status.describeProbeError(new DOMException('x', 'TimeoutError'))).toBe(
    'Zeitüberschreitung',
  )
  expect(status.describeProbeError('weird')).toBe('Nicht erreichbar')
})

test('collects worker, services and queue without internal URLs', async () => {
  readWorkerHeartbeat.mockResolvedValue(
    JSON.stringify({ lastSeen: '2026-01-01T00:00:00.000Z', pid: 1 }),
  )
  mockServices(['mxbai-embed-large:latest'], 503)
  stub.results.push(
    [],
    [
      {
        pending: 1,
        processing: 0,
        failed: 2,
        failedRetrying: 0,
        oldestPendingAt: null,
      },
    ],
  )
  const body = await status.collectSystemStatus()
  expect(body.worker).toMatchObject({ status: 'ok', pid: 1 })
  expect(body.services.database.status).toBe('ok')
  expect(body.services.redis.status).toBe('ok')
  expect(body.services.ocr).toEqual({
    status: 'error',
    latencyMs: null,
    error: 'HTTP 503',
  })
  expect(body.services.ollama.models.embed.available).toBe(true)
  expect(body.services.ollama.models.llm.available).toBe(false)
  expect(body.queue).toMatchObject({ pending: 1, failed: 2 })
  expect(JSON.stringify(body)).not.toContain('http')
})

test('keeps answering when the database and Redis are down', async () => {
  readWorkerHeartbeat.mockRejectedValue(new Error('ECONNREFUSED redis:6379'))
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'))
  stub.results.push(new Error('connection refused'), new Error('down'))
  const body = await status.collectSystemStatus()
  expect(body.worker).toEqual({ status: 'unknown', lastSeen: null })
  expect(body.services.database.error).toBe('Nicht erreichbar')
  expect(body.services.ollama.models.embed.available).toBeNull()
  expect(body.queue).toBeNull()
})

test('single probes can be used on their own', async () => {
  mockServices(['llama3:latest'])
  readWorkerHeartbeat.mockResolvedValue(null)
  expect((await status.probeOcr()).status).toBe('ok')
  expect((await status.probeDatabase()).status).toBe('ok')
  expect(await status.probeRedis()).toMatchObject({
    check: { status: 'ok' },
    value: null,
  })
  expect((await status.probeOllama()).models.llm.available).toBe(true)
})
