import type { APIRoute } from 'astro'
import { countDocumentActivity, loadDocumentActivity } from '@/db/activity-feed'
import { documentExists } from '@/db/document-detail'
import { withApiErrors } from '@/lib/api-errors'
import { ApiValidationError } from '@/lib/api-validation-error'
import { readDocumentPagination } from '@/lib/document-filters'
import { jsonResponse } from '@/lib/json-response'
import { uuid } from '@/lib/request-validation'

/**
 * The document's history, newest first; `page` and `size` (20, 50 or 100)
 * as in the document list. 404 once the document is deleted.
 */
export const GET: APIRoute = ({ params, url }) =>
  withApiErrors(async () => {
    const id = uuid(params.id, 'Ungültige Dokument-ID')
    if (!(await documentExists(id)))
      throw new ApiValidationError('Dokument nicht gefunden', 404)
    const { page, pageSize, offset } = readDocumentPagination(url.searchParams)
    const [entries, total] = await Promise.all([
      loadDocumentActivity(id, { limit: pageSize, offset }),
      countDocumentActivity(id),
    ])
    return jsonResponse({ entries, total, page, pageSize })
  })
