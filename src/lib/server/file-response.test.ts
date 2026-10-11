// @vitest-environment node
import { chmodSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import {
  fileResponse,
  openStoredFile,
  type FileResponseOptions,
} from './file-response'
import { tempDir } from '@/test/temp-dir'

const dir = tempDir('file')
const path = join(dir, 'doc.pdf')
writeFileSync(path, '0123456789')

const options = (
  overrides: Partial<FileResponseOptions> = {},
): FileResponseOptions => ({
  mimeType: 'application/pdf',
  name: 'Bericht.pdf',
  sha256: 'abc',
  disposition: 'inline',
  ...overrides,
})

test('streams the full file with length, validators and disposition', async () => {
  const response = await fileResponse(path, options())
  expect(response.status).toBe(200)
  expect(await response.text()).toBe('0123456789')
  expect(Object.fromEntries(response.headers)).toMatchObject({
    'content-type': 'application/pdf',
    'content-length': '10',
    'accept-ranges': 'bytes',
    etag: '"abc"',
    'cache-control': 'private, no-cache',
    'x-content-type-options': 'nosniff',
    'content-disposition': `inline; filename="Bericht.pdf"; filename*=UTF-8''Bericht.pdf`,
  })
  expect(response.headers.get('last-modified')).toMatch(/GMT$/)
})

test('answers a single range with 206 and an unsatisfiable one with 416', async () => {
  const partial = await fileResponse(
    path,
    options({ rangeHeader: 'bytes=2-4' }),
  )
  expect(partial.status).toBe(206)
  expect(partial.headers.get('content-range')).toBe('bytes 2-4/10')
  expect(partial.headers.get('content-length')).toBe('3')
  expect(await partial.text()).toBe('234')
  const outside = await fileResponse(
    path,
    options({ rangeHeader: 'bytes=20-' }),
  )
  expect(outside.status).toBe(416)
  expect(outside.headers.get('content-range')).toBe('bytes */10')
})

test('ignores the range when If-Range names another version', async () => {
  const response = await fileResponse(
    path,
    options({ rangeHeader: 'bytes=2-4', ifRange: '"old"' }),
  )
  expect(response.status).toBe(200)
  expect(await response.text()).toBe('0123456789')
})

test('honors If-Range only with a matching strong ETag', async () => {
  const strong = await fileResponse(
    path,
    options({ rangeHeader: 'bytes=2-4', ifRange: '"abc"' }),
  )
  expect(strong.status).toBe(206)
  const weakEtag = (
    await fileResponse(path, options({ sha256: null }))
  ).headers.get('etag')!
  const weak = await fileResponse(
    path,
    options({ sha256: null, rangeHeader: 'bytes=2-4', ifRange: weakEtag }),
  )
  expect(weak.status).toBe(200)
  expect(await weak.text()).toBe('0123456789')
})

test('answers a matching If-None-Match with 304 and a missing file with 404', async () => {
  const cached = await fileResponse(path, options({ ifNoneMatch: '"abc"' }))
  expect(cached.status).toBe(304)
  expect(cached.headers.get('etag')).toBe('"abc"')
  const weak = await fileResponse(path, options({ sha256: null }))
  expect(weak.headers.get('etag')).toMatch(/^W\/"10-\d+"$/)
  const missing = await fileResponse(join(dir, 'missing.pdf'), options())
  expect(missing.status).toBe(404)
  expect(await missing.json()).toEqual({ error: 'Datei nicht gefunden' })
})

test('rethrows other file system errors', async () => {
  await expect(fileResponse(join(path, 'child'), options())).rejects.toThrow()
})

test('opens stored files and keeps streaming after the file is deleted', async () => {
  const stored = join(dir, 'stored.pdf')
  writeFileSync(stored, 'abc')
  const file = await openStoredFile(dir, 'stored.pdf')
  expect(file).not.toBeNull()
  unlinkSync(stored)
  expect(await new Response(file!.stream).text()).toBe('abc')
  await file!.close()
})

test('maps missing, escaping, directory and unreadable paths to null', async () => {
  mkdirSync(join(dir, 'sub'))
  expect(await openStoredFile(dir, 'missing.pdf')).toBeNull()
  expect(await openStoredFile(dir, '../doc.pdf')).toBeNull()
  expect(await openStoredFile(dir, 'sub')).toBeNull()
  expect(await openStoredFile(dir, 'doc.pdf/child')).toBeNull()
  if (process.getuid?.() === 0) return
  const locked = join(dir, 'locked.pdf')
  writeFileSync(locked, 'x')
  chmodSync(locked, 0o000)
  expect(await openStoredFile(dir, 'locked.pdf')).toBeNull()
})
