import type { DocumentTag } from '@/composables/useDocumentsFilter'
export interface DocumentFolder {
  id: string
  name: string
}

export interface DocumentCorrespondent {
  id: string
  name: string
}

export interface ProcessingJobData {
  id: string
  status: string
  step: string | null
  errorMessage: string | null
  attempts: number
  startedAt: string | null
  completedAt: string | null
  createdAt: string
}

export interface DocumentData {
  id: string
  name: string
  mimeType: string
  fileSize: number
  createdAt: string
  updatedAt: string
  documentDate: string | null
  textContent: string | null
  folder: DocumentFolder | null
  correspondent: DocumentCorrespondent | null
  tags: DocumentTag[]
  processingJobs: ProcessingJobData[]
  isFavorite: boolean
  archivedAt: string | null
  trashedAt: string | null
}

export type PatchDocument = (
  payload: Record<string, unknown>,
  rollback?: () => void,
) => Promise<void>
