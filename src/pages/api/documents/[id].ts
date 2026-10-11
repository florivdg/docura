import type { APIRoute } from 'astro'
import { eq } from 'drizzle-orm'
import { withApiErrors } from '@/lib/api-errors'
import { validateDocumentPatch } from '@/lib/document-patch'
import { jsonResponse } from '@/lib/json-response'
import { db } from '@/db'
import {
  documentExists,
  findDocument,
  loadDocumentDetail,
} from '@/db/document-detail'
import { applyDocumentPatch, trashDocument } from '@/db/document-patch-apply'
import { countExistingTags, referenceExists } from '@/db/reference-validation'
import { document } from '@/db/schema/documents'
import { isValidUUID, parseJsonBody } from '@/lib/api-utils'
import { actorFromLocals } from '@/lib/server/activity-actor'
import { removeDocumentsPermanently } from '@/lib/server/document-removal'
import { STORAGE_CONFIG } from '@/lib/server/storage-config'

const invalidId = () => jsonResponse({ error: 'Ungültige Dokument-ID' }, 400)
const notFound = () => jsonResponse({ error: 'Dokument nicht gefunden' }, 404)

async function documentResponse(id: string): Promise<Response> {
  const doc = await findDocument(id)
  if (!doc) return notFound()
  return jsonResponse({ document: await loadDocumentDetail(doc) })
}

export const GET: APIRoute = async ({ params }) => {
  const { id } = params
  if (!id || !isValidUUID(id)) return invalidId()
  return documentResponse(id)
}

export const DELETE: APIRoute = async ({ params, url, locals }) => {
  const { id } = params
  const permanent = url.searchParams.get('permanent') === 'true'

  if (!id || !isValidUUID(id)) return invalidId()

  const [doc] = await db
    .select({
      id: document.id,
      trashedAt: document.trashedAt,
    })
    .from(document)
    .where(eq(document.id, id))
    .limit(1)

  if (!doc) return notFound()

  if (permanent) {
    if (!doc.trashedAt) {
      return jsonResponse(
        {
          error: 'Endgültiges Löschen nur für Dokumente im Papierkorb erlaubt',
        },
        400,
      )
    }

    await removeDocumentsPermanently(
      db,
      eq(document.id, id),
      STORAGE_CONFIG.uploadDir,
      actorFromLocals(locals),
    )
    return jsonResponse({ success: true })
  }

  // Guard: don't re-trash already-trashed documents
  if (doc.trashedAt) {
    return jsonResponse(
      {
        error: 'Dokument befindet sich bereits im Papierkorb',
      },
      409,
    )
  }

  await trashDocument(id, actorFromLocals(locals))
  return jsonResponse({ success: true })
}

export const PATCH: APIRoute = ({ params, request, locals }) =>
  withApiErrors(async () => {
    const { id } = params

    if (!id || !isValidUUID(id)) return invalidId()
    if (!(await documentExists(id))) return notFound()

    const body = await validateDocumentPatch(
      await parseJsonBody<unknown>(request),
      referenceExists,
      countExistingTags,
    )
    await applyDocumentPatch(id, body, actorFromLocals(locals))

    // Return updated document in same shape as GET
    return documentResponse(id)
  })
