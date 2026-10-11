import type { DocumentData, ProcessingJobData } from '@/lib/document-detail'
import type { ReprocessCandidate } from '@/lib/document-reprocess'
import type { DocumentRow } from '@/composables/useDocumentsFilter'
export function detailFixture(
  overrides: Partial<DocumentData> = {},
): DocumentData {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Rechnung.pdf',
    mimeType: 'application/pdf',
    fileSize: 8,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    documentDate: null,
    textContent: null,
    folder: null,
    correspondent: null,
    tags: [],
    processingJobs: [],
    isFavorite: false,
    archivedAt: null,
    trashedAt: null,
    ...overrides,
  }
}
/** A completed first attempt; override status and attempts as needed. */
export function jobFixture(
  overrides: Partial<ProcessingJobData> = {},
): ProcessingJobData {
  return {
    id: 'job',
    status: 'completed',
    kind: 'full',
    step: null,
    errorMessage: null,
    attempts: 1,
    maxAttempts: 3,
    startedAt: null,
    completedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}
export function rowFixture(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    ...detailFixture(),
    folderName: null,
    correspondentName: null,
    processingStatus: null,
    processingStep: null,
    processingError: null,
    ...overrides,
  }
}

/** A document that can be reprocessed; override the flags to skip it. */
export function reprocessCandidate(
  id: string,
  overrides: Partial<ReprocessCandidate> = {},
): ReprocessCandidate {
  return {
    id,
    trashed: false,
    processing: false,
    pendingJobId: null,
    pendingJobKind: overrides.pendingJobId ? 'full' : null,
    ...overrides,
  }
}
