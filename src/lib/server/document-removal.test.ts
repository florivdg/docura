// @vitest-environment node
import { eq } from 'drizzle-orm'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, expect, test, vi } from 'vitest'
import { document } from '@/db/schema/documents'
import { createDbStub } from '@/test/db-stub'
import { tempDir } from '@/test/temp-dir'
import { removeDocumentsPermanently } from './document-removal'

const stub = createDbStub()
const db = stub.db as unknown as Parameters<
  typeof removeDocumentsPermanently
>[0]
const where = eq(document.id, 'a')
let uploadDir: string

beforeEach(() => {
  stub.reset()
  uploadDir = tempDir('removal')
  writeFileSync(join(uploadDir, 'a.pdf'), 'a')
})

test('deletes the rows in one statement first, then their files', async () => {
  stub.results.push([{ storagePath: 'a.pdf' }, { storagePath: 'gone.pdf' }])
  expect(await removeDocumentsPermanently(db, where, uploadDir)).toBe(2)
  expect(stub.queries).toEqual(['delete'])
  expect(existsSync(join(uploadDir, 'a.pdf'))).toBe(false)
})

test('keeps the file when deleting the row fails', async () => {
  stub.results.push(new Error('db down'))
  await expect(
    removeDocumentsPermanently(db, where, uploadDir),
  ).rejects.toThrow('db down')
  expect(existsSync(join(uploadDir, 'a.pdf'))).toBe(true)
})

test('resolves to 0 when no trashed document matches', async () => {
  stub.results.push([])
  expect(await removeDocumentsPermanently(db, where, uploadDir)).toBe(0)
})

test('logs instead of throwing when a file cannot be removed', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  stub.results.push([{ storagePath: '../outside.pdf' }])
  expect(await removeDocumentsPermanently(db, where, uploadDir)).toBe(1)
  expect(log).toHaveBeenCalledOnce()
})
