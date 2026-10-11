import { ApiValidationError } from './api-validation-error'
import { documentCountLabel } from './format'
import type { JobKind } from './processing'

export type SkipReason = 'missing' | 'trashed' | 'running'

/** What enqueueing needs to know about one requested document. */
export interface ReprocessCandidate {
  id: string
  trashed: boolean
  processing: boolean
  pendingJobId: string | null
  pendingJobKind: JobKind | null
}

/** `id` is the document; `created` is false when a pending job was reused. */
export interface QueuedJob {
  id: string
  jobId: string
  kind: JobKind
  created: boolean
}

/** A pending embedding-only job that a full request turns into a full one. */
export interface JobUpgrade {
  id: string
  jobId: string
}

export interface SkippedDocument {
  id: string
  reason: SkipReason
}

export interface ReprocessResult {
  queued: QueuedJob[]
  skipped: SkippedDocument[]
}

interface ReprocessPlan extends ReprocessResult {
  /** Documents that need a new job. */
  insert: string[]
  /** Pending embedding-only jobs to turn into full jobs. */
  upgrade: JobUpgrade[]
}

function skipReason(candidate: ReprocessCandidate | undefined) {
  if (!candidate) return 'missing'
  if (candidate.trashed) return 'trashed'
  if (candidate.processing) return 'running'
  return null
}

/**
 * A pending job is reused unless a full run was requested and the pending
 * job only re-embeds; a pending full job also satisfies an embedding request.
 */
function planPendingJob(
  plan: ReprocessPlan,
  id: string,
  jobId: string,
  pendingKind: JobKind,
  kind: JobKind,
) {
  if (kind === 'full' && pendingKind === 'embedding')
    plan.upgrade.push({ id, jobId })
  else plan.queued.push({ id, jobId, kind: pendingKind, created: false })
}

/**
 * Splits the requested ids: trashed (the file may be deleted mid-job) and
 * running documents are skipped, a pending job is reused or upgraded, the
 * rest is queued.
 */
export function planReprocessing(
  ids: string[],
  candidates: ReprocessCandidate[],
  kind: JobKind,
): ReprocessPlan {
  const byId = new Map(candidates.map((c) => [c.id, c]))
  const plan: ReprocessPlan = {
    queued: [],
    skipped: [],
    insert: [],
    upgrade: [],
  }
  for (const id of ids) {
    const candidate = byId.get(id)
    const reason = skipReason(candidate)
    if (reason) plan.skipped.push({ id, reason })
    else if (candidate?.pendingJobId)
      planPendingJob(
        plan,
        id,
        candidate.pendingJobId,
        candidate.pendingJobKind ?? 'full',
        kind,
      )
    else plan.insert.push(id)
  }
  return plan
}

const SKIP_ERRORS: Record<SkipReason, [message: string, status: number]> = {
  missing: ['Dokument nicht gefunden', 404],
  trashed: ['Dokument im Papierkorb kann nicht neu verarbeitet werden', 409],
  running: ['Verarbeitung läuft bereits', 409],
}

/** The job for a single-document request, or its skip reason as API error. */
export function singleReprocessJob(result: ReprocessResult): QueuedJob {
  const [skipped] = result.skipped
  if (skipped) {
    const [message, status] = SKIP_ERRORS[skipped.reason]
    throw new ApiValidationError(message, status)
  }
  return result.queued[0]
}

/** Feedback after a bulk reprocess request. */
export function reprocessNotice(queued: number, skipped: number): string {
  const base = `${documentCountLabel(queued)} zur Neuverarbeitung eingeplant`
  return skipped > 0
    ? `${base}, ${skipped} übersprungen (Papierkorb oder laufende Verarbeitung).`
    : `${base}.`
}
