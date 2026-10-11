import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ref } from 'vue'
import { detailFixture } from '@/test/document-fixture'
import { useDocumentActions } from './useDocumentActions'

const apiFetch = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-fetch', () => ({ apiFetch }))

const alert = vi.fn()
const refetch = vi.fn(async () => {})

beforeEach(() => {
  vi.stubGlobal('alert', alert)
  vi.stubGlobal('location', { href: '' })
})
afterEach(() => {
  apiFetch.mockReset()
  alert.mockReset()
  refetch.mockClear()
  vi.unstubAllGlobals()
})

function actions() {
  return useDocumentActions('doc', ref(detailFixture()), vi.fn(), refetch)
}

function respond(status: number, body: unknown = {}) {
  apiFetch.mockResolvedValueOnce(Response.json(body, { status }))
}

test('queues reprocessing and refetches the document', async () => {
  respond(201, { job: { id: 'job' } })
  const { handleReprocess, reprocessing } = actions()
  await handleReprocess()
  expect(apiFetch).toHaveBeenCalledWith(
    '/api/documents/doc/reprocess',
    expect.objectContaining({ method: 'POST' }),
  )
  expect(refetch).toHaveBeenCalledTimes(1)
  expect(reprocessing.value).toBe(false)
})

test('shows the server reason when reprocessing is rejected', async () => {
  respond(409, { error: 'Verarbeitung läuft bereits' })
  await actions().handleReprocess()
  expect(alert).toHaveBeenCalledWith('Verarbeitung läuft bereits')
  expect(refetch).not.toHaveBeenCalled()
})

test('leaves the page after deleting and permanently deleting', async () => {
  respond(200)
  await actions().handleDelete()
  expect(apiFetch).toHaveBeenLastCalledWith(
    '/api/documents/doc',
    expect.objectContaining({ method: 'DELETE' }),
  )
  expect(window.location.href).toBe('/documents')
  respond(200)
  await actions().handlePermanentDelete()
  expect(apiFetch).toHaveBeenLastCalledWith(
    '/api/documents/doc?permanent=true',
    expect.objectContaining({ method: 'DELETE' }),
  )
  expect(window.location.href).toBe('/documents?view=trash')
})

test('alerts the fallback message when a delete fails', async () => {
  apiFetch.mockRejectedValueOnce(new TypeError('offline'))
  await actions().handleDelete()
  expect(alert).toHaveBeenCalledWith('Fehler beim Löschen des Dokuments.')
  expect(window.location.href).toBe('')
})
