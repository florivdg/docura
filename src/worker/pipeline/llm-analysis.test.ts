import { beforeEach, expect, test, vi } from 'vitest'
import { createDbStub } from '@/test/db-stub'
import { snapshotRow } from '@/test/activity-fixture'

const stub = createDbStub()
const mocks = vi.hoisted(() => ({
  chatWithOllama: vi.fn(),
  updateStep: vi.fn(),
  assertLease: vi.fn(),
  applyCorrespondent: vi.fn(),
  applyFolderSuggestion: vi.fn(),
  loadExistingMetadata: vi.fn(),
  applyTags: vi.fn(),
}))
vi.doMock('@/db', () => ({ db: stub.db }))
vi.doMock('@/worker/clients/ollama', () => ({
  chatWithOllama: mocks.chatWithOllama,
}))
vi.doMock('@/worker/pipeline/job-lifecycle', () => ({
  updateStep: mocks.updateStep,
  assertLease: mocks.assertLease,
}))
vi.doMock('@/worker/services/correspondent-service', () => ({
  applyCorrespondent: mocks.applyCorrespondent,
}))
vi.doMock('@/worker/services/folder-service', () => ({
  applyFolderSuggestion: mocks.applyFolderSuggestion,
}))
vi.doMock('@/worker/services/metadata-service', () => ({
  loadExistingMetadata: mocks.loadExistingMetadata,
}))
vi.doMock('@/worker/services/tag-service', () => ({
  applyTags: mocks.applyTags,
}))
const { runLlmAnalysis } = await import('./llm-analysis')

const doc = { id: 'doc', folderId: null, correspondentId: null }
let controller = new AbortController()
const lease = () => ({ signal: controller.signal }) as never

