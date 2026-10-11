import { expect, test } from 'vitest'
import { ApiValidationError } from './api-validation-error'
import {
  planReprocessing,
  reprocessNotice,
  singleReprocessJob,
  type SkipReason,
} from './document-reprocess'
import { reprocessCandidate } from '@/test/document-fixture'

test('skips missing, trashed and running documents and reuses pending jobs', () => {
  const plan = planReprocessing(
    ['new', 'pending', 'trashed', 'running', 'missing'],
    [
      reprocessCandidate('new'),
      reprocessCandidate('pending', { pendingJobId: 'job-1' }),
      reprocessCandidate('trashed', { trashed: true, processing: true }),
      reprocessCandidate('running', { processing: true }),
    ],
    'full',
  )
  expect(plan).toEqual({
    insert: ['new'],
    upgrade: [],
    queued: [{ id: 'pending', jobId: 'job-1', kind: 'full', created: false }],
    skipped: [
      { id: 'trashed', reason: 'trashed' },
      { id: 'running', reason: 'running' },
      { id: 'missing', reason: 'missing' },
    ],
  })
})

test('upgrades a pending embedding job for a full request only', () => {
  const candidates = [
    reprocessCandidate('embed', {
      pendingJobId: 'job-e',
      pendingJobKind: 'embedding',
    }),
    reprocessCandidate('full', { pendingJobId: 'job-f' }),
  ]
  expect(planReprocessing(['embed', 'full'], candidates, 'full')).toMatchObject(
    {
      upgrade: [{ id: 'embed', jobId: 'job-e' }],
      queued: [{ id: 'full', jobId: 'job-f', kind: 'full', created: false }],
    },
  )
  expect(
    planReprocessing(['embed', 'full'], candidates, 'embedding'),
  ).toMatchObject({
    upgrade: [],
    queued: [
      { id: 'embed', jobId: 'job-e', kind: 'embedding', created: false },
      { id: 'full', jobId: 'job-f', kind: 'full', created: false },
    ],
  })
})

test('maps a skipped single document to the matching API error', () => {
  const cases: [SkipReason, number, string][] = [
    ['missing', 404, 'Dokument nicht gefunden'],
    [
      'trashed',
      409,
      'Dokument im Papierkorb kann nicht neu verarbeitet werden',
    ],
    ['running', 409, 'Verarbeitung läuft bereits'],
  ]
  for (const [reason, status, message] of cases) {
    const error = (() => {
      try {
        singleReprocessJob({ queued: [], skipped: [{ id: 'x', reason }] })
      } catch (err) {
        return err
      }
    })()
    expect(error).toBeInstanceOf(ApiValidationError)
    expect(error).toMatchObject({ status, message })
  }
  const job = { id: 'doc', jobId: 'job', kind: 'full' as const, created: true }
  expect(singleReprocessJob({ queued: [job], skipped: [] })).toBe(job)
})

test('summarizes a bulk reprocess request', () => {
  expect(reprocessNotice(1, 0)).toBe(
    '1 Dokument zur Neuverarbeitung eingeplant.',
  )
  expect(reprocessNotice(2, 1)).toBe(
    '2 Dokumente zur Neuverarbeitung eingeplant, 1 übersprungen (Papierkorb oder laufende Verarbeitung).',
  )
})
