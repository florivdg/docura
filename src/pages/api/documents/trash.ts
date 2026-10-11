import type { APIRoute } from 'astro'
import { db } from '@/db'
import { document } from '@/db/schema/documents'
import { isNotNull } from 'drizzle-orm'
import { unlink } from 'node:fs/promises'
import { safePath, parseJsonBody, isEnoent } from '@/lib/api-utils'
import { withApiErrors } from '@/lib/api-errors'
import { ApiValidationError } from '@/lib/api-validation-error'
import { jsonResponse } from '@/lib/json-response'
import { requireJsonObject } from '@/lib/request-validation'

const trashRetentionDays = Number(process.env.TRASH_RETENTION_DAYS || '90')

export const GET: APIRoute = async () =>
  jsonResponse({ retentionDays: trashRetentionDays })

async function removeFile(uploadDir: string, storagePath: string) {
  try {
    await unlink(safePath(uploadDir, storagePath))
  } catch (err) {
    if (!isEnoent(err)) throw err
  }
}

export const POST: APIRoute = ({ request }) =>
  withApiErrors(async () => {
    const { action } = requireJsonObject(await parseJsonBody<unknown>(request))
    if (action !== 'empty') throw new ApiValidationError('Ungültige Aktion')

    const trashedDocs = await db
      .select({ id: document.id, storagePath: document.storagePath })
      .from(document)
      .where(isNotNull(document.trashedAt))

    const uploadDir = process.env.UPLOAD_DIR || './uploads'
    for (const doc of trashedDocs) await removeFile(uploadDir, doc.storagePath)

    if (trashedDocs.length > 0) {
      await db.delete(document).where(isNotNull(document.trashedAt))
    }

    return jsonResponse({ success: true, deleted: trashedDocs.length })
  })
