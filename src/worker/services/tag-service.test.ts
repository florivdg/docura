import { beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'

import { tag } from '@/db/schema/documents'

type Row = { id: string }

// Minimal stand-in for the drizzle query builder chains used by tag-service.
let selectResults: Row[][] = []
let createTag: (values: { name: string }) => Promise<Row[]>
let linkTags: (values: { documentId: string; tagId: string }[]) => Promise<void>

const fakeDb = {
  select: () => ({
    from: () => ({
      where: () => ({ limit: async () => selectResults.shift() ?? [] }),
    }),
  }),
  insert: (table: unknown) => ({
    values: (values: never) =>
      table === tag
        ? { returning: () => createTag(values) }
        : { onConflictDoNothing: () => linkTags(values) },
  }),
}

await mock.module('@/db', () => ({ db: fakeDb }))

const { applyTags } = await import('@/worker/services/tag-service')

describe('applyTags', () => {
  let createTagMock: ReturnType<typeof mock<typeof createTag>>
  let linkTagsMock: ReturnType<typeof mock<typeof linkTags>>
  let warnSpy: ReturnType<typeof spyOn<Console, 'warn'>>

  beforeEach(() => {
    selectResults = []
    createTagMock = mock(async ({ name }) => [{ id: `new-${name}` }])
    linkTagsMock = mock(async () => {})
    createTag = createTagMock
    linkTags = linkTagsMock
    spyOn(console, 'log').mockImplementation(() => {})
    warnSpy = spyOn(console, 'warn').mockImplementation(() => {})
  })

  test('links existing tags without creating new ones', async () => {
    selectResults = [[{ id: 'tag-1' }]]

    await applyTags('doc-1', ['Rechnung'])

    expect(createTagMock).not.toHaveBeenCalled()
    expect(linkTagsMock).toHaveBeenCalledWith([
      { documentId: 'doc-1', tagId: 'tag-1' },
    ])
  })

  test('creates missing tags with a trimmed name', async () => {
    await applyTags('doc-1', ['  Steuer  '])

    expect(createTagMock).toHaveBeenCalledWith({ name: 'Steuer' })
    expect(linkTagsMock).toHaveBeenCalledWith([
      { documentId: 'doc-1', tagId: 'new-Steuer' },
    ])
  })

  test('skips unknown tags when only existing tags are allowed', async () => {
    await applyTags('doc-1', ['Neu'], true)

    expect(createTagMock).not.toHaveBeenCalled()
    expect(linkTagsMock).not.toHaveBeenCalled()
  })

  test('falls back to the concurrently created tag on a unique violation', async () => {
    selectResults = [[], [{ id: 'tag-race' }]]
    createTag = mock(async () => {
      throw new Error('duplicate key')
    })

    await applyTags('doc-1', ['Versicherung'])

    expect(linkTagsMock).toHaveBeenCalledWith([
      { documentId: 'doc-1', tagId: 'tag-race' },
    ])
  })

  test('skips a tag that can neither be created nor found', async () => {
    createTag = mock(async () => {
      throw new Error('insert failed')
    })

    await applyTags('doc-1', ['Kaputt'])

    expect(linkTagsMock).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(
      'Tag "Kaputt" konnte nicht erstellt werden',
    )
  })

  test('logs instead of throwing when linking fails', async () => {
    selectResults = [[{ id: 'tag-1' }]]
    linkTags = mock(async () => {
      throw new Error('db down')
    })

    expect(await applyTags('doc-1', ['Rechnung'])).toBeUndefined()
    expect(warnSpy).toHaveBeenCalledWith(
      'Tags konnten nicht zugewiesen werden für Dokument doc-1:',
      'db down',
    )
  })
})
