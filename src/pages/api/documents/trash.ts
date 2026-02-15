import type { APIRoute } from 'astro'
import { db } from '@/db'
import { document } from '@/db/schema/documents'
import { isNotNull } from 'drizzle-orm'
import { unlink } from 'node:fs/promises'
import { safePath, parseJsonBody, JsonParseError } from '@/lib/api-utils'

const trashRetentionDays = Number(process.env.TRASH_RETENTION_DAYS || '90')

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({ retentionDays: trashRetentionDays }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

export const POST: APIRoute = async ({ request }) => {
  let body: { action: string }
  try {
    body = await parseJsonBody<typeof body>(request)
  } catch (err) {
    if (err instanceof JsonParseError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    throw err
  }

  if (body.action !== 'empty') {
    return new Response(JSON.stringify({ error: 'Ungültige Aktion' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const trashedDocs = await db
    .select({ id: document.id, storagePath: document.storagePath })
    .from(document)
    .where(isNotNull(document.trashedAt))

  const uploadDir = process.env.UPLOAD_DIR || './uploads'

  for (const doc of trashedDocs) {
    try {
      const filePath = safePath(uploadDir, doc.storagePath)
      await unlink(filePath)
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err
    }
  }

  if (trashedDocs.length > 0) {
    await db.delete(document).where(isNotNull(document.trashedAt))
  }

  return new Response(
    JSON.stringify({ success: true, deleted: trashedDocs.length }),
    { headers: { 'Content-Type': 'application/json' } },
  )
}
