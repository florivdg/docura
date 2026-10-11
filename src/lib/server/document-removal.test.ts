// @vitest-environment node
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pg-proxy'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, expect, test, vi } from 'vitest'
import { document } from '@/db/schema/documents'
import type { ActivityActor } from '@/lib/activity'
import { createDbStub } from '@/test/db-stub'
import { tempDir } from '@/test/temp-dir'
import { removeDocumentsPermanently } from './document-removal'

const stub = createDbStub()
const db = stub.db as unknown as Parameters<
  typeof removeDocumentsPermanently
>[0]
const where = eq(document.id, 'a')
const actor: ActivityActor = { type: 'user', id: 'u', name: 'Anna' }
let uploadDir: string
const remove = () => removeDocumentsPermanently(db, where, uploadDir, actor)

beforeEach(() => {
  stub.reset()
  uploadDir = tempDir('removal')
  writeFileSync(join(uploadDir, 'a.pdf'), 'a')
})

test('deletes the rows and records them in one batch, then removes the files', async () => {
  stub.results.push([
    { name: 'A', storagePath: 'a.pdf' },
    { name: 'B', storagePath: 'gone.pdf' },
  ])
  expect(await remove()).toBe(2)
  expect(stub.queries).toEqual(['delete', 'insert'])
  const [entries] = stub.writes as { documentId: unknown; batchId: string }[][]
  expect(entries).toEqual([
    expect.objectContaining({
      documentId: null,
      documentName: 'A',
      action: 'deleted',
      actorName: 'Anna',
    }),
    expect.objectContaining({ documentId: null, documentName: 'B' }),
  ])
  expect(entries[0].batchId).toBe(entries[1].batchId)
  expect(existsSync(join(uploadDir, 'a.pdf'))).toBe(false)
})

test('keeps the file when deleting the row fails', async () => {
  stub.results.push(new Error('db down'))
  await expect(remove()).rejects.toThrow('db down')
  expect(existsSync(join(uploadDir, 'a.pdf'))).toBe(true)
})

test('resolves to 0 and records nothing when no trashed document matches', async () => {
  stub.results.push([])
  expect(await remove()).toBe(0)
  expect(stub.queries).toEqual(['delete'])
})

test('logs instead of throwing when a file cannot be removed', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  stub.results.push([{ name: 'X', storagePath: '../outside.pdf' }])
  expect(await remove()).toBe(1)
  expect(log).toHaveBeenCalledOnce()
})

test('locks the trashed rows in id order within the DELETE', async () => {
  const statements: { query: string; params: unknown[] }[] = []
  const proxy = drizzle(async (query, params) => {
    statements.push({ query, params })
    return { rows: [] }
  })
  const proxyDb = {
    transaction: (callback: (tx: typeof proxy) => Promise<unknown>) =>
      callback(proxy),
  } as unknown as typeof db
  expect(
    await removeDocumentsPermanently(proxyDb, where, uploadDir, actor),
  ).toBe(0)
  const [{ query, params }] = statements
  expect(statements).toHaveLength(1)
  // The subquery's own `document` shadows the outer one; the matched ids
  // never come back as bind parameters.
  expect(query).toBe(
    'delete from "document" where "document"."id" in (select "id" from "document" where ("document"."id" = $1 and "document"."trashed_at" is not null) order by "document"."id" asc for update) returning "name", "storage_path"',
  )
  expect(params).toEqual(['a'])
})
