// @vitest-environment node
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, expect, test, vi } from 'vitest'
import { computeSha256 } from '@/lib/hash'
import { createDbStub } from '@/test/db-stub'
import { tempDir } from '@/test/temp-dir'

const stub = createDbStub()
vi.doMock('@/db', () => ({ db: stub.db }))
const { backfillSha256, backfillSummary } = await import('./sha256-backfill')

const uploadDir = tempDir('backfill')
writeFileSync(join(uploadDir, 'a.pdf'), 'a')
writeFileSync(join(uploadDir, 'b.pdf'), 'b')
writeFileSync(join(uploadDir, 'c.pdf'), 'c')

const doc = (id: string, storagePath: string) => ({
  id,
  name: `${id}.pdf`,
  storagePath,
})

type ConsoleSpy = { mock: { calls: unknown[][] } }
let log: ConsoleSpy
let warn: ConsoleSpy
beforeEach(() => {
  stub.reset()
  log = vi.spyOn(console, 'log').mockImplementation(() => {})
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

const output = (spy: ConsoleSpy) =>
  spy.mock.calls.map((call) => String(call[0])).join('\n')

test('does nothing without unhashed documents', async () => {
  stub.results.push([])
  await backfillSha256(uploadDir)
  expect(output(log)).toContain('Keine Dokumente ohne SHA256-Hash gefunden.')
  expect(stub.queries).toEqual(['select'])
})

test('hashes files and counts every kind of skipped document', async () => {
  const duplicateError = Object.assign(new Error('dup'), { code: '23505' })
  stub.results.push(
    [
      doc('a', 'a.pdf'),
      doc('b', 'b.pdf'),
      doc('c', 'c.pdf'),
      doc('gone', 'gone.pdf'),
      doc('escape', '../x.pdf'),
      doc('dir', '.'),
    ],
    [{ id: 'a' }], // a: hash stored
    [], // b: hashed concurrently in the meantime
    duplicateError, // c: same content as another document
    [{ id: 'other', name: 'Andere.pdf', trashedAt: null }],
  )
  await backfillSha256(uploadDir)
  expect(stub.writes[0]).toMatchObject({
    sha256: computeSha256(Buffer.from('a')),
  })
  const logged = output(log)
  expect(logged).toContain('Hash gesetzt: "a.pdf" (a)')
  expect(logged).toContain('Hash zwischenzeitlich gesetzt, übersprungen')
  expect(logged).toMatch(/Hash gesetzt: +1/)
  expect(logged).toMatch(/Dateien fehlen: +2/)
  expect(logged).toMatch(/Ungültige Pfade: +1/)
  expect(logged).toMatch(/Bereits gehasht: +1/)
  const warned = output(warn)
  expect(warned).toContain('inhaltsgleich mit "Andere.pdf" (other)')
  expect(warned).toContain('Datei nicht gefunden, übersprungen: "gone.pdf"')
  expect(warned).toContain('Datei nicht lesbar, übersprungen: "dir.pdf"')
})

test('rethrows database errors other than duplicates', async () => {
  stub.results.push([doc('a', 'a.pdf')], new Error('db down'))
  await expect(backfillSha256(uploadDir)).rejects.toThrow('db down')
})

test('omits empty optional counters and names unknown duplicates', async () => {
  const lines = backfillSummary({
    updated: 2,
    duplicates: 0,
    missing: 0,
    invalidPaths: 0,
    alreadyHashed: 0,
  })
  expect(lines).toHaveLength(4)
  stub.results.push(
    [doc('c', 'c.pdf')],
    Object.assign(new Error('dup'), { errno: '23505' }),
    [],
  )
  await backfillSha256(uploadDir)
  expect(output(warn)).toContain('einem anderen Dokument (SHA256')
  expect(output(log)).toContain('Hinweis: Dokumente ohne Hash')
})
