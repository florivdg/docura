import { drizzle } from 'drizzle-orm/pg-proxy'
import { beforeEach, expect, test } from 'vitest'
import { createDbStub } from '@/test/db-stub'
import { snapshotRow } from '@/test/activity-fixture'
import {
  documentActivities,
  loadActivitySnapshots,
  recordActivities,
  SNAPSHOT_CHUNK,
  SYSTEM_ACTORS,
  withActivity,
} from './activity'

type Executor = Parameters<typeof recordActivities>[0]

const stub = createDbStub()
const tx = stub.db as unknown as Executor
const anna = { type: 'user', id: 'u1', name: 'Anna' } as const

beforeEach(stub.reset)

test('inserts all entries in one statement and nothing without entries', async () => {
  await recordActivities(tx, [])
  expect(stub.queries).toEqual([])
  await recordActivities(
    tx,
    documentActivities(
      [
        { id: 'a', name: 'A' },
        { id: null, name: 'B' },
      ],
      SYSTEM_ACTORS.trashCleanup,
      'deleted',
    ),
  )
  expect(stub.queries).toEqual(['insert'])
  const [rows] = stub.writes as Record<string, unknown>[][]
  expect(rows).toEqual([
    {
      documentId: 'a',
      documentName: 'A',
      action: 'deleted',
      actorType: 'system',
      actorId: null,
      actorName: 'Papierkorb-Bereinigung',
      changes: null,
      batchId: expect.any(String),
    },
    expect.objectContaining({ documentId: null, documentName: 'B' }),
  ])
  expect(rows[1].batchId).toBe(rows[0].batchId)
})

test('records an entry with its changes', async () => {
  const changes = { name: { from: 'A', to: 'B' } }
  await recordActivities(tx, [
    {
      documentId: 'a',
      documentName: 'B',
      actor: anna,
      action: 'updated',
      changes,
      batchId: 'batch',
    },
  ])
  expect(stub.writes[0]).toEqual([
    expect.objectContaining({ actorId: 'u1', changes, batchId: 'batch' }),
  ])
})

test('splits large batches into statements of 1,000 rows', async () => {
  const documents = Array.from({ length: 2001 }, (_, index) => ({
    id: null,
    name: `Dokument ${index}`,
  }))
  await recordActivities(
    tx,
    documentActivities(documents, SYSTEM_ACTORS.trashCleanup, 'deleted'),
  )
  expect(stub.queries).toEqual(['insert', 'insert', 'insert'])
  const chunks = stub.writes as Record<string, unknown>[][]
  expect(chunks.map((rows) => rows.length)).toEqual([1000, 1000, 1])
  expect(chunks[2][0]).toMatchObject({ documentName: 'Dokument 2000' })
  expect(new Set(chunks.flat().map((row) => row.batchId)).size).toBe(1)
})

test('locks the documents first, then reads their tags', async () => {
  stub.results.push(
    [snapshotRow('a', { folderId: 'f', folderName: 'Steuer' })],
    [
      { documentId: 'a', id: 't1', name: 'Rechnung' },
      { documentId: 'a', id: 't2', name: 'Steuer' },
    ],
  )
  expect(await loadActivitySnapshots(tx, ['a'])).toEqual([
    expect.objectContaining({
      id: 'a',
      folder: { id: 'f', name: 'Steuer' },
      correspondent: null,
      tags: [
        { id: 't1', name: 'Rechnung' },
        { id: 't2', name: 'Steuer' },
      ],
    }),
  ])
  expect(stub.queries).toEqual(['select for no key update', 'select'])
  expect(await loadActivitySnapshots(tx, [])).toEqual([])
  expect(stub.queries).toHaveLength(2)
  await loadActivitySnapshots(tx, ['a'], { lock: false })
  expect(stub.queries.slice(2)).toEqual(['select', 'select'])
})

test('reads large id lists in chunks of ascending ids', async () => {
  const ids = Array.from(
    { length: SNAPSHOT_CHUNK + 1 },
    (_, index) => `ID-${String(index).padStart(6, '0')}`,
  ).reverse()
  const statements: { query: string; params: unknown[] }[] = []
  const proxy = drizzle(async (query, params) => {
    statements.push({ query, params })
    return { rows: [] }
  })
  await loadActivitySnapshots(proxy as unknown as Executor, [...ids, ids[0]])
  expect(statements).toHaveLength(4)
  const [first, firstTags, second, secondTags] = statements
  expect(first.query).toMatch(/for no key update of "document"$/)
  expect(second.query).toMatch(/for no key update of "document"$/)
  expect(first.params).toHaveLength(SNAPSHOT_CHUNK)
  expect(first.params[0]).toBe('id-000000')
  expect(firstTags.params).toEqual(first.params)
  expect(second.params).toEqual(['id-010000'])
  expect(secondTags.params).toEqual(['id-010000'])
})

test('merges the chunks in order', async () => {
  const ids = Array.from({ length: SNAPSHOT_CHUNK + 1 }, (_, index) =>
    String(index).padStart(6, '0'),
  )
  stub.results.push(
    [snapshotRow('000000'), snapshotRow('000001')],
    [{ documentId: '000001', id: 't', name: 'Steuer' }],
    [snapshotRow('010000')],
    [],
  )
  const snapshots = await loadActivitySnapshots(tx, ids)
  expect(snapshots.map(({ id }) => id)).toEqual(['000000', '000001', '010000'])
  expect(snapshots[1].tags).toEqual([{ id: 't', name: 'Steuer' }])
  expect(stub.queries).toEqual([
    'select for no key update',
    'select',
    'select for no key update',
    'select',
  ])
})

test('records the changes of a mutation between two snapshots', async () => {
  stub.results.push(
    [snapshotRow('a'), snapshotRow('b')],
    [],
    [snapshotRow('a', { isFavorite: true }), snapshotRow('b')],
    [],
  )
  const result = await withActivity(tx, ['a', 'b'], anna, async () => 'done')
  expect(result).toBe('done')
  expect(stub.queries.at(-1)).toBe('insert')
  expect(stub.writes[0]).toEqual([
    expect.objectContaining({
      documentId: 'a',
      action: 'updated',
      actorName: 'Anna',
      changes: { isFavorite: { from: false, to: true } },
    }),
  ])
})

test('renders the snapshot query table-qualified and locks only documents', async () => {
  const statements: string[] = []
  const proxy = drizzle(async (query) => {
    statements.push(query)
    return { rows: [] }
  })
  await loadActivitySnapshots(proxy as unknown as Executor, ['a'])
  const [documents, tags] = statements
  expect(documents).toMatch(/^select .* from "document" left join "folder"/)
  expect(documents).toContain('"document"."folder_id" = "folder"."id"')
  expect(documents).toContain(
    '"document"."correspondent_id" = "correspondent"."id"',
  )
  expect(documents).toMatch(
    /order by "document"."id" asc for no key update of "document"$/,
  )
  expect(tags).toContain('"document_tag"."tag_id" = "tag"."id"')
  expect(tags).not.toContain('for ')
  statements.length = 0
  await loadActivitySnapshots(proxy as unknown as Executor, ['a'], {
    lock: false,
  })
  expect(statements[0]).toMatch(/order by "document"."id" asc$/)
})
