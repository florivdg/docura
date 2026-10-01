import type { DocumentData } from './document-detail'
import type { ProcessingNotification } from '@/worker/types'
/** Applies progress in place; completed events request a refresh of AI metadata. */
export function applyDocumentProcessingEvent(
  doc: DocumentData,
  event: ProcessingNotification,
): boolean {
  const job = doc.processingJobs.find((job) => job.id === event.jobId)
  if (!job) return event.type === 'completed'
  job.status = event.status
  job.step = event.type === 'step_change' ? event.step : null
  if (event.type === 'failed') job.errorMessage = event.errorMessage ?? null
  return event.type === 'completed'
}
