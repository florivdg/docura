import { expect, test } from 'vitest'
import {
  diffSnapshots,
  readActivityLimit,
  snapshotActivities,
  type DocumentSnapshot,
} from './activity'

const steuer = { id: 'f1', name: 'Steuer' }
const rechnung = { id: 't1', name: 'Rechnung' }
const entwurf = { id: 't2', name: 'Entwurf' }

function snapshot(overrides: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  return {
    id: 'doc',
    name: 'Rechnung.pdf',
    folder: null,
    correspondent: null,
    documentDate: null,
    tags: [],
    isFavorite: false,
    archivedAt: null,
    trashedAt: null,
    ...overrides,
  }
}

test('an unchanged snapshot has no diff and no actions', () => {
  const same = snapshot({ folder: steuer, tags: [rechnung] })
  expect(diffSnapshots(same, { ...same })).toEqual({})
  expect(snapshotActivities([same], [{ ...same }])).toEqual([])
})

test('compares tags regardless of their order', () => {
  const before = snapshot({ tags: [rechnung, entwurf] })
  expect(
    diffSnapshots(before, snapshot({ tags: [entwurf, rechnung] })),
  ).toEqual({})
  expect(diffSnapshots(before, snapshot({ tags: [entwurf] }))).toEqual({
    tags: { from: [rechnung, entwurf], to: [entwurf] },
  })
})

test('records folder and correspondent by id with their names', () => {
  const telekom = { id: 'c1', name: 'Telekom' }
  const before = snapshot({ folder: steuer })
  const after = snapshot({ correspondent: telekom })
  expect(diffSnapshots(before, after)).toEqual({
    folder: { from: steuer, to: null },
    correspondent: { from: null, to: telekom },
  })
  // A renamed folder is not a change of the document.
  const renamed = snapshot({ folder: { id: 'f1', name: 'Steuern' } })
  expect(diffSnapshots(before, renamed)).toEqual({})
})

test('records name, Belegdatum and favorite changes', () => {
  const after = snapshot({
    name: 'Rechnung März',
    documentDate: '2026-03-01',
    isFavorite: true,
  })
  expect(diffSnapshots(snapshot(), after)).toEqual({
    name: { from: 'Rechnung.pdf', to: 'Rechnung März' },
    documentDate: { from: null, to: '2026-03-01' },
    isFavorite: { from: false, to: true },
  })
})

test('maps trash and archive flips to their own actions', () => {
  const now = new Date()
  const actions = (before: DocumentSnapshot, after: DocumentSnapshot) =>
    snapshotActivities([before], [after]).map((entry) => entry.action)
  expect(actions(snapshot(), snapshot({ trashedAt: now }))).toEqual(['trashed'])
  expect(actions(snapshot({ trashedAt: now }), snapshot())).toEqual([
    'restored',
  ])
  expect(
    actions(snapshot(), snapshot({ archivedAt: now, name: 'Neu' })),
  ).toEqual(['updated', 'archived'])
  expect(actions(snapshot({ archivedAt: '2026-01-01' }), snapshot())).toEqual([
    'unarchived',
  ])
})

test('derives activities only for documents present before and after', () => {
  const before = [snapshot(), snapshot({ id: 'gone' }), snapshot({ id: 'b' })]
  const after = [
    snapshot({ name: 'Neu', trashedAt: new Date() }),
    snapshot({ id: 'b' }),
    snapshot({ id: 'new', name: 'X' }),
  ]
  expect(snapshotActivities(before, after)).toEqual([
    {
      documentId: 'doc',
      documentName: 'Neu',
      action: 'updated',
      changes: { name: { from: 'Rechnung.pdf', to: 'Neu' } },
    },
    {
      documentId: 'doc',
      documentName: 'Neu',
      action: 'trashed',
      changes: null,
    },
  ])
})

test('clamps the dashboard limit', () => {
  const limit = (value: string) =>
    readActivityLimit(new URLSearchParams({ limit: value }))
  expect(readActivityLimit(new URLSearchParams())).toBe(10)
  expect(limit('abc')).toBe(10)
  expect(limit('0')).toBe(1)
  expect(limit('25')).toBe(25)
  expect(limit('500')).toBe(50)
})
