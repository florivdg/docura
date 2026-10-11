// @vitest-environment node
import { mkdirSync, utimesSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, vi } from 'vitest'
import {
  deleteOrphans,
  diffStorage,
  formatStorageReport,
  parseStorageCheckArgs,
  runStorageCheck,
  type StorageEntry,
  type StorageRow,
} from './storage-check'
import { tempDir } from '@/test/temp-dir'

const NOW = 10 * 3_600_000
const HOUR = 3_600_000

function row(overrides: Partial<StorageRow>): StorageRow {
  return {
    id: 'id',
    name: 'Rechnung.pdf',
    storagePath: 'a.pdf',
    fileSize: 3,
    sha256: null,
    trashedAt: null,
    ...overrides,
  }
}

const entry = (name: string, bytes = 3, mtimeMs = 0): StorageEntry => ({
  name,
  bytes,
  mtimeMs,
})

test('reports missing files, orphans and size mismatches', () => {
  const report = diffStorage(
    [
      row({ id: 'a' }),
      row({ id: 'b', storagePath: 'b.pdf', fileSize: 5 }),
      row({ id: 'c', storagePath: 'c.pdf', trashedAt: new Date(0) }),
    ],
    [entry('a.pdf'), entry('b.pdf'), entry('orphan.pdf', 7, NOW - 2 * HOUR)],
    NOW,
    HOUR,
  )
  expect(report.missingFiles).toEqual([
    {
      id: 'c',
      name: 'Rechnung.pdf',
      storagePath: 'c.pdf',
      trashedAt: '1970-01-01T00:00:00.000Z',
    },
  ])
  expect(report.sizeMismatches).toEqual([
    {
      id: 'b',
      name: 'Rechnung.pdf',
      storagePath: 'b.pdf',
      expected: 5,
      actual: 3,
    },
  ])
  expect(report.orphanFiles).toEqual([
    { name: 'orphan.pdf', bytes: 7, ageMinutes: 120 },
  ])
  expect(report.pendingFiles).toBe(0)
})

test('counts young orphans as pending', () => {
  const report = diffStorage(
    [],
    [entry('young.pdf', 1, NOW - 60_000)],
    NOW,
    HOUR,
  )
  expect(report.orphanFiles).toEqual([])
  expect(report.pendingFiles).toBe(1)
  expect(formatStorageReport(report)).toContain('Speicher ist konsistent.')
})

test('parses the CLI flags and rejects unknown ones', () => {
  expect(parseStorageCheckArgs([])).toEqual({
    json: false,
    verifyHashes: false,
    deleteOrphans: false,
  })
  expect(
    parseStorageCheckArgs(['--json', '--verify-hashes', '--delete-orphans']),
  ).toEqual({ json: true, verifyHashes: true, deleteOrphans: true })
  expect(() => parseStorageCheckArgs(['--delete-rows'])).toThrow(
    'Unbekannte Option',
  )
})

test('deleteOrphans removes only paths inside UPLOAD_DIR', async () => {
  const remove = vi.fn(async () => {})
  const deleted = await deleteOrphans(
    [{ name: 'o.pdf', bytes: 1, ageMinutes: 90 }],
    '/data/uploads',
    remove,
  )
  expect(deleted).toEqual(['/data/uploads/o.pdf'])
  expect(remove).toHaveBeenCalledWith('/data/uploads/o.pdf')
  await expect(
    deleteOrphans(
      [{ name: '../x', bytes: 1, ageMinutes: 90 }],
      '/data/uploads',
      remove,
    ),
  ).rejects.toThrow('Ungültiger Dateipfad')
})

function uploadDirWithFiles() {
  const dir = tempDir('storage')
  writeFileSync(join(dir, 'a.pdf'), 'abc')
  writeFileSync(join(dir, 'old.pdf'), 'old')
  writeFileSync(join(dir, 'new.pdf'), 'new')
  writeFileSync(join(dir, 'snap.pdf.tmp'), 'tmp')
  writeFileSync(join(dir, '.DS_Store'), 'mac')
  mkdirSync(join(dir, 'nested'))
  const twoHoursAgo = new Date(Date.now() - 2 * HOUR)
  utimesSync(join(dir, 'old.pdf'), twoHoursAgo, twoHoursAgo)
  return dir
}

const flags = { json: false, verifyHashes: false, deleteOrphans: false }

