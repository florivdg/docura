import { drizzle } from 'drizzle-orm/pg-proxy'
import { beforeEach, expect, test, vi } from 'vitest'
import { createDbStub } from '@/test/db-stub'
import { reprocessCandidate as candidate } from '@/test/document-fixture'

const stub = createDbStub()
vi.doMock('@/db', () => ({ db: stub.db }))
const jobs = await import('./processing-jobs')

beforeEach(stub.reset)

/** Results for the lock and the retry cancellation, which precede the read. */
const LOCK_AND_CANCEL = [[], []]

/** Runs `task` against real Drizzle rendering and returns the SQL statements. */
async function renderStatements(task: () => Promise<unknown>) {
  const statements: string[] = []
  const proxy = drizzle(async (query) => {
    statements.push(query)
    return { rows: [] }
  })
  vi.spyOn(stub.db, 'transaction').mockImplementationOnce((callback) =>
    callback(proxy),
  )
  const select = vi
    .spyOn(stub.db, 'select')
    .mockImplementation((fields) => proxy.select(fields as never) as never)
  try {
    await task()
  } finally {
    select.mockRestore()
  }
  return statements
}

test('locks, cancels retries and reads the job state before writing', async () => {
  const transaction = vi.spyOn(stub.db, 'transaction')
  stub.results.push(
    ...LOCK_AND_CANCEL,
    [
      candidate('a'),
      candidate('b', { pendingJobId: 'job-b' }),
      candidate('c', { trashed: true }),
    ],
    [{ jobId: 'job-a', id: 'a' }],
  )
  const result = await jobs.enqueueReprocessing(['a', 'b', 'c'], 'embedding')
  expect(result).toEqual({
    queued: [
      { id: 'b', jobId: 'job-b', kind: 'full', created: false },
      { id: 'a', jobId: 'job-a', kind: 'embedding', created: true },
    ],
    skipped: [{ id: 'c', reason: 'trashed' }],
  })
  expect(transaction).toHaveBeenCalledTimes(1)
  expect(stub.queries).toEqual([
    'select for update',
    'update',
    'select',
    'insert',
  ])
  expect(stub.writes[0]).toMatchObject({ nextRetryAt: null })
  expect(stub.writes[0]).toHaveProperty('attempts')
  expect(stub.writes[1]).toEqual([{ documentId: 'a', kind: 'embedding' }])
})

test('records a reprocess request only for newly created jobs', async () => {
  const actor = { type: 'user', id: 'u1', name: 'Anna' } as const
  stub.results.push(
    [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ],
    [],
    [candidate('a'), candidate('b', { pendingJobId: 'job-b' })],
    [{ jobId: 'job-a', id: 'a' }],
  )
  await jobs.enqueueReprocessing(['a', 'b'], 'full', actor)
  expect(stub.queries.at(-1)).toBe('insert')
  expect(stub.writes.at(-1)).toEqual([
    expect.objectContaining({
      documentId: 'a',
      documentName: 'A',
      action: 'reprocess_requested',
      actorName: 'Anna',
    }),
  ])
})

test('records a reprocess request for an upgraded job', async () => {
  const actor = { type: 'user', id: 'u1', name: 'Anna' } as const
  stub.results.push(
    [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ],
    [],
    [
      candidate('a', { pendingJobId: 'job-a', pendingJobKind: 'embedding' }),
      candidate('b', { pendingJobId: 'job-b', pendingJobKind: 'embedding' }),
      candidate('c', { pendingJobId: 'job-c' }),
    ],
    [{ jobId: 'job-a', id: 'a' }],
  )
  await jobs.enqueueReprocessing(['a', 'b', 'c'], 'full', actor)
  // The claimed job b and the reused job c record nothing.
  expect(stub.queries.at(-1)).toBe('insert')
  expect(stub.writes.at(-1)).toEqual([
    expect.objectContaining({
      documentId: 'a',
      documentName: 'A',
      action: 'reprocess_requested',
    }),
  ])
})

test('records nothing when a pending job of the same kind is reused', async () => {
  const actor = { type: 'user', id: 'u1', name: 'Anna' } as const
  stub.results.push(
    [{ id: 'a', name: 'A' }],
    [],
    [candidate('a', { pendingJobId: 'job-a' })],
  )
  await jobs.enqueueReprocessing(['a'], 'full', actor)
  expect(stub.queries).not.toContain('insert')
})

test('turns a pending embedding job into a full one unless it was claimed', async () => {
  stub.results.push(
    ...LOCK_AND_CANCEL,
    [
      candidate('a', { pendingJobId: 'job-a', pendingJobKind: 'embedding' }),
      candidate('b', { pendingJobId: 'job-b', pendingJobKind: 'embedding' }),
    ],
    [{ jobId: 'job-a', id: 'a' }],
  )
  expect(await jobs.enqueueReprocessing(['a', 'b'], 'full')).toEqual({
    queued: [{ id: 'a', jobId: 'job-a', kind: 'full', created: false }],
    skipped: [{ id: 'b', reason: 'running' }],
  })
  expect(stub.queries).toEqual([
    'select for update',
    'update',
    'select',
    'update',
  ])
  expect(stub.writes[1]).toMatchObject({ kind: 'full' })
})

test('renders table-qualified job subqueries after the lock and the cancellation', async () => {
  // Renders through real Drizzle: a raw `${document.id}` in a single-table
  // select came out as `"id"` and silently matched `processing_job.id`.
  const [lock, cancel, candidates, ...rest] = await renderStatements(() =>
    jobs.enqueueReprocessing(['a'], 'full'),
  )
  expect(rest).toEqual([])
  expect(lock).toMatch(
    /^select .* from "document" .*order by "document"."id" asc for update$/,
  )
  expect(cancel).toMatch(/^update "processing_job" set/)
  expect(cancel).toContain('"trashed_at" is null')
  const correlation = '"processing_job"."document_id" = "document"."id"'
  expect(candidates.split(correlation)).toHaveLength(4)
  expect(candidates).not.toMatch(/= "id"/)
  expect(candidates).not.toMatch(/for update/)
})

test('writes no job when every document is skipped', async () => {
  stub.results.push(...LOCK_AND_CANCEL, [candidate('a', { processing: true })])
  expect(await jobs.enqueueReprocessing(['a'], 'full')).toEqual({
    queued: [],
    skipped: [{ id: 'a', reason: 'running' }],
  })
  expect(stub.queries).toEqual(['select for update', 'update', 'select'])
})

test('loads the queue counts row', async () => {
  const row = { pending: 1, processing: 0 }
  stub.results.push([row])
  expect(await jobs.loadQueueCounts()).toBe(row)
})

test('limits only the failed counts to the document list', async () => {
  const [counts] = await renderStatements(() => jobs.loadQueueCounts())
  const joins = counts.slice(counts.lastIndexOf(' inner join '))
  expect(joins).not.toContain(' where ')
  expect(counts.match(/"document"."trashed_at" is null/g)).toHaveLength(2)
})
