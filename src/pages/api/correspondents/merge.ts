import type { APIRoute } from 'astro'
import { parseJsonBody } from '@/lib/api-utils'
import { withApiErrors } from '@/lib/api-errors'
import { correspondentMergeRequest } from '@/lib/correspondent-validation'
import { jsonResponse } from '@/lib/json-response'
import { mergeCorrespondents } from '@/db/correspondents'
import { actorFromLocals } from '@/lib/server/activity-actor'

export const POST: APIRoute = ({ request, locals }) =>
  withApiErrors(async () => {
    const body = correspondentMergeRequest(
      await parseJsonBody<unknown>(request),
    )
    return jsonResponse(
      await mergeCorrespondents(body, actorFromLocals(locals)),
    )
  })