test('a dry run ignores snapshots, dotfiles and directories, only reports and exits with 1 on findings', async () => {
  const uploadDir = uploadDirWithFiles()
  const result = await runStorageCheck(flags, {
    uploadDir,
    minAgeMs: HOUR,
    now: Date.now(),
    loadRows: async () => [row({ sha256: 'abc' })],
    hashFile: async () => 'abc',
  })
  expect(result.exitCode).toBe(1)
  expect(result.output).toContain('Dateien ohne Dokument (1):')
  expect(result.output).toContain('Noch nicht geprüfte junge Dateien: 1')
  expect(existsSync(join(uploadDir, 'old.pdf'))).toBe(true)
})

test('--delete-orphans removes old orphans only, --verify-hashes compares hashes', async () => {
  const uploadDir = uploadDirWithFiles()
  const hashFile = vi.fn(async () => 'actual')
  const result = await runStorageCheck(
    { json: true, verifyHashes: true, deleteOrphans: true },
    {
      uploadDir,
      minAgeMs: HOUR,
      now: Date.now(),
      loadRows: async () => [
        row({ sha256: 'expected' }),
        row({ id: 'gone', storagePath: 'gone.pdf', sha256: 'x' }),
        row({ id: 'size', storagePath: 'new.pdf', fileSize: 9, sha256: 'y' }),
      ],
      hashFile,
    },
  )
  const report = JSON.parse(result.output)
  // Missing files and size mismatches are not hashed again.
  expect(hashFile).toHaveBeenCalledOnce()
  expect(report.sizeMismatches).toHaveLength(1)
  expect(report.deletedFiles).toEqual([join(uploadDir, 'old.pdf')])
  expect(report.hashMismatches).toMatchObject([
    { id: 'id', expected: 'expected', actual: 'actual' },
  ])
  expect(report.missingFiles).toHaveLength(1)
  expect(existsSync(join(uploadDir, 'old.pdf'))).toBe(false)
  expect(existsSync(join(uploadDir, 'new.pdf'))).toBe(true)
  expect(existsSync(join(uploadDir, 'snap.pdf.tmp'))).toBe(true)
  expect(result.exitCode).toBe(1)
  expect(formatStorageReport(report)).toContain('Gelöschte verwaiste Dateien')
})

test('exits with 0 once the only findings were deleted orphans', async () => {
  const uploadDir = uploadDirWithFiles()
  const result = await runStorageCheck(
    { ...flags, deleteOrphans: true },
    {
      uploadDir,
      minAgeMs: HOUR,
      now: Date.now(),
      loadRows: async () => [row({})],
      hashFile: async () => '',
    },
  )
  expect(result.exitCode).toBe(0)
})

const enoent = () =>
  Object.assign(new Error('gone'), { code: 'ENOENT' }) as NodeJS.ErrnoException

test('reports a file that vanishes while hashing as missing', async () => {
  const uploadDir = uploadDirWithFiles()
  const result = await runStorageCheck(
    { ...flags, verifyHashes: true },
    {
      uploadDir,
      minAgeMs: HOUR,
      now: Date.now(),
      loadRows: async () => [
        row({ sha256: 'abc' }),
        row({ id: 'old', storagePath: 'old.pdf', sha256: 'abc' }),
      ],
      hashFile: async (path) => {
        if (path.endsWith('old.pdf')) throw enoent()
        return 'abc'
      },
    },
  )
  expect(result.report.missingFiles).toMatchObject([{ id: 'old' }])
  expect(result.report.hashMismatches).toEqual([])
  expect(result.exitCode).toBe(1)
  await expect(
    runStorageCheck(
      { ...flags, verifyHashes: true },
      {
        uploadDir,
        minAgeMs: HOUR,
        now: Date.now(),
        loadRows: async () => [row({ sha256: 'abc' })],
        hashFile: async () => {
          throw new Error('EIO')
        },
      },
    ),
  ).rejects.toThrow('EIO')
})

test('deleteOrphans treats an orphan that is already gone as deleted', async () => {
  const remove = vi.fn(async (path: string) => {
    if (path.endsWith('a.pdf')) throw enoent()
  })
  const orphans = ['a.pdf', 'b.pdf'].map((name) => ({
    name,
    bytes: 1,
    ageMinutes: 90,
  }))
  const deleted = await deleteOrphans(orphans, '/data/uploads', remove)
  expect(deleted).toEqual(['/data/uploads/a.pdf', '/data/uploads/b.pdf'])
  expect(remove).toHaveBeenCalledTimes(2)
  const failing = vi.fn(async () => {
    throw Object.assign(new Error('denied'), { code: 'EACCES' })
  })
  await expect(
    deleteOrphans(orphans, '/data/uploads', failing),
  ).rejects.toThrow('denied')
})
