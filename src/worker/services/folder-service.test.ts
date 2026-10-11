import { beforeEach, expect, test, vi } from 'vitest'
import { createDbStub } from '@/test/db-stub'

const stub = createDbStub()
vi.doMock('@/db', () => ({ db: stub.db }))
const { applyFolderSuggestion } =
  await import('@/worker/services/folder-service')

const empty = { id: 'd1', folderId: null }

beforeEach(() => {
  stub.reset()
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

test('keeps a folder that was already assigned', async () => {
  await applyFolderSuggestion({ id: 'd1', folderId: 'f0' }, 'Finanzen')
  expect(stub.queries).toEqual([])
})

test('assigns an existing folder to a document without one', async () => {
  stub.results.push([{ id: 'f1' }], [{ id: 'd1' }])
  await applyFolderSuggestion(empty, ' finanzen ')
  expect(stub.writes).toEqual([{ folderId: 'f1' }])
  expect(console.log).toHaveBeenCalledWith(
    expect.stringContaining('zugewiesen'),
  )
})

test('drops the suggestion when a folder was set during the run', async () => {
  stub.results.push([{ id: 'f1' }], [])
  await applyFolderSuggestion(empty, 'Finanzen')
  expect(console.log).toHaveBeenCalledWith(
    expect.stringContaining('bereits gesetzt — Vorschlag "Finanzen" verworfen'),
  )
})

test('ignores unknown folders and logs database failures', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  stub.results.push([], new Error('connection lost'))
  await applyFolderSuggestion(empty, 'Unbekannt')
  expect(stub.writes).toEqual([])
  expect(console.log).toHaveBeenCalledWith(
    expect.stringContaining('kein passender Ordner'),
  )
  await applyFolderSuggestion(empty, 'Finanzen')
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining('d1'),
    'connection lost',
  )
})
