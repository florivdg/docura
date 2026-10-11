import type { APIRoute } from 'astro'
import { enqueueReprocessing } from '@/db/processing-jobs'
import { withApiErrors } from '@/lib/api-errors'
import { singleReprocessJob } from '@/lib/document-reprocess'
import { jsonResponse } from '@/lib/json-response'
import { uuid } from '@/lib/request-validation'

/**
 * Queues a full reprocessing run: 201 with the new job, 200 if a pending job
 * already exists (an embedding-only one is turned into a full job), 404
 * unknown, 409 trashed or already running.
 */
export const POST: APIRoute = ({ params }) =>
  withApiErrors(async () => {
    const id = uuid(params.id, 'Ungültige Dokument-ID')
    const job = singleReprocessJob(await enqueueReprocessing([id], 'full'))
    return jsonResponse(
      { job: { id: job.jobId, status: 'pending', kind: job.kind } },
      job.created ? 201 : 200,
    )
  })