beforeEach(() => {
  controller = new AbortController()
  stub.reset()
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.assertLease.mockImplementation(async () =>
    controller.signal.throwIfAborted(),
  )
  mocks.loadExistingMetadata.mockResolvedValue({
    existingTags: [],
    existingFolders: [],
    existingCorrespondents: [],
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

function answer(value: unknown) {
  mocks.chatWithOllama.mockResolvedValue(JSON.stringify(value))
}

test('applies the suggested metadata and lists the existing names', async () => {
  mocks.loadExistingMetadata.mockResolvedValue({
    existingTags: [{ id: 't', name: 'Steuer' }],
    existingFolders: [{ id: 'f', name: 'Finanzen' }],
    existingCorrespondents: [{ id: 'c', name: 'Finanzamt' }],
  })
  answer({
    title: 'Steuerbescheid 2025',
    tags: ['Steuer'],
    folderSuggestion: 'Finanzen',
    documentDate: '2026-03-01',
    correspondent: 'Finanzamt',
  })
  stub.results.push(
    [snapshotRow('doc', { name: 'Scan.pdf' })],
    [],
    [],
    [{ id: 'doc' }],
    [
      snapshotRow('doc', {
        name: 'Steuerbescheid 2025',
        documentDate: '2026-03-01',
        folderId: 'f',
        folderName: 'Finanzen',
        isFavorite: true,
      }),
    ],
    [{ documentId: 'doc', id: 't', name: 'Steuer' }],
  )
  await runLlmAnalysis(doc, 'Bescheid', lease())
  expect(mocks.updateStep).toHaveBeenCalledWith(
    expect.anything(),
    'llm_analysis',
  )
  const [systemPrompt, text, signal] = mocks.chatWithOllama.mock.calls[0]
  expect(systemPrompt).toContain('Vorhandene Tags: Steuer')
  expect(systemPrompt).toContain('Vorhandene Korrespondenten: Finanzamt')
  expect(text).toBe('Bescheid')
  expect(signal).toBe(controller.signal)
  expect(mocks.assertLease).toHaveBeenCalledTimes(1)
  // Outside a transaction the snapshots do not lock.
  expect(stub.queries.filter((kind) => kind.includes(' for '))).toEqual([])
  expect(stub.writes.slice(0, 2)).toEqual([
    { name: 'Steuerbescheid 2025' },
    { documentDate: '2026-03-01' },
  ])
  expect(stub.writes[2]).toEqual([
    expect.objectContaining({
      documentId: 'doc',
      documentName: 'Steuerbescheid 2025',
      action: 'updated',
      actorType: 'system',
      actorId: null,
      actorName: 'KI-Analyse',
      changes: {
        name: { from: 'Scan.pdf', to: 'Steuerbescheid 2025' },
        folder: { from: null, to: { id: 'f', name: 'Finanzen' } },
        documentDate: { from: null, to: '2026-03-01' },
        tags: { from: [], to: [{ id: 't', name: 'Steuer' }] },
      },
    }),
  ])
  expect(mocks.applyTags).toHaveBeenCalledWith('doc', ['Steuer'], true)
  expect(mocks.applyFolderSuggestion).toHaveBeenCalledWith(doc, 'Finanzen')
  expect(mocks.applyCorrespondent).toHaveBeenCalledWith(doc, 'Finanzamt')
})

test('keeps a manually set Belegdatum and records no change', async () => {
  answer({ documentDate: '2026-03-01' })
  const dated = snapshotRow('doc', { documentDate: '2026-01-01' })
  stub.results.push([dated], [], [], [dated], [])
  await runLlmAnalysis(doc, 'Bescheid', lease())
  expect(console.log).toHaveBeenCalledWith(
    expect.stringContaining('bereits gesetzt'),
  )
  expect(stub.queries).not.toContain('insert')
})

test('applies the analysis even when its activity cannot be recorded', async () => {
  answer({ title: 'Neu' })
  stub.results.push(new Error('lock timeout'), [])
  await runLlmAnalysis(doc, 'Text', lease())
  expect(stub.writes).toEqual([{ name: 'Neu' }])
  answer({ title: 'Neu' })
  stub.reset()
  stub.results.push(
    [snapshotRow('doc')],
    [],
    [],
    [snapshotRow('doc', { name: 'Neu' })],
    [],
    new Error('insert failed'),
  )
  await runLlmAnalysis(doc, 'Text', lease())
  expect(stub.queries.at(-1)).toBe('insert')
  expect(console.warn).toHaveBeenCalledTimes(2)
  expect(console.warn).toHaveBeenLastCalledWith(
    expect.stringContaining('insert failed'),
  )
})

test('ignores answers that are not JSON or fail entirely', async () => {
  mocks.chatWithOllama.mockResolvedValueOnce('kein JSON')
  await runLlmAnalysis(doc, 'Text', lease())
  mocks.chatWithOllama.mockRejectedValueOnce(new Error('Ollama offline'))
  await runLlmAnalysis(doc, 'Text', lease())
  mocks.chatWithOllama.mockRejectedValueOnce('kaputt')
  await runLlmAnalysis(doc, 'Text', lease())
  expect(stub.writes).toEqual([])
  // An analysis without suggestions reads no snapshots either.
  expect(stub.queries).toEqual([])
  expect(mocks.applyTags).not.toHaveBeenCalled()
  expect(console.warn).toHaveBeenCalledTimes(3)
})

test('writes nothing once the lease is lost during the analysis', async () => {
  mocks.chatWithOllama.mockImplementation(async () => {
    controller.abort(new Error('Lease verloren'))
    return JSON.stringify({ title: 'Titel' })
  })
  await expect(runLlmAnalysis(doc, 'Text', lease())).rejects.toThrow(
    'Lease verloren',
  )
  expect(stub.writes).toEqual([])
})

test('records the fields written before a later step fails', async () => {
  answer({ title: 'Neu', documentDate: '2026-03-01' })
  stub.results.push(
    [snapshotRow('doc')],
    [],
    [],
    new Error('date update failed'),
    [snapshotRow('doc', { name: 'Neu' })],
    [],
  )
  await expect(runLlmAnalysis(doc, 'Text', lease())).rejects.toThrow(
    'date update failed',
  )
  expect(stub.queries.at(-1)).toBe('insert')
  expect(stub.writes.at(-1)).toEqual([
    expect.objectContaining({
      action: 'updated',
      changes: { name: { from: 'Rechnung.pdf', to: 'Neu' } },
    }),
  ])
})

test('does not record concurrent changes of fields it did not suggest', async () => {
  answer({ title: 'Neu' })
  stub.results.push(
    [snapshotRow('doc')],
    [],
    [],
    [
      snapshotRow('doc', {
        name: 'Neu',
        folderId: 'f',
        folderName: 'Finanzen',
        isFavorite: true,
      }),
    ],
    [],
  )
  await runLlmAnalysis(doc, 'Text', lease())
  expect(stub.writes.at(-1)).toEqual([
    expect.objectContaining({
      changes: { name: { from: 'Rechnung.pdf', to: 'Neu' } },
    }),
  ])
})
