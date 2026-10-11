import type { APIRoute } from 'astro'
import { db } from '@/db'
import { document } from '@/db/schema/documents'
import { isNotNull } from 'drizzle-orm'
import { parseJsonBody } from '@/lib/api-utils'
import { withApiErrors } from '@/lib/api-errors'
import { ApiValidationError } from '@/lib/api-validation-error'
import { jsonResponse } from '@/lib/json-response'
import { requireJsonObject } from '@/lib/request-validation'
import { actorFromLocals } from '@/lib/server/activity-actor'
import { removeDocumentsPermanently } from '@/lib/server/document-removal'
import { STORAGE_CONFIG } from '@/lib/server/storage-config'

export const GET: APIRoute = async () =>
  jsonResponse({ retentionDays: STORAGE_CONFIG.trashRetentionDays })

export const POST: APIRoute = ({ request, locals }) =>
  withApiErrors(async () => {
    const { action } = requireJsonObject(await parseJsonBody<unknown>(request))
    if (action !== 'empty') throw new ApiValidationError('Ungültige Aktion')

    const deleted = await removeDocumentsPermanently(
      db,
      isNotNull(document.trashedAt),
      STORAGE_CONFIG.uploadDir,
      actorFromLocals(locals),
    )
    return jsonResponse({ success: true, deleted })
  })
