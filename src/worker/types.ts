export interface LlmAnalysisResult {
  title: string | null
  tags: string[]
  folderSuggestion: string | null
  documentDate: string | null
  correspondent: string | null
}

export type ProcessingStep =
  | 'text_extraction'
  | 'ocr'
  | 'llm_analysis'
  | 'embedding'

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface ProcessingJobRecord {
  id: string
  document_id: string
  status: JobStatus
  step: ProcessingStep | null
  error_message: string | null
  attempts: number
  max_attempts: number
  next_retry_at: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type NotificationType = 'step_change' | 'completed' | 'failed'

export interface ProcessingNotification {
  type: NotificationType
  jobId: string
  documentId: string
  step: ProcessingStep | null
  status: JobStatus
  errorMessage?: string
}
