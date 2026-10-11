import { beforeEach, expect, test, vi } from 'vitest'
import { createDbStub } from '@/test/db-stub'
import type { ProcessingJobRecord } from '@/worker/types'

const stub = createDbStub()
const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  markCompleted: vi.fn(),
  markFailed: vi.fn(),
  assertLease: vi.fn(),
  stopLease: vi.fn(),
  extractText: vi.fn(),
  extractImageOcr: vi.fn(),
  runLlmAnalysis: vi.fn(),
  generateAndStoreEmbedding: vi.fn(),
}))
vi.doMock('@/db', () => ({ db: stub.db }))
vi.doMock('node:fs/promises', () => ({
  default: { readFile: mocks.readFile },
  readFile: mocks.readFile,
}))
vi.doMock('@/worker/config', () => ({
  WORKER_CONFIG: {
    uploadDir: '/uploads',
    imageMimeTypes: new Set(['image/png']),
  },
}))
class LostLeaseError extends Error {}
let leaseController = new AbortController()
const lease = {
  job: null as ProcessingJobRecord | null,
  get signal() {
    return leaseController.signal
  },
  stop: mocks.stopLease,
}
vi.doMock('@/worker/pipeline/job-lifecycle', () => ({
  LostLeaseError,
  assertLease: mocks.assertLease,
  markCompleted: mocks.markCompleted,
  markFailed: mocks.markFailed,
  startJobLease: (job: ProcessingJobRecord) => Object.assign(lease, { job }),
}))
vi.doMock('@/worker/pipeline/text-extraction', () => ({
  extractText: mocks.extractText,
}))
vi.doMock('@/worker/pipeline/ocr-extraction', () => ({
  extractImageOcr: mocks.extractImageOcr,
}))
vi.doMock('@/worker/pipeline/llm-analysis', () => ({
  runLlmAnalysis: mocks.runLlmAnalysis,
}))
vi.doMock('@/worker/pipeline/embedding', () => ({
  generateAndStoreEmbedding: mocks.generateAndStoreEmbedding,
}))
const { processJob } = await import('./process-job')

const job = (kind: 'full' | 'embedding' = 'full') =>
  ({
    id: 'job',
    document_id: 'doc',
    kind,
    attempts: 1,
    max_attempts: 3,
  }) as ProcessingJobRecord
const doc = (overrides = {}) => ({
  id: 'doc',
  mimeType: 'application/pdf',
  storagePath: 'file.pdf',
  textContent: null,
  ...overrides,
})

beforeEach(() => {
  leaseController = new AbortController()
  stub.reset()
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.readFile.mockResolvedValue(Buffer.from('%PDF'))
  mocks.assertLease.mockImplementation(async () =>
    leaseController.signal.throwIfAborted(),
  )
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

test('runs extraction, LLM analysis and embedding for a full job', async () => {
  stub.results.push([doc()])
  mocks.extractText.mockResolvedValue('Rechnung')
  await processJob(job())
  expect(mocks.readFile).toHaveBeenCalledWith('/uploads/file.pdf')
  expect(mocks.assertLease).toHaveBeenCalledWith(lease)
  expect(stub.writes).toEqual([{ textContent: 'Rechnung' }])
  expect(mocks.runLlmAnalysis).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'doc' }),
    'Rechnung',
    lease,
  )
  expect(mocks.generateAndStoreEmbedding).toHaveBeenCalledWith(
    'doc',
    'Rechnung',
    lease,
  )
  expect(mocks.markCompleted).toHaveBeenCalledWith(job())
  expect(mocks.stopLease).toHaveBeenCalledTimes(1)
})

test('uses OCR for images and skips analysis without text', async () => {
  stub.results.push([doc({ mimeType: 'image/png', storagePath: 'scan.png' })])
  mocks.extractImageOcr.mockResolvedValue('')
  await processJob(job())
  expect(mocks.extractImageOcr).toHaveBeenCalled()
  expect(mocks.runLlmAnalysis).not.toHaveBeenCalled()
  expect(mocks.generateAndStoreEmbedding).not.toHaveBeenCalled()
  expect(mocks.markCompleted).toHaveBeenCalled()
})

test('stores empty text for unsupported types without reading the file', async () => {
  stub.results.push([doc({ mimeType: 'text/plain' })])
  await processJob(job())
  expect(mocks.readFile).not.toHaveBeenCalled()
  expect(stub.writes).toEqual([{ textContent: '' }])
})

test('re-embeds stored text without extraction for embedding jobs', async () => {
  stub.results.push([doc({ textContent: 'Gespeicherter Text' })])
  await processJob(job('embedding'))
  expect(mocks.extractText).not.toHaveBeenCalled()
  expect(mocks.runLlmAnalysis).not.toHaveBeenCalled()
  expect(mocks.generateAndStoreEmbedding).toHaveBeenCalledWith(
    'doc',
    'Gespeicherter Text',
    lease,
  )
})

test('falls back to the full pipeline when an embedding job finds no text', async () => {
  stub.results.push([doc()])
  mocks.extractText.mockResolvedValue('Neu erkannt')
  await processJob(job('embedding'))
  expect(mocks.extractText).toHaveBeenCalled()
})

test('fails missing documents and unsafe paths permanently', async () => {
  stub.results.push([])
  await processJob(job())
  expect(mocks.markFailed).toHaveBeenLastCalledWith(
    job(),
    'Dokument doc nicht gefunden',
    { permanent: true },
  )
  stub.results.push([doc({ storagePath: '../etc/passwd.pdf' })])
  await processJob(job())
  expect(mocks.markFailed).toHaveBeenLastCalledWith(
    job(),
    'Ungültiger Dateipfad: ../etc/passwd.pdf',
    { permanent: true },
  )
  expect(mocks.markCompleted).not.toHaveBeenCalled()
})

test('retries transient errors and always stops the lease', async () => {
  stub.results.push([doc()])
  mocks.extractText.mockRejectedValue(new Error('OCR offline'))
  await processJob(job())
  expect(mocks.markFailed).toHaveBeenCalledWith(job(), 'OCR offline', {
    permanent: false,
  })
  stub.results.push([doc()])
  mocks.extractText.mockRejectedValue('kaputt')
  await processJob(job())
  expect(mocks.markFailed).toHaveBeenLastCalledWith(job(), 'kaputt', {
    permanent: false,
  })
  expect(mocks.stopLease).toHaveBeenCalledTimes(2)
})

test('stops after extraction and records nothing once the lease is lost', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  stub.results.push([doc()])
  mocks.extractText.mockImplementation(async () => {
    leaseController.abort(new LostLeaseError('verloren'))
    return 'Rechnung'
  })
  await processJob(job())
  expect(stub.writes).toEqual([])
  expect(mocks.runLlmAnalysis).not.toHaveBeenCalled()
  expect(mocks.markCompleted).not.toHaveBeenCalled()
  expect(mocks.markFailed).not.toHaveBeenCalled()
  expect(console.warn).toHaveBeenCalledWith('verloren')
  expect(mocks.stopLease).toHaveBeenCalledTimes(1)
})
