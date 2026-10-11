import { expect, test, vi } from 'vitest'
import { createDbStub } from '@/test/db-stub'
import { snapshotRow } from '@/test/activity-fixture'
import { detailFixture, reprocessCandidate } from '@/test/document-fixture'
import { routeCaller } from '@/test/route-call'
import { tempDir } from '@/test/temp-dir'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { STORAGE_CONFIG } from '@/lib/server/storage-config'
const stub = createDbStub()
vi.doMock('@/db', () => ({ db: stub.db }))
const detail = await import('./[id]')
const list = await import('./index')
const search = await import('./search')
const bulk = await import('./bulk')
const trash = await import('./trash')
const reprocess = await import('./[id]/reprocess')
const file = await import('./[id]/file')
const exporter = await import('./export')
const id = detailFixture().id
const call = routeCaller(stub, id)
test('returns 400 and 404 without modifying a document', async () => {
  expect((await call(detail.GET, { id: 'bad' })).status).toBe(400)
  expect((await call(detail.GET)).status).toBe(404)
  expect((await call(detail.DELETE)).status).toBe(404)
  expect((await call(detail.PATCH)).status).toBe(404)
  expect(stub.writes).toEqual([])
})
/** Activity entries written by the last insert of the request. */
function recordedActivities() {
  return stub.writes.at(-1) as Record<string, unknown>[]
}

test('PATCH preserves the response shape and records the change', async () => {
  stub.results.push(
    [{ id }],
    [snapshotRow(id, { name: 'Alt.pdf' })],
    [],
    [],
    [snapshotRow(id, { name: 'Rechnung' })],
    [],
    [],
    [detailFixture()],
    [],
    [],
  )
  const response = await call(detail.PATCH, {
    body: { name: ' Rechnung ', folderId: null },
  })
  expect(response.status).toBe(200)
  expect(stub.writes[0]).toEqual({ name: 'Rechnung', folderId: null })
  expect(recordedActivities()).toEqual([
    expect.objectContaining({
      documentId: id,
      documentName: 'Rechnung',
      action: 'updated',
      actorType: 'user',
      actorId: 'user-1',
      actorName: 'Test User',
      changes: { name: { from: 'Alt.pdf', to: 'Rechnung' } },
    }),
  ])
  expect((await response.json()).document.id).toBe(id)
})

test('PATCH records nothing when the values stay the same', async () => {
  stub.results.push([{ id }], [snapshotRow(id)], [], [], [snapshotRow(id)])
  await call(detail.PATCH, { body: { name: 'Rechnung.pdf' } })
  expect(stub.queries).not.toContain('insert')
})

test('PATCH rejects malformed JSON and validates missing tags', async () => {
  stub.results.push([{ id }])
  expect((await call(detail.PATCH, { body: null })).status).toBe(400)
  stub.results.push([{ id }], [])
  expect((await call(detail.PATCH, { body: { tagIds: [id] } })).status).toBe(
    404,
  )
})
test('DELETE guards permanent deletion and already trashed documents', async () => {
  stub.results.push([{ id, storagePath: 'file.pdf', trashedAt: null }])
  expect((await call(detail.DELETE, { path: '/?permanent=true' })).status).toBe(
    400,
  )
  stub.results.push([{ id, trashedAt: new Date() }])
  expect((await call(detail.DELETE)).status).toBe(409)
  stub.results.push(
    [{ id, trashedAt: null }],
    [snapshotRow(id)],
    [],
    [],
    [snapshotRow(id, { trashedAt: new Date() })],
  )
  expect((await call(detail.DELETE)).status).toBe(200)
  expect(stub.writes[0]).toHaveProperty('trashedAt')
  expect(recordedActivities()).toEqual([
    expect.objectContaining({ action: 'trashed', changes: null }),
  ])
})
test('list and search validate filters and keep distinct empty result shapes', async () => {
  expect((await call(list.GET, { path: '/?view=bad' })).status).toBe(400)
  expect((await call(search.GET, { path: '/?tagIds=bad' })).status).toBe(400)
  const empty = await call(search.GET, { path: '/?q=' })
  expect(await empty.json()).toEqual({
    results: [],
    total: 0,
    page: 1,
    pageSize: 20,
  })
  stub.results.push([{ count: 0 }], [])
  const listing = await call(list.GET, { path: '/?page=bad' })
  expect(await listing.json()).toEqual({
    documents: [],
    total: 0,
    page: 1,
    pageSize: 20,
  })
})
test('fulltext search returns tagged rows with pagination', async () => {
  stub.results.push(
    [{ count: 1 }],
    [{ id, name: 'Rechnung' }],
    [{ documentId: id, tagId: id, tagName: 'Steuer', tagColor: null }],
  )
  const response = await call(search.GET, {
    path: '/?q=Rechnung&sort=name&order=asc',
  })
  const data = await response.json()
  expect(data.total).toBe(1)
  expect(data.results[0].tags).toEqual([{ id, name: 'Steuer', color: null }])
  const single = await call(search.GET, { path: '/?q=a' })
  expect((await single.json()).results).toEqual([])
})

