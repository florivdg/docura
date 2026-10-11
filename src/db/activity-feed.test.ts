import { drizzle } from 'drizzle-orm/pg-proxy'
import { expect, test, vi } from 'vitest'

const statements: string[] = []
const rows: unknown[][] = []
const proxy = drizzle(async (query) => {
  statements.push(query)
  return { rows: rows.shift() ?? [] }
})
vi.doMock('@/db', () => ({ db: proxy }))
const feed = await import('./activity-feed')

/** Runs `task` against real Drizzle rendering and returns its SQL. */
async function render(task: () => Promise<unknown>) {
  statements.length = 0
  await task()
  return statements
}

test('a document history prefers the current name and pages newest first', async () => {
  const [entries] = await render(() =>
    feed.loadDocumentActivity('a', { limit: 20, offset: 40 }),
  )
  expect(entries).toContain(
    'coalesce("document"."name", "document_activity"."document_name")',
  )
  expect(entries).toContain(
    'left join "document" on "document_activity"."document_id" = "document"."id"',
  )
  expect(entries).toMatch(
    /order by "document_activity"."created_at" desc, "document_activity"."id" desc limit \$\d offset \$\d$/,
  )
  const [total] = await render(() => feed.countDocumentActivity('a'))
  expect(total).toMatch(/^select count\(\*\) from "document_activity" where/)
})

test('groups batches and takes every representative value from one row', async () => {
  const [groups] = await render(() => feed.loadActivityGroups(10))
  expect(groups).toContain(
    'group by "document_activity"."batch_id", "document_activity"."action", "document_activity"."actor_type", "document_activity"."actor_id", "document_activity"."actor_name"',
  )
  const firstOf =
    /\(array_agg\((.+?) order by "document_activity"."created_at", "document_activity"."id"\)\)\[1\]/g
  expect([...groups.matchAll(firstOf)].map((match) => match[1])).toEqual([
    '"document_activity"."document_id"',
    'coalesce("document"."name", "document_activity"."document_name")',
    '"document_activity"."changes"',
  ])
  expect(groups).toMatch(
    /order by max\("document_activity"."created_at"\) desc limit \$2$/,
  )
  // Only the newest batches are aggregated: the cutoff walks the
  // created_at index over the `limit` newest distinct timestamps.
  const cutoff =
    'where "document_activity"."created_at" >= (select min("created_at") from (select distinct "created_at" from "document_activity" order by "document_activity"."created_at" desc limit $1) "newest")'
  expect(groups).toContain(cutoff)
  // Outside the single-table cutoff, every column is table-qualified.
  expect(groups.replace(cutoff, '')).not.toMatch(
    /[^.]"(document_id|name|created_at)"/,
  )
})

test('maps a group to its representative document', async () => {
  const changes = { name: { from: 'A', to: 'B' } }
  rows.push([
    [
      'batch',
      'updated',
      'user',
      'u1',
      'Anna',
      '2026-06-01 10:00:00',
      1,
      'doc',
      'B',
      JSON.stringify(changes),
    ],
  ])
  expect(await feed.loadActivityGroups(10)).toEqual([
    {
      batchId: 'batch',
      action: 'updated',
      actorType: 'user',
      actorId: 'u1',
      actorName: 'Anna',
      createdAt: new Date('2026-06-01T10:00:00Z'),
      count: 1,
      document: { id: 'doc', name: 'B' },
      changes,
    },
  ])
})
