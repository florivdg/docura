import type { APIRoute } from 'astro'
import { databaseExportSource, exportDocumentIds } from '@/db/document-export'
import { withApiErrors } from '@/lib/api-errors'
import { readExportSelection } from '@/lib/document-export-request'
import { jsonResponse } from '@/lib/json-response'
import { exportResponseHeaders, exportZipStream } from '@/lib/server/export-zip'
import { STORAGE_CONFIG } from '@/lib/server/storage-config'

/**
 * Streams the selected or filtered documents as a ZIP with metadata. Any
 * authenticated user may export: the library is shared.
 */
export const GET: APIRoute = ({ url, request }) =>
  withApiErrors(async () => {
    const selection = readExportSelection(url.searchParams)
    const limit = STORAGE_CONFIG.exportMaxDocuments
    const ids = await exportDocumentIds(selection, limit + 1)
    if (ids.length > limit)
      return jsonResponse(
        { error: 'Export zu groß – bitte Auswahl einschränken' },
        413,
      )

    const now = new Date()
    const body = exportZipStream(await databaseExportSource(ids), {
      uploadDir: STORAGE_CONFIG.uploadDir,
      signal: request.signal,
      now,
    })
    return new Response(body, { headers: exportResponseHeaders(now) })
  })
