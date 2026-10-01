import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ingestWatchFile } from './ingest-watch-file'
let root: string
let options: Parameters<typeof ingestWatchFile>[1]
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'docura-ingest-'))
  await mkdir(join(root, 'watch'))
  await mkdir(join(root, 'uploads'))
  options = {
    watchDir: join(root, 'watch'),
    uploadDir: join(root, 'uploads'),
    maxFileSizeMB: 1,
    isPending: () => false,
    waitForStability: async () => 8,
    findDuplicate: async () => null,
    persist: vi.fn(async () => {}),
  }
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  await writeFile(join(options.watchDir, 'test.pdf'), '%PDFdata')
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})
test('persists the validated snapshot before removing its source', async () => {
  options.persist = vi.fn(async (doc) => {
    expect(await readFile(join(options.watchDir, doc.name), 'utf8')).toBe(
      '%PDFdata',
    )
    expect(
      await readFile(join(options.uploadDir, doc.storagePath), 'utf8'),
    ).toBe('%PDFdata')
    expect(doc.sha256).toHaveLength(64)
  })
  await ingestWatchFile('test.pdf', options)
  expect(options.persist).toHaveBeenCalledOnce()
  expect(await readdir(options.watchDir)).toEqual([])
  expect(await readdir(options.uploadDir)).toHaveLength(1)
})
test('keeps the original file and removes snapshots on database failure', async () => {
  options.persist = async () => {
    throw Error('database unavailable')
  }
  await expect(ingestWatchFile('test.pdf', options)).rejects.toThrow(
    'database unavailable',
  )
  expect(await readdir(options.uploadDir)).toEqual([])
  expect(await readFile(join(options.watchDir, 'test.pdf'), 'utf8')).toBe(
    '%PDFdata',
  )
})
test('skips duplicates without persisting another record', async () => {
  options.findDuplicate = async () => ({ id: 'existing' })
  await ingestWatchFile('test.pdf', options)
  expect(options.persist).not.toHaveBeenCalled()
  expect(await readdir(options.uploadDir)).toEqual([])
  expect(await readdir(options.watchDir)).toEqual([])
})
test('cleans up a duplicate won by a concurrent importer', async () => {
  options.persist = async () => {
    throw { code: '23505' }
  }
  await ingestWatchFile('test.pdf', options)
  expect(await readdir(options.uploadDir)).toEqual([])
  expect(await readdir(options.watchDir)).toEqual([])
})
test('preserves the source when another watch event is pending', async () => {
  options.isPending = () => true
  await ingestWatchFile('test.pdf', options)
  expect(await readdir(options.watchDir)).toEqual(['test.pdf'])
})
test('rejects mismatched magic bytes, oversized files, symlinks and unstable files', async () => {
  await writeFile(join(options.watchDir, 'invalid.pdf'), 'not a PDF')
  await ingestWatchFile('invalid.pdf', options)
  options.maxFileSizeMB = 0
  await ingestWatchFile('test.pdf', options)
  await symlink(
    join(options.watchDir, 'test.pdf'),
    join(options.watchDir, 'link.pdf'),
  )
  await ingestWatchFile('link.pdf', options)
  options.waitForStability = async () => -1
  await ingestWatchFile('test.pdf', options)
  expect(options.persist).not.toHaveBeenCalled()
  expect(await readdir(options.uploadDir)).toEqual([])
})
test('does not persist a disappeared or unsupported file', async () => {
  await expect(ingestWatchFile('missing.pdf', options)).rejects.toMatchObject({
    code: 'ENOENT',
  })
  await ingestWatchFile('unsupported.txt', options)
  expect(options.persist).not.toHaveBeenCalled()
})
