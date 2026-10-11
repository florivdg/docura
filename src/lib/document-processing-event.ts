import type { DocumentData } from './document-detail'
import type { DocumentRow } from '@/composables/useDocumentsFilter'
import type { ProcessingNotification } from '@/worker/types'

/** Job fields an event sets; `errorMessage` is undefined when it is unchanged. */
interface JobState {
  status: string
  step: string | null
  errorMessage?: string | null
}

/**
 * The job state after `event`. A completed run clears the error of an earlier
 * attempt; step changes keep it until the run ends.
 */
export function jobStateFromEvent(event: ProcessingNotification): JobState {
  if (event.type === 'step_change')
    return { status: event.status, step: event.step }
  return {
    status: event.status,
    step: null,
    errorMessage: event.type === 'failed' ? (event.errorMessage ?? null) : null,
  }
}

/** Applies progress in place; completed events request a refresh of AI metadata. */
export function applyDocumentProcessingEvent(
  doc: DocumentData,
  event: ProcessingNotification,
): boolean {
  const job = doc.processingJobs.find((job) => job.id === event.jobId)
  if (job) Object.assign(job, jobStateFromEvent(event))
  return event.type === 'completed'
}

/**
 * Applies progress to the matching list row in place. Returns true when the
 * list should be refetched: completed full runs change AI metadata, and events
 * for unknown rows may belong to a fresh upload. Embedding-only runs change
 * nothing the list shows, so a bulk re-embed does not trigger refetches.
 */
export function applyListProcessingEvent(
  documents: DocumentRow[],
  event: ProcessingNotification,
): boolean {
  const row = documents.find((doc) => doc.id === event.documentId)
  if (row) {
    const state = jobStateFromEvent(event)
    row.processingStatus = state.status
    row.processingStep = state.step
    if (state.errorMessage !== undefined)
      row.processingError = state.errorMessage
  }
  if (event.kind === 'embedding') return false
  return !row || event.type === 'completed'
}
