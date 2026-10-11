import { beforeEach, expect, test, vi } from 'vitest'
import { createDbStub } from '@/test/db-stub'

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
  stub.results.push([], [{ id: 'doc' }])
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
  expect(stub.writes).toEqual([
    { name: 'Steuerbescheid 2025' },
    { documentDate: '2026-03-01' },
  ])
  expect(mocks.applyTags).toHaveBeenCalledWith('doc', ['Steuer'], true)
  expect(mocks.applyFolderSuggestion).toHaveBeenCalledWith(doc, 'Finanzen')
  expect(mocks.applyCorrespondent).toHaveBeenCalledWith(doc, 'Finanzamt')
})

test('keeps a manually set Belegdatum', async () => {
  answer({ documentDate: '2026-03-01' })
  stub.results.push([])
  await runLlmAnalysis(doc, 'Bescheid', lease())
  expect(console.log).toHaveBeenCalledWith(
    expect.stringContaining('bereits gesetzt'),
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
