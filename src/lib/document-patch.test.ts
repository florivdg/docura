import { expect, test } from 'vitest'
import { validateDocumentPatch, documentPatchUpdates } from './document-patch'
const id = '11111111-1111-4111-8111-111111111111'
const exists = async () => true
const count = async (ids: string[]) => ids.length

test('omitted fields stay untouched and null explicitly clears fields', async () => {
  expect(
    documentPatchUpdates(await validateDocumentPatch({}, exists, count)),
  ).toEqual({})
  const patch = await validateDocumentPatch(
    { folderId: null, correspondentId: null, documentDate: null, tagIds: [] },
    exists,
    count,
  )
  expect(documentPatchUpdates(patch)).toEqual({
    folderId: null,
    correspondentId: null,
    documentDate: null,
  })
})
test('normalizes names and preserves archive/trash toggle semantics', async () => {
  const now = new Date('2026-01-01T00:00:00Z')
  const patch = await validateDocumentPatch(
    {
      name: ' Rechnung ',
      isFavorite: false,
      trashedAt: 'ignored',
      archivedAt: null,
    },
    exists,
    count,
  )
  expect(documentPatchUpdates(patch, now)).toEqual({
    name: 'Rechnung',
    isFavorite: false,
    trashedAt: now,
    archivedAt: null,
  })
})
test('validates references and tags without querying for null or empty values', async () => {
  const calls: string[] = []
  await validateDocumentPatch(
    { folderId: id, correspondentId: id, tagIds: [id] },
    async (kind) => {
      calls.push(kind)
      return true
    },
    count,
  )
  expect(calls).toEqual(['folder', 'correspondent'])
  await validateDocumentPatch(
    { folderId: null, correspondentId: null, tagIds: [] },
    async () => {
      throw Error('unexpected lookup')
    },
    async () => {
      throw Error('unexpected lookup')
    },
  )
})
test('returns the established missing-reference errors', async () => {
  for (const field of ['folderId', 'correspondentId']) {
    await expect(
      validateDocumentPatch({ [field]: id }, async () => false, count),
    ).rejects.toMatchObject({ status: 404 })
  }
  await expect(
    validateDocumentPatch({ tagIds: [id, id] }, exists, async () => 1),
  ).rejects.toMatchObject({ status: 404 })
})
test('rejects malformed fields before persistence', async () => {
  for (const body of [
    null,
    [],
    { folderId: 'bad' },
    { correspondentId: 7 },
    { documentDate: '2023-02-29' },
    { documentDate: 1 },
    { name: '' },
    { name: 'x'.repeat(201) },
    { name: null },
    { tagIds: null },
    { tagIds: [7] },
    { isFavorite: 'true' },
  ]) {
    await expect(
      validateDocumentPatch(body, exists, count),
    ).rejects.toMatchObject({ status: 400 })
  }
})