test('bulk actions validate all records and return a unique document count', async () => {
  expect(
    (await call(bulk.POST, { body: { ids: [id], action: 'favorite' } })).status,
  ).toBe(404)
  stub.results.push([{ id }], [])
  const response = await call(bulk.POST, {
    body: { ids: [id, id], action: 'favorite' },
  })
  expect(await response.json()).toEqual({ success: true, count: 1 })
  expect(stub.writes).toEqual([{ isFavorite: true }])
  stub.results.push([{ id }], [{ id }], [])
  expect(
    (
      await call(bulk.POST, {
        body: { ids: [id], action: 'addTags', tagIds: [id, id] },
      })
    ).status,
  ).toBe(200)
  expect(stub.writes[1]).toEqual([{ documentId: id, tagId: id }])
})

test('bulk trash records one entry per changed document in one batch', async () => {
  const other = '22222222-2222-4222-8222-222222222222'
  const trashedAt = new Date()
  stub.results.push(
    [{ id }, { id: other }],
    [snapshotRow(id), snapshotRow(other)],
    [],
    [],
    [snapshotRow(id, { trashedAt }), snapshotRow(other, { trashedAt })],
    [],
  )
  const response = await call(bulk.POST, {
    body: { ids: [id, other], action: 'trash' },
  })
  expect(await response.json()).toEqual({ success: true, count: 2 })
  expect(stub.queries).toEqual([
    'select',
    'select for no key update',
    'select',
    'update',
    'select for no key update',
    'select',
    'insert',
  ])
  const [first, second] = recordedActivities()
  expect(first).toMatchObject({ documentId: id, action: 'trashed' })
  expect(second).toMatchObject({ documentId: other, action: 'trashed' })
  expect(second.batchId).toBe(first.batchId)
})

test('emptying the trash validates the action and deletes trashed rows', async () => {
  expect((await call(trash.GET)).status).toBe(200)
  expect((await call(trash.POST, { body: '{' })).status).toBe(400)
  expect((await call(trash.POST, { body: { action: 'x' } })).status).toBe(400)
  stub.results.push([
    { name: 'A', storagePath: 'missing-trash-a.pdf' },
    { name: 'B', storagePath: 'missing-trash-b.pdf' },
  ])
  const response = await call(trash.POST, { body: { action: 'empty' } })
  expect(await response.json()).toEqual({ success: true, deleted: 2 })
  expect(stub.queries).toEqual(['delete', 'insert'])
  const [first, second] = recordedActivities()
  expect(first).toMatchObject({
    documentId: null,
    documentName: 'A',
    action: 'deleted',
    actorName: 'Test User',
  })
  expect(second.batchId).toBe(first.batchId)
})

test('permanent DELETE removes a trashed document row before its file', async () => {
  stub.results.push(
    [{ id, trashedAt: new Date() }],
    [{ name: 'Rechnung.pdf', storagePath: 'missing-permanent-test.pdf' }],
  )
  const response = await call(detail.DELETE, { path: '/?permanent=true' })
  expect(await response.json()).toEqual({ success: true })
  expect(stub.queries).toEqual(['select', 'delete', 'insert'])
  expect(recordedActivities()).toEqual([
    expect.objectContaining({ documentId: null, action: 'deleted' }),
  ])
})

test('file GET validates the id, the row and the storage path', async () => {
  expect((await call(file.GET, { id: 'bad' })).status).toBe(400)
  expect((await call(file.GET)).status).toBe(404)
  stub.results.push([{ name: 'a.pdf', storagePath: '../escape.pdf' }])
  expect((await call(file.GET)).status).toBe(400)
  stub.results.push([
    { name: 'a.pdf', mimeType: 'application/pdf', storagePath: 'missing.pdf' },
  ])
  const missing = await call(file.GET)
  expect(missing.status).toBe(404)
  expect(await missing.json()).toEqual({ error: 'Datei nicht gefunden' })
})

test('file GET names the download with the extension of its type', async () => {
  const config = STORAGE_CONFIG as { uploadDir: string }
  const uploadDir = config.uploadDir
  config.uploadDir = tempDir('file-route')
  try {
    writeFileSync(join(config.uploadDir, 'stored.pdf'), '%PDF-1.4')
    stub.results.push([
      {
        name: 'Hausrat: Beitrag 2026',
        mimeType: 'application/pdf',
        storagePath: 'stored.pdf',
        sha256: null,
      },
    ])
    const response = await call(file.GET, { path: '/?download=true' })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toContain(
      'filename="Hausrat_ Beitrag 2026.pdf"',
    )
  } finally {
    config.uploadDir = uploadDir
  }
})

test('export rejects invalid ids, filters and semantic queries', async () => {
  const error = async (path: string) => {
    const response = await call(exporter.GET, { path })
    expect(response.status).toBe(400)
    return (await response.json()).error
  }
  expect(await error('/?ids=bad')).toBe('Ungültige Dokument-ID')
  expect(await error('/?ids=')).toBe('Keine Dokumente ausgewählt')
  expect(await error('/?view=bad')).toBe('Ungültiger View-Parameter')
  expect(await error('/?q=Steuer&mode=semantic')).toBe(
    'Semantische Suche kann nicht exportiert werden',
  )
  expect(await error('/?q=a')).toBe(
    'Suchbegriff muss mindestens 2 Zeichen lang sein',
  )
  expect(stub.queries).toEqual([])
})

