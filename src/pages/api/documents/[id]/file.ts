import type { APIRoute } from 'astro'
import { db } from '@/db'
import { document } from '@/db/schema/documents'
import { eq } from 'drizzle-orm'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const GET: APIRoute = async ({ params, url }) => {
  const { id } = params

  const [doc] = await db
    .select()
    .from(document)
    .where(eq(document.id, id!))
    .limit(1)

  if (!doc) {
    return new Response(JSON.stringify({ error: 'Dokument nicht gefunden' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const uploadDir = process.env.UPLOAD_DIR || './uploads'
  const buffer = await readFile(join(uploadDir, doc.storagePath))

  const headers: Record<string, string> = {
    'Content-Type': doc.mimeType,
  }

  if (url.searchParams.get('download') === 'true') {
    headers['Content-Disposition'] =
      `attachment; filename="${doc.name.replaceAll('"', '\\"')}"`
  } else {
    headers['Content-Disposition'] = 'inline'
  }

  return new Response(buffer, { headers })
}
