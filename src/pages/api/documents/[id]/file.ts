import type { APIRoute } from 'astro'
import { db } from '@/db'
import { document } from '@/db/schema/documents'
import { eq } from 'drizzle-orm'
import { isValidUUID, safePathOrNull } from '@/lib/api-utils'
import { sanitizeExportName } from '@/lib/export-paths'
import { jsonResponse } from '@/lib/json-response'
import { fileResponse } from '@/lib/server/file-response'
import { STORAGE_CONFIG } from '@/lib/server/storage-config'

export const GET: APIRoute = async ({ params, url, request }) => {
  const { id } = params
  if (!id || !isValidUUID(id))
    return jsonResponse({ error: 'Ungültige Dokument-ID' }, 400)

  const [doc] = await db
    .select({
      name: document.name,
      mimeType: document.mimeType,
      storagePath: document.storagePath,
      sha256: document.sha256,
    })
    .from(document)
    .where(eq(document.id, id))
    .limit(1)
  if (!doc) return jsonResponse({ error: 'Dokument nicht gefunden' }, 404)

  const filePath = safePathOrNull(STORAGE_CONFIG.uploadDir, doc.storagePath)
  if (!filePath) return jsonResponse({ error: 'Ungültiger Dateipfad' }, 400)

  return fileResponse(filePath, {
    mimeType: doc.mimeType,
    // Titles from the LLM carry no extension; "Save as" needs one.
    name: sanitizeExportName(doc.name, doc.mimeType),
    sha256: doc.sha256,
    disposition:
      url.searchParams.get('download') === 'true' ? 'attachment' : 'inline',
    rangeHeader: request.headers.get('range'),
    ifNoneMatch: request.headers.get('if-none-match'),
    ifRange: request.headers.get('if-range'),
  })
}
