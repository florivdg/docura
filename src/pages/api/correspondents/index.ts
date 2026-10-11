import type { APIRoute } from 'astro'
import { parseJsonBody } from '@/lib/api-utils'
import { withApiErrors } from '@/lib/api-errors'
import { correspondentName } from '@/lib/correspondent-validation'
import { jsonResponse } from '@/lib/json-response'
import {
  findOrCreateCorrespondent,
  listCorrespondents,
  listCorrespondentsWithCounts,
} from '@/db/correspondents'

/** `?counts=1` adds `createdAt` and the active `documentCount` (admin page). */
export const GET: APIRoute = async ({ url }) =>
  jsonResponse({
    correspondents: await (url.searchParams.get('counts') === '1'
      ? listCorrespondentsWithCounts()
      : listCorrespondents()),
  })

/** Case-insensitive find-or-create: 201 when created, 200 for an existing one. */
export const POST: APIRoute = ({ request }) =>
  withApiErrors(async () => {
    const name = correspondentName(await parseJsonBody<unknown>(request))
    const { correspondent, created } = await findOrCreateCorrespondent(name)
    return jsonResponse({ correspondent, created }, created ? 201 : 200)
  })
