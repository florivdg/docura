// @vitest-environment node
import { readdirSync } from 'node:fs'
import type { APIContext } from 'astro'
import { beforeEach, expect, onTestFinished, test, vi } from 'vitest'
import { createDbStub } from '@/test/db-stub'
import { tempDir } from '@/test/temp-dir'

const uploadDir = tempDir('upload')
vi.stubEnv('UPLOAD_DIR', uploadDir)
const stub = createDbStub()
vi.doMock('@/db', () => ({ db: stub.db }))
const { POST } = await import('./upload')

const FOLDER_ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'
const pdf = (content = '%PDF-1.7 test') =>
  new File([content], 'Rechnung.pdf', { type: 'application/pdf' })

beforeEach(stub.reset)

async function upload(fields: Record<string, string | File> | string) {
  const body =
    typeof fields === 'string'
      ? fields
      : Object.entries(fields).reduce((form, [key, value]) => {
          form.append(key, value)
          return form
        }, new FormData())
  const request = new Request('http://localhost/api/documents/upload', {
    method: 'POST',
    body,
    headers:
      typeof body === 'string' ? { 'Content-Type': 'multipart/form-data' } : {},
  })
  const response = await POST({ request } as unknown as APIContext)
  return { status: response.status, body: await response.json() }
}

test('rejects invalid form data, files and folders with 400', async () => {
  const error = async (fields: Parameters<typeof upload>[0]) => {
    const result = await upload(fields)
    expect(result.status).toBe(400)
    return result.body.error
  }
  expect(await error('kaputt')).toBe('Ungültige Formulardaten')
  expect(await error({})).toBe('Keine Datei hochgeladen')
  const text = new File(['x'], 'a.txt', { type: 'text/plain' })
  expect(await error({ file: text })).toBe('Dateityp nicht unterstützt')
  expect(await error({ file: pdf(), folderId: 'bad' })).toBe(
    'Ungültige Ordner-ID',
  )
  stub.results.push([])
  expect(await error({ file: pdf(), folderId: FOLDER_ID })).toBe(
    'Ordner nicht gefunden',
  )
  expect(await error({ file: pdf('no pdf') })).toBe(
    'Dateiinhalt stimmt nicht mit dem deklarierten Typ überein',
  )
  expect(readdirSync(uploadDir)).toEqual([])
})

test('rejects files above the size limit', async () => {
  vi.stubEnv('MAX_FILE_SIZE_MB', '0.000001')
  onTestFinished(() => {
    vi.unstubAllEnvs()
  })
  const result = await upload({ file: pdf() })
  expect(result.status).toBe(400)
  expect(result.body.error).toMatch(/^Datei zu groß/)
})

test('returns 409 for known content without storing the file', async () => {
  const existing = { id: 'doc', name: 'Alt.pdf', trashedAt: null }
  stub.results.push([existing])
  const result = await upload({ file: pdf() })
  expect(result.status).toBe(409)
  expect(result.body.duplicate).toEqual(existing)
  expect(readdirSync(uploadDir)).toEqual([])
})

test('stores the file, the document and its processing job', async () => {
  stub.results.push([{ id: FOLDER_ID }], [], [{ id: 'doc' }], [{ id: 'job' }])
  const result = await upload({ file: pdf(), folderId: FOLDER_ID })
  expect(result.status).toBe(201)
  expect(result.body).toEqual({
    document: { id: 'doc' },
    processingJobId: 'job',
  })
  expect(stub.writes[0]).toMatchObject({
    name: 'Rechnung.pdf',
    mimeType: 'application/pdf',
    folderId: FOLDER_ID,
  })
  expect(readdirSync(uploadDir)).toHaveLength(1)
})

test('removes the file when the insert loses a duplicate race', async () => {
  const existing = { id: 'other', name: 'Andere.pdf', trashedAt: null }
  const stored = readdirSync(uploadDir)
  stub.results.push([], Object.assign(new Error('dup'), { code: '23505' }), [
    existing,
  ])
  const result = await upload({ file: pdf('%PDF-race') })
  expect(result.status).toBe(409)
  expect(result.body.duplicate).toEqual(existing)
  expect(readdirSync(uploadDir)).toEqual(stored)
})

test('rethrows other storage errors after removing the file', async () => {
  const stored = readdirSync(uploadDir)
  stub.results.push([], new Error('db down'))
  await expect(upload({ file: pdf('%PDF-down') })).rejects.toThrow('db down')
  expect(readdirSync(uploadDir)).toEqual(stored)
})
