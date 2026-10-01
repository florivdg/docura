import type { DocumentData } from '@/lib/document-detail'
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
