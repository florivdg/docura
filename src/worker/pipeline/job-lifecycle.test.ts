import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { createDbStub } from '@/test/db-stub'

const stub = createDbStub()
const notify = vi.fn()
vi.doMock('@/db', () => ({ db: stub.db }))
vi.doMock('@/worker/notify', () => ({ notifyProcessingUpdate: notify }))
const lifecycle = await import('./job-lifecycle')

const job = {
  id: 'job',
  document_id: 'doc',
  kind: 'full',
  attempts: 1,
  max_attempts: 3,
} as const

beforeEach(() => {
  stub.reset()
  notify.mockReset()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.useRealTimers())

function renderedQuery(call: unknown) {
  return new PgDialect().sqlToQuery(call as SQL)
}

test('claims the next job and stamps its heartbeat', async () => {
  const execute = vi.spyOn(stub.db, 'execute')
  stub.results.push([{ id: 'job' }])
  expect(await lifecycle.claimNextJob()).toEqual({ id: 'job' })
  expect(renderedQuery(execute.mock.calls[0][0]).sql).toContain(
    'heartbeat_at = NOW()',
  )
  expect(await lifecycle.claimNextJob()).toBeNull()
})

test('resets jobs without a recent heartbeat and announces the failure', async () => {
  const execute = vi.spyOn(stub.db, 'execute')
  const stale = { id: 'job', document_id: 'doc', kind: 'embedding' }
  stub.results.push([stale])
  const recovered = await lifecycle.recoverStaleJobs(10 * 60_000)
  expect(recovered).toEqual([stale])
  const query = renderedQuery(execute.mock.calls[0][0])
  expect(query.sql).toContain('COALESCE(heartbeat_at, started_at, updated_at)')
  expect(query.params).toContain('600 seconds')
  const message =
    'Verarbeitung abgebrochen: keine Rückmeldung vom Worker seit 10 Minuten'
  expect(query.params).toContain(message)
  expect(notify).toHaveBeenCalledWith({
    type: 'failed',
    jobId: 'job',
    documentId: 'doc',
    kind: 'embedding',
    step: null,
    status: 'failed',
    errorMessage: message,
  })
  expect(await lifecycle.recoverStaleJobs()).toEqual([])
})

test('names the timeout in whole minutes', () => {
  expect(lifecycle.staleJobMessage(30_000)).toMatch(/seit 1 Minute$/)
  expect(lifecycle.staleJobMessage(15 * 60_000)).toMatch(/seit 15 Minuten$/)
})

test('schedules a retry with exponential backoff', async () => {
  expect(lifecycle.retryDelaySeconds(1)).toBe(30)
  expect(lifecycle.retryDelaySeconds(2)).toBe(120)
  stub.results.push([{ id: 'job' }])
  await lifecycle.markFailed(job, 'OCR offline')
  expect(stub.writes[0]).toMatchObject({
    status: 'failed',
    errorMessage: 'OCR offline',
    step: null,
    nextRetryAt: expect.any(Date),
  })
  expect(notify).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'failed', errorMessage: 'OCR offline' }),
  )
})

test('uses up the attempts of exhausted and permanent failures', async () => {
  stub.results.push([{ id: 'job' }], [{ id: 'job' }])
  await lifecycle.markFailed({ ...job, attempts: 3 }, 'kaputt')
  await lifecycle.markFailed(job, 'Datei fehlt', { permanent: true })
  for (const write of stub.writes) {
    expect(write).toHaveProperty('attempts')
    expect(write).not.toHaveProperty('nextRetryAt')
  }
  expect(console.error).toHaveBeenCalledTimes(2)
})

test('drops results of jobs that a stale-job sweep took away', async () => {
  stub.results.push([], [])
  await lifecycle.markFailed(job, 'zu spät')
  await lifecycle.markCompleted(job)
  expect(notify).not.toHaveBeenCalled()
  expect(console.warn).toHaveBeenCalledTimes(2)
})

test('marks completed jobs and clears the error of earlier attempts', async () => {
  stub.results.push([{ id: 'job' }])
  await lifecycle.markCompleted(job)
  expect(stub.writes[0]).toMatchObject({
    status: 'completed',
    step: null,
    errorMessage: null,
  })
  expect(notify).toHaveBeenLastCalledWith({
    type: 'completed',
    jobId: 'job',
    documentId: 'doc',
    kind: 'full',
    step: null,
    status: 'completed',
  })
})

test('records step changes while the lease holds', async () => {
  const lease = lifecycle.startJobLease(job, 60_000)
  stub.results.push([{ id: 'job' }])
  await lifecycle.updateStep(lease, 'ocr')
  expect(stub.writes[0]).toMatchObject({ step: 'ocr' })
  expect(notify).toHaveBeenLastCalledWith(
    expect.objectContaining({ type: 'step_change', step: 'ocr', kind: 'full' }),
  )
  lease.stop()
})

test('aborts the lease when a step update finds the job taken away', async () => {
  const lease = lifecycle.startJobLease(job, 60_000)
  stub.results.push([])
  await expect(lifecycle.updateStep(lease, 'ocr')).rejects.toBeInstanceOf(
    lifecycle.LostLeaseError,
  )
  expect(lease.signal.aborted).toBe(true)
  expect(notify).not.toHaveBeenCalled()
  await expect(lifecycle.updateStep(lease, 'embedding')).rejects.toThrow()
  expect(stub.writes).toHaveLength(1)
  lease.stop()
})

test('renews the lease until stopped and survives failed renewals', async () => {
  vi.useFakeTimers()
  stub.results.push([{ id: 'job' }], new Error('db down'), [])
  const lease = lifecycle.startJobLease(job, 1000)
  await vi.advanceTimersByTimeAsync(2000)
  expect(stub.writes).toHaveLength(2)
  expect(stub.writes[0]).toHaveProperty('heartbeatAt')
  expect(console.warn).toHaveBeenCalledTimes(1)
  expect(lease.signal.aborted).toBe(false)
  await vi.advanceTimersByTimeAsync(1000)
  expect(lease.signal.aborted).toBe(true)
  lease.stop()
  await vi.advanceTimersByTimeAsync(5000)
  expect(stub.writes).toHaveLength(3)
})

test('asserts the lease by renewing it before a document write', async () => {
  const lease = lifecycle.startJobLease(job, 60_000)
  stub.results.push([{ id: 'job' }], [])
  await expect(lifecycle.assertLease(lease)).resolves.toBeUndefined()
  expect(stub.writes[0]).toHaveProperty('heartbeatAt')
  await expect(lifecycle.assertLease(lease)).rejects.toBeInstanceOf(
    lifecycle.LostLeaseError,
  )
  expect(lease.signal.aborted).toBe(true)
  await expect(lifecycle.assertLease(lease)).rejects.toThrow()
  expect(stub.writes).toHaveLength(2)
  lease.stop()
})
