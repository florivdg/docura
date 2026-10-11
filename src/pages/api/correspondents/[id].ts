import type { APIRoute } from 'astro'
import { parseJsonBody } from '@/lib/api-utils'
import { withApiErrors } from '@/lib/api-errors'
import {
  correspondentId,
  correspondentName,
} from '@/lib/correspondent-validation'
import { jsonResponse } from '@/lib/json-response'
import { deleteCorrespondent, renameCorrespondent } from '@/db/correspondents'

export const PATCH: APIRoute = ({ params, request }) =>
  withApiErrors(async () => {
    const id = correspondentId(params.id)
    const name = correspondentName(await parseJsonBody<unknown>(request))
    return jsonResponse({ correspondent: await renameCorrespondent(id, name) })
  })

export const DELETE: APIRoute = ({ params }) =>
  withApiErrors(async () => {
    await deleteCorrespondent(correspondentId(params.id))
    return new Response(null, { status: 204 })
  })
