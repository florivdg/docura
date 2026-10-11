import { expect, test } from 'vitest'
import { ACTIVITY_ACTIONS, type ActivityChanges } from './activity'
import { changeLines, describeActivity, formatChange } from './activity-labels'

const single = (
  action: (typeof ACTIVITY_ACTIONS)[number],
  actorName = 'Anna',
) => describeActivity({ action, actorName, changes: null })

test('describes every action for a single document', () => {
  expect(ACTIVITY_ACTIONS.map((action) => single(action))).toEqual([
    'Anna hat das Dokument hochgeladen',
    'Anna hat die Metadaten geändert',
    'Anna hat das Dokument archiviert',
    'Anna hat die Archivierung aufgehoben',
    'Anna hat das Dokument in den Papierkorb verschoben',
    'Anna hat das Dokument wiederhergestellt',
    'Anna hat das Dokument endgültig gelöscht',
    'Anna hat die Neuverarbeitung gestartet',
  ])
  expect(single('updated', 'KI-Analyse')).toBe(
    'KI-Analyse hat die Metadaten geändert',
  )
  expect(single('uploaded', 'Watch-Ordner')).toBe(
    'Watch-Ordner hat das Dokument hochgeladen',
  )
})

test('describes batches with the number of documents', () => {
  const group = (action: (typeof ACTIVITY_ACTIONS)[number], count: number) =>
    describeActivity({ action, actorName: 'Anna', changes: null, count })
  expect(group('trashed', 12)).toBe(
    'Anna hat 12 Dokumente in den Papierkorb verschoben',
  )
  expect(group('deleted', 1)).toBe('Anna hat das Dokument endgültig gelöscht')
  expect(group('updated', 3)).toBe(
    'Anna hat die Metadaten von 3 Dokumenten geändert',
  )
  expect(group('reprocess_requested', 2)).toBe(
    'Anna hat die Neuverarbeitung von 2 Dokumenten gestartet',
  )
  const moved: ActivityChanges = {
    folder: { from: null, to: { id: 'f', name: 'Steuer' } },
  }
  expect(
    describeActivity({
      action: 'updated',
      actorName: 'Anna',
      changes: moved,
      count: 2,
    }),
  ).toBe('Anna hat 2 Dokumente verschoben')
})

test('formats every field, empty values as a dash', () => {
  const steuer = { id: 'f1', name: 'Steuer' }
  const versicherung = { id: 'f2', name: 'Versicherung' }
  expect(formatChange('folder', { from: steuer, to: versicherung })).toBe(
    'Ordner: Steuer → Versicherung',
  )
  expect(formatChange('correspondent', { from: null, to: steuer })).toBe(
    'Korrespondent: – → Steuer',
  )
  expect(formatChange('documentDate', { from: null, to: '2026-02-01' })).toBe(
    'Belegdatum: – → 01.02.2026',
  )
  expect(formatChange('isFavorite', { from: false, to: true })).toBe(
    'Favorit: Nein → Ja',
  )
  expect(formatChange('name', { from: '', to: 'Rechnung' })).toBe(
    'Name: – → Rechnung',
  )
})

test('lists added and removed tags', () => {
  const rechnung = { id: 't1', name: 'Rechnung' }
  const entwurf = { id: 't2', name: 'Entwurf' }
  expect(formatChange('tags', { from: [entwurf], to: [rechnung] })).toBe(
    'Tags: +Rechnung, −Entwurf',
  )
  expect(formatChange('tags', { from: [rechnung], to: [rechnung] })).toBe(
    'Tags: –',
  )
})

test('orders the change lines by field', () => {
  expect(changeLines(null)).toEqual([])
  expect(
    changeLines({
      isFavorite: { from: true, to: false },
      name: { from: 'A', to: 'B' },
    }),
  ).toEqual(['Name: A → B', 'Favorit: Ja → Nein'])
})