test('export refuses selections above the document limit', async () => {
  stub.results.push(Array.from({ length: 10_001 }, () => ({ id })))
  const response = await call(exporter.GET, { path: '/?q=Steuer&tagIds=' + id })
  expect(response.status).toBe(413)
  expect(await response.json()).toEqual({
    error: 'Export zu groß – bitte Auswahl einschränken',
  })
})

test('export streams a ZIP for explicit ids, ignoring the list filters', async () => {
  const row = {
    id,
    name: 'Rechnung.pdf',
    mimeType: 'application/pdf',
    fileSize: 1,
    storagePath: 'missing-export-test.pdf',
    sha256: null,
    folderId: null,
    correspondent: null,
    documentDate: null,
    isFavorite: false,
    archivedAt: null,
    trashedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  stub.results.push([{ id }], [], [row], [], [])
  const response = await call(exporter.GET, {
    path: `/?ids=${id},${id}&view=bad`,
  })
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toBe('application/zip')
  expect(response.headers.get('content-disposition')).toMatch(
    /^attachment; filename="docura-export-\d{8}-\d{4}\.zip"/,
  )
  const zip = new Uint8Array(await response.arrayBuffer())
  expect(Array.from(zip.subarray(0, 2))).toEqual([0x50, 0x4b])
})

/** Query results of the lock and the retry cancellation before the read. */
const LOCK_AND_CANCEL = [[], []]

test('reprocess queues a full job or reuses the pending one', async () => {
  stub.results.push(
    [{ id, name: 'Rechnung.pdf' }],
    [],
    [reprocessCandidate(id)],
    [{ jobId: 'job', id }],
  )
  const created = await call(reprocess.POST)
  expect(created.status).toBe(201)
  expect(await created.json()).toEqual({
    job: { id: 'job', status: 'pending', kind: 'full' },
  })
  expect(stub.writes[1]).toEqual([{ documentId: id, kind: 'full' }])
  expect(stub.writes[2]).toEqual([
    expect.objectContaining({
      documentId: id,
      documentName: 'Rechnung.pdf',
      action: 'reprocess_requested',
      actorName: 'Test User',
    }),
  ])
  stub.reset()
  stub.results.push(...LOCK_AND_CANCEL, [
    reprocessCandidate(id, { pendingJobId: 'old' }),
  ])
  const reused = await call(reprocess.POST)
  expect(reused.status).toBe(200)
  expect((await reused.json()).job.id).toBe('old')
  expect(stub.queries).not.toContain('insert')
})

test('reprocess reports and records an upgraded pending job', async () => {
  stub.results.push(
    [{ id, name: 'Rechnung.pdf' }],
    [],
    [
      reprocessCandidate(id, {
        pendingJobId: 'old',
        pendingJobKind: 'embedding',
      }),
    ],
    [{ jobId: 'old', id }],
  )
  const upgraded = await call(reprocess.POST)
  expect(upgraded.status).toBe(200)
  expect(await upgraded.json()).toEqual({
    job: { id: 'old', status: 'pending', kind: 'full' },
  })
  expect(stub.writes.at(-1)).toEqual([
    expect.objectContaining({ action: 'reprocess_requested' }),
  ])
})

test('reprocess rejects invalid, unknown, trashed and running documents', async () => {
  expect((await call(reprocess.POST, { id: 'bad' })).status).toBe(400)
  expect((await call(reprocess.POST)).status).toBe(404)
  stub.results.push(...LOCK_AND_CANCEL, [
    reprocessCandidate(id, { trashed: true }),
  ])
  const trashed = await call(reprocess.POST)
  expect(trashed.status).toBe(409)
  expect((await trashed.json()).error).toBe(
    'Dokument im Papierkorb kann nicht neu verarbeitet werden',
  )
  stub.results.push(...LOCK_AND_CANCEL, [
    reprocessCandidate(id, { processing: true }),
  ])
  const running = await call(reprocess.POST)
  expect(await running.json()).toEqual({ error: 'Verarbeitung läuft bereits' })
  expect(stub.queries).not.toContain('insert')
})

test('bulk reprocess reports queued and skipped documents', async () => {
  const other = '22222222-2222-4222-8222-222222222222'
  stub.results.push(
    [{ id }, { id: other }],
    ...LOCK_AND_CANCEL,
    [reprocessCandidate(id), reprocessCandidate(other, { trashed: true })],
    [{ jobId: 'job', id }],
  )
  const response = await call(bulk.POST, {
    body: { ids: [id, other], action: 'reprocess' },
  })
  expect(await response.json()).toEqual({
    success: true,
    count: 2,
    queued: [id],
    skipped: [{ id: other, reason: 'trashed' }],
  })
})
